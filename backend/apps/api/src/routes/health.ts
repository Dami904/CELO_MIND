import type { FastifyInstance } from "fastify";
import { makeOk, resolveNetwork } from "@celomind/shared";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);
const isSet = (v?: string) => Boolean(v && v.trim());

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    return makeOk("health_check", NETWORK, {
      status: "ok",
      version: "1.0.0",
      network: NETWORK,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Config audit — reports which providers/keys are live (never the values themselves),
  // plus the user-visible consequence whenever something isn't configured.
  app.get("/api/health/config", async () => {
    const env = process.env;

    const providers = {
      groq: isSet(env.GROQ_API_KEY),
      gemini: isSet(env.GEMINI_API_KEY),
      cohere: isSet(env.COHERE_API_KEY),
      openrouter: isSet(env.OPENROUTER_API_KEY),
    };
    const anyAi = Object.values(providers).some(Boolean);

    const dune = {
      apiKey: isSet(env.DUNE_API_KEY),
      trendingQueryId: isSet(env.DUNE_QUERY_TRENDING_TOKENS),
      whalesQueryId: isSet(env.DUNE_QUERY_TOP_WHALES),
    };
    const duneLive = dune.apiKey && (dune.trendingQueryId || dune.whalesQueryId);
    const redis = isSet(env.UPSTASH_REDIS_URL) && isSet(env.UPSTASH_REDIS_TOKEN);

    const degraded: string[] = [];
    if (!anyAi) degraded.push("No AI provider key set → chat replies use the deterministic fallback formatter (tools still return live data).");
    if (!duneLive) degraded.push("Dune not fully wired → trending tokens & whale leaderboard fall back to GeckoTerminal/Blockscout.");
    if (!isSet(env.COINGECKO_API_KEY)) degraded.push("No CoinGecko key → price tools may hit public rate limits under load.");
    if (!redis) degraded.push("No Upstash Redis → caching is in-memory (resets on restart, not shared across instances).");

    return makeOk("config_audit", NETWORK, {
      network: NETWORK,
      forcedProvider: env.AI_PROVIDER ?? null,
      aiToolPlanning: env.AI_TOOL_PLANNING === "off" ? "off (deterministic router)" : "on",
      providers: { ...providers, anyConfigured: anyAi },
      dataSources: {
        dune: { ...dune, live: duneLive },
        coingeckoKey: isSet(env.COINGECKO_API_KEY), // public works without a key; a key lifts rate limits
        blockscoutKey: isSet(env.BLOCKSCOUT_API_KEY),
      },
      infra: {
        upstashRedis: redis,
        tursoDb: isSet(env.DATABASE_URL),
        customRpc: isSet(env.CELO_MAINNET_RPC_URL) || isSet(env.CELO_RPC_URL),
      },
      degraded,
      healthy: degraded.length === 0,
      timestamp: new Date().toISOString(),
    });
  });
}
