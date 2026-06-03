import { z } from "zod";

// ─── Standard API response ────────────────────────────────────────────────────
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  network: z.literal("celo"),
  data: z.unknown().nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .nullable(),
  timestamp: z.string().datetime(),
  uiHints: z
    .object({
      type: z.enum([
        "confirmation_required",
        "result_card",
        "risk_card",
        "token_card",
        "portfolio_card",
        "transaction_card",
        "docs_answer",
        "error_card",
      ]),
      extra: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export type ApiResponse<T = unknown> = {
  success: boolean;
  action: string;
  network: "celo";
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  timestamp: string;
  uiHints?: {
    type:
      | "confirmation_required"
      | "result_card"
      | "risk_card"
      | "token_card"
      | "portfolio_card"
      | "transaction_card"
      | "docs_answer"
      | "error_card";
    extra?: Record<string, unknown>;
  };
};

export function makeOk<T>(action: string, network: "celo", data: T, uiHints?: ApiResponse["uiHints"]): ApiResponse<T> {
  return { success: true, action, network, data, error: null, timestamp: new Date().toISOString(), uiHints };
}

export function makeErr(action: string, network: "celo", code: string, message: string, details?: unknown): ApiResponse<null> {
  return {
    success: false,
    action,
    network,
    data: null,
    error: { code, message, details },
    timestamp: new Date().toISOString(),
    uiHints: { type: "error_card" },
  };
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const ChatRequestSchema = z.object({
  message: z.string().min(1),
  walletAddress: z.string().optional(),
  chatbotType: z.enum(["full", "mini", "landing", "docs", "tool"]),
  pageContext: z.string().optional(),
  selectedTool: z.string().optional(),
  conversationId: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ─── Wallet / Balance ─────────────────────────────────────────────────────────
export const WalletAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address");

export const BalanceSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  address: z.string(),
  balance: z.string(),
  balanceRaw: z.string(),
  decimals: z.number(),
  usdValue: z.string().optional(),
});

// ─── Risk ─────────────────────────────────────────────────────────────────────
export const RiskCheckRequestSchema = z.object({
  type: z.enum(["transaction", "contract", "token"]),
  target: z.string(),
  walletAddress: z.string().optional(),
  network: z.literal("celo").default("celo"),
});
export type RiskCheckRequest = z.infer<typeof RiskCheckRequestSchema>;

// ─── Whale watch ──────────────────────────────────────────────────────────────
export const WhaleWatchRequestSchema = z.object({
  walletAddress: z.string(),
  network: z.literal("celo").default("celo"),
  label: z.string().optional(),
});
export type WhaleWatchRequest = z.infer<typeof WhaleWatchRequestSchema>;

// ─── Tool run ─────────────────────────────────────────────────────────────────
export const ToolRunRequestSchema = z.object({
  params: z.record(z.unknown()),
  walletAddress: z.string().optional(),
  network: z.literal("celo").default("celo"),
});
export type ToolRunRequest = z.infer<typeof ToolRunRequestSchema>;

// ─── Intents ──────────────────────────────────────────────────────────────────
export const INTENTS = [
  "docs_explain",
  "balance",
  "token_balance",
  "send",
  "swap_quote",
  "swap_execute",
  "aave_position",
  "aave_supply",
  "self_verify",
  "agent_id_check",
  "x402_pay",
  "market_trending",
  "token_info",
  "token_price",
  "wallet_portfolio",
  "recent_transactions",
  "recent_launches",
  "malicious_tx_check",
  "contract_risk",
  "token_risk",
  "whale_watch",
  "whale_activity",
  "copy_wallet_analyze",
  "copy_wallet_prepare",
  "transaction_explain",
  "mcp_setup",
  "claude_setup",
  "unsupported",
] as const;

export type Intent = (typeof INTENTS)[number];
