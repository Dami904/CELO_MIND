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
export const CeloNetworkSchema = z.literal("celo");

const SUPPORTED_CELO_TOKEN_SYMBOLS = ["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"] as const;

function canonicalCeloTokenSymbol(value: string): (typeof SUPPORTED_CELO_TOKEN_SYMBOLS)[number] | null {
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_CELO_TOKEN_SYMBOLS.find((symbol) => symbol.toLowerCase() === normalized) ?? null;
}

export const SupportedCeloTokenSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1, "Token is required")
).transform((value, ctx) => {
  const canonical = canonicalCeloTokenSymbol(value);
  if (!canonical) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported token. Use one of: ${SUPPORTED_CELO_TOKEN_SYMBOLS.join(", ")}`,
    });
    return z.NEVER;
  }
  return canonical;
});

export const HumanAmountSchema = z.preprocess(
  (value) => (typeof value === "number" && Number.isFinite(value) ? String(value) : value),
  z.string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/, "Amount must be a positive decimal number")
    .refine((value) => Number(value) > 0, "Amount must be greater than zero")
    .refine((value) => Number(value) <= 1_000_000_000_000, "Amount is above the safety maximum")
);

export const SwapSlippageBpsSchema = z.preprocess(
  (value) => (value == null ? undefined : Number(value)),
  z.number().int().min(10, "Slippage cannot be lower than 0.1%").max(500, "Slippage exceeds safety maximum of 5.0%").default(50)
);

export const CeloTransferParamsSchema = z.object({
  to: WalletAddressSchema,
  amount: HumanAmountSchema,
  tokenSymbolOrAddress: SupportedCeloTokenSchema.optional(),
  token: SupportedCeloTokenSchema.optional(),
  network: CeloNetworkSchema.default("celo"),
  reference: z.string().trim().max(120).optional(),
}).strict().transform((value) => ({
  ...value,
  tokenSymbolOrAddress: value.tokenSymbolOrAddress ?? value.token ?? "CELO",
}));

const CeloSwapQuoteParamsBaseSchema = z.object({
  fromToken: SupportedCeloTokenSchema,
  toToken: SupportedCeloTokenSchema,
  amount: HumanAmountSchema,
  network: CeloNetworkSchema.default("celo"),
});

export const CeloSwapQuoteParamsSchema = CeloSwapQuoteParamsBaseSchema.strict();

export const CeloPreparedSwapParamsSchema = CeloSwapQuoteParamsBaseSchema.extend({
  walletAddress: WalletAddressSchema,
  slippageBps: SwapSlippageBpsSchema,
}).strict();

export type CeloTransferParams = z.infer<typeof CeloTransferParamsSchema>;
export type CeloSwapQuoteParams = z.infer<typeof CeloSwapQuoteParamsSchema>;
export type CeloPreparedSwapParams = z.infer<typeof CeloPreparedSwapParamsSchema>;

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
  "launch_token",
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
  "gas_price",
  "defi_protocols",
  "network_stats",
  "network_pulse",
  "price_history",
  "top_pools",
  "token_search",
  "token_holders",
  "wallet_stats",
  "nft_balances",
  "yield_info",
  "get_transaction",
  "filtered_transactions",
  "compare_wallets",
  "portfolio_risk_score",
  "unsupported",
] as const;

export type Intent = (typeof INTENTS)[number];
