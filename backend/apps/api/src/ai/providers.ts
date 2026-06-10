/**
 * Multi-provider AI abstraction.
 * Active providers: Groq, Cohere, OpenRouter, Google Gemini.
 *
 * Selection is TASK-BASED: each intent is routed to the provider/model best
 * suited to it (see INTENT_ROUTES below). If the chosen provider fails
 * (quota, outage, bad response), aiComplete() automatically fails over to the
 * other configured providers so a single rate limit never breaks chat.
 *
 * Override knobs (all optional, via .env):
 *   AI_PROVIDER            force a single provider for every request
 *   GROQ_MODEL_FAST        default: llama-3.1-8b-instant
 *   GROQ_MODEL_SMART       default: llama-3.3-70b-versatile
 *   COHERE_MODEL           default: command-a-03-2025
 *   OPENROUTER_MODEL       default: meta-llama/llama-3.3-70b-instruct
 *   GEMINI_MODEL           default: gemini-3.1-flash-lite
 */

export type AIProvider = "groq" | "cohere" | "openrouter" | "gemini";

export type AIMessage = { role: "system" | "user" | "assistant"; content: string };

export type AICompletionOptions = {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Force a specific provider (overrides task routing). */
  provider?: AIProvider;
  /** Force a specific model on the primary provider. */
  model?: string;
};

export type AICompletionResult = {
  text: string;
  provider: AIProvider;
  model: string;
};

// ─── Groq (OpenAI-compatible) ─────────────────────────────────────────────────
async function callGroq(opts: AICompletionOptions, model: string): Promise<AICompletionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, provider: "groq", model };
}

// ─── Cohere (v2 chat) ─────────────────────────────────────────────────────────
async function callCohere(opts: AICompletionOptions, model: string): Promise<AICompletionResult> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY not set");
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`Cohere error: ${res.status}`);
  const data = (await res.json()) as { message: { content: { type: string; text: string }[] } };
  const text = data.message?.content?.find((c) => c.type === "text")?.text ?? "";
  return { text, provider: "cohere", model };
}

// ─── OpenRouter (OpenAI-compatible meta-router) ───────────────────────────────
async function callOpenRouter(opts: AICompletionOptions, model: string): Promise<AICompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.OPENROUTER_SITE ?? "https://celomind.app",
      "X-Title": "CeloMind",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, provider: "openrouter", model };
}

// ─── Google Gemini ────────────────────────────────────────────────────────────
async function callGemini(opts: AICompletionOptions, model: string): Promise<AICompletionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const systemMsg = opts.messages.find((m) => m.role === "system")?.content ?? "";
  const userMsg = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const prompt = systemMsg ? `${systemMsg}\n\n${userMsg}` : userMsg;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 1024, temperature: opts.temperature ?? 0.7 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = (await res.json()) as { candidates: { content: { parts: { text: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { text, provider: "gemini", model };
}

// ─── Default model per provider ───────────────────────────────────────────────
function defaultModel(provider: AIProvider): string {
  switch (provider) {
    case "groq": return process.env.GROQ_MODEL_FAST ?? "llama-3.1-8b-instant";
    case "cohere": return process.env.COHERE_MODEL ?? "command-a-03-2025";
    case "openrouter": return process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct";
    case "gemini": return process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
  }
}

async function callProvider(provider: AIProvider, opts: AICompletionOptions, model: string): Promise<AICompletionResult> {
  switch (provider) {
    case "groq": return callGroq(opts, model);
    case "cohere": return callCohere(opts, model);
    case "openrouter": return callOpenRouter(opts, model);
    case "gemini": return callGemini(opts, model);
  }
}

// ─── Task-based routing ───────────────────────────────────────────────────────
// Each route names the provider whose strengths fit the work, plus the model.
type Route = { provider: AIProvider; model: string };

// Fast structured data → Groq's instant 8B (low latency, generous free tier).
const FAST = (): Route => ({ provider: "groq", model: process.env.GROQ_MODEL_FAST ?? "llama-3.1-8b-instant" });
// Security / risk / analysis → Groq's 70B (stronger reasoning, tool-capable).
const REASON = (): Route => ({ provider: "groq", model: process.env.GROQ_MODEL_SMART ?? "llama-3.3-70b-versatile" });
// Educational / docs grounding → Cohere Command-A (RAG-optimized).
const GROUNDED = (): Route => ({ provider: "cohere", model: process.env.COHERE_MODEL ?? "command-a-03-2025" });
// Catch-all default → Gemini flash-lite (high daily quota, reliable).
const DEFAULT_ROUTE = (): Route => ({ provider: "gemini", model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite" });

const INTENT_ROUTES: Record<string, () => Route> = {
  // Security / risk reasoning — accuracy first
  contract_risk: REASON, token_risk: REASON, malicious_tx_check: REASON,
  transaction_explain: REASON, copy_wallet_analyze: REASON, copy_wallet_prepare: REASON,
  whale_activity: REASON, whale_watch: REASON,
  // Educational / docs grounding — RAG-strong model
  docs_explain: GROUNDED, mcp_setup: GROUNDED, claude_setup: GROUNDED,
  self_verify: GROUNDED, x402_pay: GROUNDED,
  // Fast structured data formatting
  balance: FAST, token_balance: FAST, token_price: FAST, token_info: FAST,
  market_trending: FAST, recent_launches: FAST, wallet_portfolio: FAST,
  recent_transactions: FAST, swap_quote: FAST, aave_position: FAST,
  agent_id_check: GROUNDED,
  send: FAST, swap_execute: FAST, aave_supply: FAST,
  // "What's happening on Celo" — many live signals synthesized into a narrative; needs the smart model
  network_pulse: REASON,
  // New live-data intents — structured results, fast model is ideal
  gas_price: FAST, defi_protocols: FAST, network_stats: FAST, price_history: FAST,
  top_pools: FAST, token_search: FAST, token_holders: FAST,
  wallet_stats: FAST, nft_balances: FAST, yield_info: FAST,
  // Transaction lookup and filtering
  get_transaction: REASON, filtered_transactions: FAST,
  // Wallet comparison and risk
  compare_wallets: REASON, portfolio_risk_score: REASON,
};

/** The provider+model best suited to a given intent. */
export function routeForIntent(intent: string): Route {
  return (INTENT_ROUTES[intent] ?? DEFAULT_ROUTE)();
}

/**
 * Model for the USER-FACING answer (and the agentic reasoning that writes it). Answer quality
 * matters most here, so this uses the strongest available model rather than the fast planner model.
 * Defaults to the 70B reasoning model (still fast on Groq). For top-tier answers, point
 * AI_SYNTH_PROVIDER + AI_SYNTH_MODEL at OpenRouter + a Claude model, e.g.:
 *   AI_SYNTH_PROVIDER=openrouter
 *   AI_SYNTH_MODEL=anthropic/claude-sonnet-4.5
 */
export function synthesisRoute(): Route {
  const provider = process.env.AI_SYNTH_PROVIDER as AIProvider | undefined;
  const model = process.env.AI_SYNTH_MODEL;
  if (provider && model) return { provider, model };
  return REASON();
}

// ─── Provider availability & failover ─────────────────────────────────────────
function configuredProviders(): AIProvider[] {
  const list: AIProvider[] = [];
  if (process.env.GROQ_API_KEY) list.push("groq");
  if (process.env.COHERE_API_KEY) list.push("cohere");
  if (process.env.GEMINI_API_KEY) list.push("gemini");
  if (process.env.OPENROUTER_API_KEY) list.push("openrouter");
  return list;
}

/**
 * Complete a chat request. Picks the primary provider from (in order):
 * opts.provider → AI_PROVIDER env → first configured provider, then fails over
 * to every other configured provider if the primary errors.
 */
export async function aiComplete(opts: AICompletionOptions): Promise<AICompletionResult> {
  const available = configuredProviders();
  if (available.length === 0) {
    throw new Error("No AI provider configured — set GROQ_API_KEY / COHERE_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY.");
  }

  const forced = (process.env.AI_PROVIDER as AIProvider | undefined) || undefined;
  const primary = forced ?? opts.provider ?? available[0];
  const primaryModel = (primary === opts.provider && opts.model) ? opts.model : defaultModel(primary);

  // Try primary first (with its task-routed model), then the rest with their defaults.
  const order: { provider: AIProvider; model: string }[] = [
    { provider: primary, model: primaryModel },
    ...available.filter((p) => p !== primary).map((p) => ({ provider: p, model: defaultModel(p) })),
  ];

  let lastErr: unknown;
  for (const { provider, model } of order) {
    try {
      const result = await callProvider(provider, opts, model);
      if (result.text.trim()) return result;
      lastErr = new Error(`${provider} returned empty response`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All AI providers failed");
}
