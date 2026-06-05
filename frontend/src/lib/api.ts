// Real backend client for the CeloMind API. Talks to the Fastify backend (default :3001),
// not a mock. Adapts the backend's response envelope into the card model the UI renders.
//
// Backend chat contract:
//   POST /api/chat { message, walletAddress?, chatbotType, conversationId? }
//   -> { success, data: { reply, intent, aiProvider, intentData, conversationId }, uiHints: { type } }
// Write actions arrive with uiHints.type === "confirmation_required" and a prepared, unsigned tx
// (intentData.transactions[] or intentData.transaction) that the user's wallet must sign.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:3001";

export type CardColor = "green" | "yellow" | "red" | "default";

export interface PreparedTransaction {
  to: string;
  data: string;
  value: string;
  type?: string;
  description?: string;
}

export interface ResultCardData {
  title: string;
  data: { label: string; value: string; color?: CardColor }[];
}

export interface PendingTxData {
  title: string;
  data: { label: string; value: string }[];
  transactions: PreparedTransaction[];
}

export interface MessageResponse {
  success: boolean;
  message: string;
  intent?: string;
  data?: { resultCard?: ResultCardData; pendingTx?: PendingTxData };
}

export interface ChatHistoryMessage {
  id: number;
  conversationId: string | null;
  chatbotType: string;
  role: string;
  content: string;
  intent: string | null;
  walletAddress: string | null;
  timestamp: string;
}

export interface ChatHistoryResponse {
  scope: "wallet" | "conversation";
  walletAddress: string | null;
  conversationId: string | null;
  count: number;
  messages: ChatHistoryMessage[];
}

interface ApiEnvelope<T> {
  success: boolean;
  action: string;
  network: string;
  data: T | null;
  error: { code: string; message: string } | null;
  timestamp: string;
  uiHints?: { type?: string };
}

interface ChatData {
  reply: string;
  intent: string;
  aiProvider: string;
  intentData: unknown;
  conversationId?: string;
}

// ── Generic GET helper (dashboard cards) ──────────────────────────────────────
export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const env = (await res.json()) as ApiEnvelope<T>;
    return env.success ? env.data : null;
  } catch {
    return null;
  }
}

// ── Helpers for shaping intentData into cards ─────────────────────────────────
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Unwrap the `{ items|result, source }` envelope the backend uses for data intents. */
function unwrap(data: unknown): { payload: unknown; source?: string } {
  if (isObj(data) && "source" in data && ("items" in data || "result" in data)) {
    return { payload: (data.items ?? data.result) as unknown, source: data.source as string | undefined };
  }
  return { payload: data };
}

function riskColor(level?: string): CardColor {
  const l = (level ?? "").toLowerCase();
  if (l.includes("high") || l.includes("critical")) return "red";
  if (l.includes("med")) return "yellow";
  if (l.includes("low") || l.includes("safe")) return "green";
  return "default";
}

function short(addr?: string): string {
  if (!addr) return "—";
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

/** Pull a signable tx list out of intentData (array form or singular `transaction`). */
function extractTransactions(intentData: unknown): PreparedTransaction[] {
  if (!isObj(intentData)) return [];
  if (Array.isArray(intentData.transactions)) return intentData.transactions as PreparedTransaction[];
  if (isObj(intentData.transaction)) {
    const t = intentData.transaction as Record<string, unknown>;
    if (typeof t.to === "string") {
      return [{ to: t.to, data: String(t.data ?? "0x"), value: String(t.value ?? "0"), type: "transfer" }];
    }
  }
  return [];
}

function buildPendingTx(intent: string, intentData: unknown, transactions: PreparedTransaction[]): PendingTxData {
  const d = isObj(intentData) ? intentData : {};
  const rows: { label: string; value: string }[] = [];
  const steps = transactions.map((t) => t.type ?? "tx").join(" → ");

  if (intent === "swap_execute" && isObj(d.quote)) {
    const q = d.quote as Record<string, unknown>;
    rows.push({ label: "Action", value: "Swap Tokens" });
    rows.push({ label: "From", value: `${q.amountIn ?? "?"} ${q.fromToken ?? ""}` });
    rows.push({ label: "To (est.)", value: `${q.amountOut ?? "?"} ${q.toToken ?? ""}` });
    if (q.route) rows.push({ label: "Route", value: String(q.route) });
    if (d.minAmountOut) rows.push({ label: "Min received", value: String(d.minAmountOut) });
  } else if (intent === "aave_supply") {
    rows.push({ label: "Action", value: "Supply to Aave V3" });
    rows.push({ label: "Asset", value: String(d.asset ?? "") });
    rows.push({ label: "Amount", value: String(d.amount ?? "") });
  } else {
    // send / x402_pay / generic transfer
    rows.push({ label: "Action", value: intent === "x402_pay" ? "x402 Payment" : "Transfer" });
    if (d.token) rows.push({ label: "Asset", value: String(d.token) });
    if (d.amount) rows.push({ label: "Amount", value: String(d.amount) });
    if (d.to) rows.push({ label: "Recipient", value: String(d.to) });
  }

  if (steps) rows.push({ label: "Steps", value: steps });
  rows.push({ label: "Signed by", value: "Your wallet (backend never signs)" });

  const title =
    intent === "swap_execute"
      ? "Swap Tokens"
      : intent === "aave_supply"
        ? "Aave V3 Supply"
        : intent === "x402_pay"
          ? "x402 Payment"
          : "Token Transfer";
  return { title, data: rows, transactions };
}

function rowsFrom(pairs: [string, unknown, CardColor?][]): ResultCardData["data"] {
  return pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([label, value, color]) => ({ label, value: String(value), color }));
}

/** Best-effort: turn structured intentData into a result card. Returns undefined for text-only intents. */
function buildResultCard(intent: string, intentData: unknown): ResultCardData | undefined {
  if (!intentData) return undefined;
  if (isObj(intentData) && "note" in intentData && Object.keys(intentData).length <= 2) return undefined; // a plain note → text bubble only
  const { payload } = unwrap(intentData);

  switch (intent) {
    case "balance": {
      const b = payload as Record<string, unknown>;
      return { title: "Wallet Balance", data: rowsFrom([["CELO", `${b?.balance ?? "?"} CELO`, "green"]]) };
    }
    case "wallet_portfolio":
    case "token_balance": {
      const items = Array.isArray(payload) ? payload.slice(0, 8) : [];
      if (!items.length) return undefined;
      return {
        title: "Wallet Portfolio",
        data: items.map((it) => {
          const t = it as Record<string, unknown>;
          const usd = t.usdValue ? ` ($${t.usdValue})` : "";
          return { label: String(t.symbol ?? t.name ?? "Token"), value: `${t.balance ?? "?"}${usd}` };
        }),
      };
    }
    case "token_info": {
      const t = payload as Record<string, unknown>;
      return {
        title: `${t?.name ?? "Token"} (${t?.symbol ?? "?"})`,
        data: rowsFrom([
          ["Price", t?.usdPrice ? `$${t.usdPrice}` : undefined],
          ["Holders", t?.holdersCount ? Number(t.holdersCount).toLocaleString() : undefined],
          ["Market cap", t?.circulatingMarketCap ? `$${Number(t.circulatingMarketCap).toLocaleString()}` : undefined],
        ]),
      };
    }
    case "token_price": {
      const p = payload as Record<string, unknown>;
      const fmt = (x: unknown) => {
        if (isObj(x) && typeof x.usd === "number") {
          const change = typeof x.usd_24h_change === "number" ? ` (${x.usd_24h_change >= 0 ? "+" : ""}${x.usd_24h_change.toFixed(2)}% 24h)` : "";
          return `$${x.usd.toFixed(6)}${change}`;
        }
        return null;
      };
      const entries = Object.entries(p).filter(([, value]) => isObj(value) || value === null);
      if (!entries.length) return undefined;
      const rows = rowsFrom(entries.map(([label, value]) => [label, fmt(value) ?? "Unavailable", "green"] as [string, unknown, CardColor?]));
      return { title: entries.length === 1 ? `${entries[0][0]} Price` : "Token Prices", data: rows };
    }
    case "market_trending":
    case "recent_launches": {
      const items = Array.isArray(payload) ? payload.slice(0, 6) : [];
      if (!items.length) return undefined;
      return {
        title: intent === "market_trending" ? "Trending Celo Tokens" : "Recently Launched",
        data: items.map((it) => {
          const t = it as Record<string, unknown>;
          return { label: String(t.name ?? t.symbol ?? "Pool"), value: t.priceUsd ? `$${t.priceUsd}` : "—" };
        }),
      };
    }
    case "swap_quote": {
      const q = payload as Record<string, unknown>;
      if (!q?.amountOut) return undefined;
      return {
        title: "Swap Quote",
        data: rowsFrom([
          ["From", `${q.amountIn} ${q.fromToken}`],
          ["To (est.)", `${q.amountOut} ${q.toToken}`, "green"],
          ["Route", q.route],
          ["Rate", typeof q.rate === "number" ? `1 ${q.fromToken} ≈ ${(q.rate as number).toFixed(6)} ${q.toToken}` : undefined],
        ]),
      };
    }
    case "aave_position": {
      const p = payload as Record<string, unknown>;
      if (!p || p.hasPosition === false) return { title: "Aave V3 Position", data: [{ label: "Status", value: "No active position" }] };
      return {
        title: "Aave V3 Position",
        data: rowsFrom([
          ["Collateral", `$${p.totalCollateralUsd}`],
          ["Debt", `$${p.totalDebtUsd}`],
          ["Available to borrow", `$${p.availableBorrowsUsd}`],
          ["Health factor", p.healthFactor, "green"],
        ]),
      };
    }
    case "contract_risk":
    case "token_risk":
    case "malicious_tx_check":
    case "transaction_explain": {
      const r = payload as Record<string, unknown>;
      const level = r?.riskLevel as string | undefined;
      return {
        title: "Risk Assessment",
        data: rowsFrom([
          ["Risk level", level ? level.toUpperCase() : "Unknown", riskColor(level)],
          ["Score", typeof r?.riskScore === "number" ? `${r.riskScore}/100` : undefined],
          ["Recommendation", r?.recommendation],
        ]),
      };
    }
    case "recent_transactions": {
      const txs = Array.isArray(payload) ? payload.slice(0, 6) : [];
      if (!txs.length) return undefined;
      return {
        title: "Recent Transactions",
        data: txs.map((it) => {
          const t = it as Record<string, unknown>;
          const ok = t.status === "ok" || t.result === "success" || t.isError === "0";
          return { label: short(String(t.hash ?? "")), value: ok ? "success" : "failed/pending", color: (ok ? "green" : "red") as CardColor };
        }),
      };
    }
    case "whale_watch":
    case "whale_activity": {
      const { payload } = unwrap(intentData);
      if (Array.isArray(payload)) {
        const items = payload.slice(0, 10);
        if (!items.length) return undefined;
        return {
          title: "Whale Leaderboard",
          data: items.map((it, i) => {
            const w = it as Record<string, unknown>;
            const addrRaw =
              (w.address && typeof w.address === "object" ? (w.address as Record<string, unknown>).hash : w.address) ??
              w.wallet ?? w.holder ?? w.name;
            const val = w.value ?? w.balance ?? w.usdValue ?? w.amount ?? w.total;
            return { label: `${i + 1}. ${short(String(addrRaw ?? "unknown"))}`, value: val ? String(val) : "—" };
          }),
        };
      }
      const w = intentData as Record<string, unknown>;
      return {
        title: "Whale Wallet Activity",
        data: rowsFrom([
          ["Wallet", short(w?.address as string)],
          ["Native balance", w?.nativeBalance ? `${w.nativeBalance} CELO` : undefined],
          ["Tx fetched", w?.txCount],
        ]),
      };
    }
    case "copy_wallet_analyze":
    case "copy_wallet_prepare": {
      const c = intentData as Record<string, unknown>;
      return {
        title: "Copy-Wallet Analysis (review only)",
        data: rowsFrom([
          ["Source", short(c?.sourceWallet as string)],
          ["Your wallet", short(c?.myWallet as string)],
          ["Tokens to add", Array.isArray(c?.tokensToAdd) ? (c.tokensToAdd as string[]).join(", ") || "none" : undefined],
        ]),
      };
    }
    default:
      return undefined;
  }
}

export const apiClient = {
  async sendMessage(
    message: string,
    walletAddress?: string,
    chatbotType: "full" | "mini" | "landing" | "docs" | "tool" = "full",
    conversationId?: string
  ): Promise<MessageResponse> {
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, walletAddress, chatbotType, conversationId }),
      });
      const env = (await res.json()) as ApiEnvelope<ChatData>;
      if (!env.success || !env.data) {
        return { success: false, message: env.error?.message || "The backend could not process that request." };
      }

      const { reply, intent, intentData } = env.data;
      const type = env.uiHints?.type;

      if (type === "confirmation_required") {
        const transactions = extractTransactions(intentData);
        if (transactions.length > 0) {
          return { success: true, message: reply, intent, data: { pendingTx: buildPendingTx(intent, intentData, transactions) } };
        }
        // Prepared/review-only (e.g. copy_wallet_prepare, x402 info) → show as a card, no signer.
        return { success: true, message: reply, intent, data: { resultCard: buildResultCard(intent, intentData) } };
      }

      return { success: true, message: reply, intent, data: { resultCard: buildResultCard(intent, intentData) } };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? `Could not reach the CeloMind backend (${API_BASE}). ${error.message}`
            : "Unknown error",
      };
    }
  },

  async getChatHistory(
    walletAddress?: string,
    conversationId?: string,
    limit = 200
  ): Promise<ChatHistoryResponse | null> {
    try {
      const params = new URLSearchParams();
      if (walletAddress) params.set("walletAddress", walletAddress);
      if (conversationId) params.set("conversationId", conversationId);
      params.set("limit", String(limit));

      const res = await fetch(`${API_BASE}/api/chat/history?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const env = (await res.json()) as ApiEnvelope<ChatHistoryResponse>;
      return env.success ? env.data : null;
    } catch {
      return null;
    }
  },
};
