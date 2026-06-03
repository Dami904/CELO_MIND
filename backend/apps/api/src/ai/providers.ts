/**
 * Multi-provider AI abstraction.
 * Supports: Claude (Anthropic), OpenAI/ChatGPT, Google Gemini, DeepSeek, Ollama (local).
 * Set AI_PROVIDER in .env to switch. Falls back to Claude if ANTHROPIC_API_KEY is set.
 */

export type AIProvider = "claude" | "openai" | "gemini" | "deepseek" | "ollama";

export type AIMessage = { role: "system" | "user" | "assistant"; content: string };

export type AICompletionOptions = {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type AICompletionResult = {
  text: string;
  provider: AIProvider;
  model: string;
};

// ─── Claude (Anthropic) ───────────────────────────────────────────────────────
async function callClaude(opts: AICompletionOptions): Promise<AICompletionResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = opts.messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = opts.messages.filter((m) => m.role !== "system");
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  const res = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    system,
    messages: userMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  return { text, provider: "claude", model };
}

// ─── OpenAI / ChatGPT ─────────────────────────────────────────────────────────
async function callOpenAI(opts: AICompletionOptions): Promise<AICompletionResult> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const text = res.choices[0]?.message?.content ?? "";
  return { text, provider: "openai", model };
}

// ─── Google Gemini ────────────────────────────────────────────────────────────
async function callGemini(opts: AICompletionOptions): Promise<AICompletionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
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

// ─── DeepSeek ─────────────────────────────────────────────────────────────────
async function callDeepSeek(opts: AICompletionOptions): Promise<AICompletionResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set");
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek error: ${res.status}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, provider: "deepseek", model };
}

// ─── Ollama (local) ───────────────────────────────────────────────────────────
async function callOllama(opts: AICompletionOptions): Promise<AICompletionResult> {
  const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "llama3";
  const systemMsg = opts.messages.find((m) => m.role === "system")?.content ?? "";
  const prompt = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, system: systemMsg, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { response: string };
  return { text: data.response ?? "", provider: "ollama", model };
}

// ─── Provider selection ───────────────────────────────────────────────────────
function detectProvider(): AIProvider {
  const explicit = process.env.AI_PROVIDER as AIProvider | undefined;
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return "ollama";
}

export async function aiComplete(opts: AICompletionOptions): Promise<AICompletionResult> {
  const provider = detectProvider();
  switch (provider) {
    case "claude": return callClaude(opts);
    case "openai": return callOpenAI(opts);
    case "gemini": return callGemini(opts);
    case "deepseek": return callDeepSeek(opts);
    case "ollama": return callOllama(opts);
    default: throw new Error(`Unknown AI provider: ${provider}`);
  }
}
