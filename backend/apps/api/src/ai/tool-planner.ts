import { z } from "zod";
import {
  CeloPreparedSwapParamsSchema,
  CeloSwapQuoteParamsSchema,
  CeloTransferParamsSchema,
  INTENTS,
  type ChatRequest,
  type Intent,
} from "@celomind/shared";
import { aiComplete, routeForIntent, type AIMessage } from "./providers.js";
import { resolveIntent } from "./intent-router.js";

export type ChatToolPlan = {
  intent: Intent;
  args: Record<string, unknown>;
  clarification?: string;
  source: "ai_tool_planner" | "deterministic_router";
  plannerProvider?: string;
  plannerModel?: string;
};

type PlannerInput = {
  message: string;
  chatbotType: ChatRequest["chatbotType"];
  walletAddress?: string;
  conversationSummary?: string | null;
  conversationMemory?: AIMessage[];
};

const ToolPlanResponseSchema = z.object({
  intent: z.enum(INTENTS),
  args: z.record(z.unknown()).default({}),
  clarification: z.string().trim().optional(),
});

const TOOL_CATALOG = [
  {
    intent: "balance",
    description: "Native CELO balance for the connected wallet or provided wallet address.",
    required: ["walletAddress from app context or message"],
  },
  {
    intent: "token_balance",
    description: "Specific token balance such as cUSD, cEUR, cREAL, USDC, USDT, WBTC. Do not use native CELO balance here.",
    args: { tokenSymbolOrAddress: "optional token symbol/address; required for a specific token request" },
  },
  {
    intent: "wallet_portfolio",
    description: "All token holdings/portfolio for a wallet.",
  },
  {
    intent: "swap_quote",
    description: "Read-only swap quote. Use for quote/rate/how much would I get; never prepares a transaction.",
    args: { fromToken: "supported Celo token", toToken: "supported Celo token", amount: "positive decimal string" },
  },
  {
    intent: "swap_execute",
    description: "Prepare a signable swap transaction only when the user clearly asks to swap/trade/exchange an amount.",
    args: { fromToken: "supported Celo token", toToken: "supported Celo token", amount: "positive decimal string" },
  },
  {
    intent: "send",
    description: "Prepare a signable transfer only when the user clearly asks to send/transfer/pay funds.",
    args: { to: "0x recipient address", amount: "positive decimal string", tokenSymbolOrAddress: "supported Celo token, default CELO if unclear" },
  },
  {
    intent: "whale_watch",
    description: "Top whale leaderboard or large-holder list. Use when no specific wallet activity address is requested.",
  },
  {
    intent: "whale_activity",
    description: "Activity for one specific whale wallet. Requires a wallet address; ask clarification if missing.",
    args: { address: "0x wallet address" },
  },
  {
    intent: "gas_price",
    description: "Current Celo gas price only. Historical gas charts are unsupported.",
  },
  {
    intent: "contract_risk",
    description: "Risk/audit/safety check for a smart contract. Requires contract address.",
    args: { contractAddress: "0x contract address" },
  },
  {
    intent: "token_risk",
    description: "Risk/honeypot/rug-pull check for a token. Requires token address.",
    args: { tokenAddress: "0x token address" },
  },
  {
    intent: "token_price",
    description: "Current token price for CELO/cUSD/cEUR/cREAL/USDC/USDT/WBTC or all supported Celo tokens.",
    args: { tokenSymbolOrAddress: "optional token symbol/address" },
  },
  {
    intent: "price_history",
    description: "Historical price chart for a specific supported Celo token. Requires token symbol.",
    args: { tokenSymbolOrAddress: "supported token symbol", days: "optional number of days" },
  },
  {
    intent: "recent_transactions",
    description: "Recent transaction history for a wallet.",
  },
  {
    intent: "docs_explain",
    description: "General Celo/Mento/Aave/MCP/Self/x402/docs/concept questions that are not asking for live wallet or market data.",
  },
  {
    intent: "unsupported",
    description: "Out-of-scope, ambiguous, or unsupported request. Include a short clarification if a missing field would resolve it.",
  },
] as const;

const WRITE_INTENTS: Intent[] = ["send", "swap_execute", "aave_supply", "x402_pay", "copy_wallet_prepare"];

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Planner did not return JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

function fallbackPlan(input: PlannerInput): ChatToolPlan {
  const resolved = resolveIntent(input.message, input.chatbotType);
  return {
    intent: resolved.intent,
    args: {},
    clarification: resolved.clarification,
    source: "deterministic_router",
  };
}

function validationClarification(intent: Intent, message: string): string {
  switch (intent) {
    case "send":
      return `Tell me the amount, supported token, and valid recipient address, e.g. "${message.includes("transfer") ? "transfer" : "send"} 1 CELO to 0x1234567890123456789012345678901234567890".`;
    case "swap_quote":
    case "swap_execute":
      return "Tell me the amount and supported Celo tokens, e.g. \"swap quote for 10 CELO to cUSD\".";
    case "whale_activity":
      return "Send the whale wallet address you want me to inspect, or ask for the Whale Leaderboard instead.";
    case "contract_risk":
      return "Send the contract address (0x...) and I’ll check it for risk.";
    case "token_risk":
      return "Send the token contract address (0x...) and I’ll check it for risk.";
    case "price_history":
      return "Which supported Celo token's price history do you want?";
    default:
      return "I need one more detail before I can do that.";
  }
}

function validatePlan(plan: ChatToolPlan, input: PlannerInput): ChatToolPlan {
  if (input.chatbotType === "landing" && WRITE_INTENTS.includes(plan.intent)) {
    return { ...plan, intent: "unsupported", args: {}, clarification: "Connect the full app before preparing wallet actions." };
  }

  if (plan.clarification) return plan;

  switch (plan.intent) {
    case "send": {
      const parsed = CeloTransferParamsSchema.safeParse({
        to: plan.args.to ?? plan.args.recipientAddress,
        amount: plan.args.amount,
        tokenSymbolOrAddress: plan.args.tokenSymbolOrAddress ?? plan.args.tokenSymbol ?? plan.args.token ?? "CELO",
      });
      return parsed.success
        ? { ...plan, args: parsed.data }
        : { ...plan, clarification: validationClarification(plan.intent, input.message) };
    }
    case "swap_quote": {
      const parsed = CeloSwapQuoteParamsSchema.safeParse({
        fromToken: plan.args.fromToken ?? plan.args.tokenIn,
        toToken: plan.args.toToken ?? plan.args.tokenOut,
        amount: plan.args.amount ?? plan.args.amountIn,
      });
      return parsed.success
        ? { ...plan, args: parsed.data }
        : { ...plan, clarification: validationClarification(plan.intent, input.message) };
    }
    case "swap_execute": {
      const parsed = CeloPreparedSwapParamsSchema.safeParse({
        fromToken: plan.args.fromToken ?? plan.args.tokenIn,
        toToken: plan.args.toToken ?? plan.args.tokenOut,
        amount: plan.args.amount ?? plan.args.amountIn,
        walletAddress: input.walletAddress ?? plan.args.walletAddress,
        slippageBps: plan.args.slippageBps,
      });
      if (!input.walletAddress && parsed.success) {
        return { ...plan, clarification: "Connect your wallet first — I prepare the swap, your wallet signs it." };
      }
      return parsed.success
        ? { ...plan, args: parsed.data }
        : { ...plan, clarification: validationClarification(plan.intent, input.message) };
    }
    case "whale_activity":
      if (!plan.args.address && !input.walletAddress) return { ...plan, clarification: validationClarification(plan.intent, input.message) };
      return plan;
    case "contract_risk":
    case "token_risk":
      if (!plan.args.contractAddress && !plan.args.tokenAddress && !plan.args.address) {
        return { ...plan, clarification: validationClarification(plan.intent, input.message) };
      }
      return plan;
    case "price_history":
      if (!plan.args.tokenSymbolOrAddress && !plan.args.tokenSymbol && !plan.args.token) return { ...plan, clarification: validationClarification(plan.intent, input.message) };
      return plan;
    default:
      return plan;
  }
}

export async function planChatTool(input: PlannerInput): Promise<ChatToolPlan> {
  const fallback = fallbackPlan(input);
  if (process.env.AI_TOOL_PLANNING === "off") return fallback;

  try {
    const route = routeForIntent("token_info");
    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: [
            "You are CeloMind's tool planner. Choose exactly one intent for the user's latest message.",
            "Return only JSON with shape: {\"intent\":\"...\",\"args\":{},\"clarification\":\"optional short question\"}.",
            "Use conversation summary and recent turns only to resolve references like 'that token' or 'same wallet'.",
            "Do not answer the user. Do not invent addresses, tokens, amounts, hashes, or unsupported features.",
            "For ambiguous or missing required fields, choose the closest intent and include clarification.",
            "Supported Celo action tokens: CELO, cUSD, cEUR, cREAL, USDC, USDT, WBTC.",
            `Connected wallet: ${input.walletAddress ?? "none"}.`,
            `Tool catalog:\n${JSON.stringify(TOOL_CATALOG, null, 2)}`,
            input.conversationSummary ? `Conversation summary:\n${input.conversationSummary}` : "",
          ].filter(Boolean).join("\n\n"),
        },
        ...(input.conversationMemory ?? []).slice(-4),
        { role: "user", content: input.message },
      ],
      maxTokens: 240,
      temperature: 0.1,
      provider: route.provider,
      model: route.model,
    });

    const parsed = ToolPlanResponseSchema.safeParse(parseJsonObject(result.text));
    if (!parsed.success) return fallback;

    const plan: ChatToolPlan = {
      intent: parsed.data.intent,
      args: parsed.data.args,
      clarification: parsed.data.clarification,
      source: "ai_tool_planner",
      plannerProvider: result.provider,
      plannerModel: result.model,
    };

    return validatePlan(plan, input);
  } catch {
    return fallback;
  }
}
