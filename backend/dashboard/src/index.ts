import type { FastifyInstance } from "fastify";
import type { ChatRequest, Intent } from "../../packages/shared/src/index.js";

export type MetricsProvider = "claude" | "openai" | "gemini" | "deepseek" | "ollama" | "fallback";

export type RecordChatRequestInput = {
  chatbotType: ChatRequest["chatbotType"];
  intent: Intent;
  provider: MetricsProvider;
  model: string;
  fallback: boolean;
  latencyMs: number;
  walletAddress?: string;
  conversationId?: string;
};

export type RecordToolCallInput = {
  tool: string;
  success: boolean;
};

type MetricsEnvelope<T> = {
  success: true;
  action: string;
  data: T;
  error: null;
  timestamp: string;
};

type MetricsErrorEnvelope = {
  success: false;
  action: string;
  data: null;
  error: { code: string; message: string };
  timestamp: string;
};

type RedisResult<T> = { result?: T };
type HashValue = string | number | null;

const DAILY_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_TIMESERIES_DAYS = 30;
const MAX_TIMESERIES_DAYS = 90;

function todayKeyDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function envelope<T>(action: string, data: T): MetricsEnvelope<T> {
  return {
    success: true,
    action,
    data,
    error: null,
    timestamp: new Date().toISOString(),
  };
}

function errorEnvelope(action: string, message: string): MetricsErrorEnvelope {
  return {
    success: false,
    action,
    data: null,
    error: { code: "METRICS_ERROR", message },
    timestamp: new Date().toISOString(),
  };
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_URL?.replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function encodePart(part: string): string {
  return encodeURIComponent(part);
}

async function redisCommand<T>(parts: string[]): Promise<T | null> {
  const config = redisConfig();
  if (!config) return null;

  const path = parts.map((part) => encodePart(part)).join("/");
  const res = await fetch(`${config.url}/${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${config.token}` },
  });

  if (!res.ok) {
    throw new Error(`Upstash Redis command failed: ${res.status}`);
  }

  const data = (await res.json()) as RedisResult<T>;
  return data.result ?? null;
}

async function hincrby(key: string, field: string, amount: number): Promise<void> {
  await redisCommand(["hincrby", key, field, String(amount)]);
}

async function hgetall(key: string): Promise<Record<string, string>> {
  const result = await redisCommand<HashValue[] | Record<string, HashValue>>(["hgetall", key]);
  if (!result) return {};

  if (Array.isArray(result)) {
    const out: Record<string, string> = {};
    for (let i = 0; i < result.length; i += 2) {
      const keyPart = result[i];
      const valuePart = result[i + 1];
      if (keyPart !== null && keyPart !== undefined) out[String(keyPart)] = String(valuePart ?? "0");
    }
    return out;
  }

  return Object.fromEntries(Object.entries(result).map(([keyPart, valuePart]) => [keyPart, String(valuePart ?? "0")]));
}

async function pfadd(key: string, value: string): Promise<void> {
  await redisCommand(["pfadd", key, value]);
}

async function pfcount(key: string): Promise<number> {
  const result = await redisCommand<number | string>(["pfcount", key]);
  return toNumber(result);
}

async function expire(key: string, seconds: number): Promise<void> {
  await redisCommand(["expire", key, String(seconds)]);
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function hashNumber(hash: Record<string, string>, field: string): number {
  return toNumber(hash[field]);
}

function topHashKey(hash: Record<string, string>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [key, value] of Object.entries(hash)) {
    const count = toNumber(value);
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function sortedCounts(hash: Record<string, string>, keyName: string): Record<string, string | number>[] {
  return Object.entries(hash)
    .map(([key, value]) => ({ [keyName]: key, count: toNumber(value) }))
    .sort((a, b) => Number(b.count) - Number(a.count));
}

function clampDays(value: unknown): number {
  const requested = toNumber(value);
  if (!requested) return DEFAULT_TIMESERIES_DAYS;
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_TIMESERIES_DAYS);
}

function lastNDates(days: number): string[] {
  const dates: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setUTCDate(cursor.getUTCDate() - i);
    dates.push(todayKeyDate(d));
  }

  return dates;
}

export async function recordChatRequest(input: RecordChatRequestInput): Promise<void> {
  try {
    const date = todayKeyDate();
    const dailyKey = `metrics:daily:${date}`;
    const modelKey = `${input.provider}/${input.model}`;
    const latencyMs = Math.max(0, Math.round(input.latencyMs));

    await Promise.all([
      hincrby("metrics:totals", "chat_requests", 1),
      hincrby("metrics:totals", "model_calls", input.fallback ? 0 : 1),
      hincrby("metrics:totals", "fallbacks", input.fallback ? 1 : 0),
      hincrby("metrics:intents", input.intent, 1),
      hincrby("metrics:providers", input.provider, 1),
      hincrby("metrics:models", modelKey, 1),
      hincrby("metrics:chatbots", input.chatbotType, 1),
      hincrby("metrics:latency:sum", input.provider, latencyMs),
      hincrby("metrics:latency:count", input.provider, 1),
      hincrby(dailyKey, "chat_requests", 1),
      hincrby(dailyKey, "model_calls", input.fallback ? 0 : 1),
      expire(dailyKey, DAILY_TTL_SECONDS),
      input.walletAddress ? pfadd("metrics:users", input.walletAddress) : Promise.resolve(),
      input.conversationId ? pfadd("metrics:sessions", input.conversationId) : Promise.resolve(),
    ]);
  } catch {
    // Metrics must never break user-facing requests.
  }
}

export async function recordToolCall(input: RecordToolCallInput): Promise<void> {
  try {
    const dailyKey = `metrics:daily:${todayKeyDate()}`;
    await Promise.all([
      hincrby("metrics:totals", "tool_calls", 1),
      hincrby("metrics:totals", "errors", input.success ? 0 : 1),
      hincrby("metrics:tools", input.tool, 1),
      hincrby(dailyKey, "tool_calls", 1),
      expire(dailyKey, DAILY_TTL_SECONDS),
    ]);
  } catch {
    // Metrics must never break user-facing requests.
  }
}

export async function getMetricsOverview() {
  const [totalsHash, toolsHash, intentsHash, providersHash, uniqueUsers, uniqueSessions] = await Promise.all([
    hgetall("metrics:totals"),
    hgetall("metrics:tools"),
    hgetall("metrics:intents"),
    hgetall("metrics:providers"),
    pfcount("metrics:users"),
    pfcount("metrics:sessions"),
  ]);

  const totals = {
    chatRequests: hashNumber(totalsHash, "chat_requests"),
    toolCalls: hashNumber(totalsHash, "tool_calls"),
    modelCalls: hashNumber(totalsHash, "model_calls"),
    fallbacks: hashNumber(totalsHash, "fallbacks"),
    errors: hashNumber(totalsHash, "errors"),
  };

  return envelope("metrics_overview", {
    totals,
    uniqueUsers,
    uniqueSessions,
    fallbackRate: totals.chatRequests ? totals.fallbacks / totals.chatRequests : 0,
    topTool: topHashKey(toolsHash),
    topIntent: topHashKey(intentsHash),
    topProvider: topHashKey(providersHash),
  });
}

export async function getMetricsTools() {
  const toolsHash = await hgetall("metrics:tools");
  return envelope("metrics_tools", {
    tools: sortedCounts(toolsHash, "tool"),
  });
}

export async function getMetricsModels() {
  const [providersHash, modelsHash, latencySumHash, latencyCountHash] = await Promise.all([
    hgetall("metrics:providers"),
    hgetall("metrics:models"),
    hgetall("metrics:latency:sum"),
    hgetall("metrics:latency:count"),
  ]);

  const avgLatencyMs = Object.fromEntries(
    Object.keys(latencySumHash).map((provider) => {
      const count = hashNumber(latencyCountHash, provider);
      const avg = count ? Math.round(hashNumber(latencySumHash, provider) / count) : 0;
      return [provider, avg];
    })
  );

  return envelope("metrics_models", {
    providers: sortedCounts(providersHash, "provider"),
    models: sortedCounts(modelsHash, "model"),
    avgLatencyMs,
  });
}

export async function getMetricsTimeseries(daysInput?: unknown) {
  const dates = lastNDates(clampDays(daysInput));
  const dailyHashes = await Promise.all(dates.map((date) => hgetall(`metrics:daily:${date}`)));

  return envelope("metrics_timeseries", {
    series: dates.map((date, i) => {
      const hash = dailyHashes[i] ?? {};
      return {
        date,
        chatRequests: hashNumber(hash, "chat_requests"),
        toolCalls: hashNumber(hash, "tool_calls"),
        modelCalls: hashNumber(hash, "model_calls"),
      };
    }),
  });
}

export async function metricsRoutes(app: FastifyInstance) {
  app.get("/api/metrics/overview", async (req, reply) => {
    try {
      return await getMetricsOverview();
    } catch (e) {
      return reply.code(500).send(errorEnvelope("metrics_overview", String(e)));
    }
  });

  app.get("/api/metrics/tools", async (req, reply) => {
    try {
      return await getMetricsTools();
    } catch (e) {
      return reply.code(500).send(errorEnvelope("metrics_tools", String(e)));
    }
  });

  app.get("/api/metrics/models", async (req, reply) => {
    try {
      return await getMetricsModels();
    } catch (e) {
      return reply.code(500).send(errorEnvelope("metrics_models", String(e)));
    }
  });

  app.get<{ Querystring: { days?: string } }>("/api/metrics/timeseries", async (req, reply) => {
    try {
      return await getMetricsTimeseries(req.query.days);
    } catch (e) {
      return reply.code(500).send(errorEnvelope("metrics_timeseries", String(e)));
    }
  });
}
