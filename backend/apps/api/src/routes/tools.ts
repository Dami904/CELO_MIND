import type { FastifyInstance } from "fastify";
import { buildDocsContextAsync } from "@celomind/docs-knowledge";
import { makeOk, makeErr, ToolRunRequestSchema, findTokenAsync, resolveNetwork } from "@celomind/shared";
import { getNativeBalance, getTokenBalance } from "@celomind/mcp-server/celo-client";
import {
  getCeloRecentTransactions,
  getCeloTokenInfo,
  getCeloTokenPrice,
  getCeloWalletPortfolio,
  getRecentlyLaunchedCeloTokens,
  getTrendingCeloTokens,
} from "@celomind/mcp-server/market";
import { checkContractRisk, checkTokenRisk, checkMaliciousTransaction } from "@celomind/mcp-server/risk";
import { getSwapQuote, prepareSwap } from "@celomind/mcp-server/swap";
import { analyzeCopyWallet, getWhaleWalletActivity } from "@celomind/mcp-server/whale";
import { logToolCall } from "../db/sqlite.js";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);

function confirmationData(tool: string, params: Record<string, unknown>) {
  return {
    status: "confirmation_required",
    tool,
    params,
    message: "This request was prepared only. The frontend wallet must ask the user to review and confirm before anything is executed.",
  };
}

async function swapQuoteData(params: Record<string, unknown>) {
  const quote = await getSwapQuote(String(params.fromToken ?? ""), String(params.toToken ?? ""), String(params.amount ?? ""), NETWORK);
  if ("error" in quote) return { status: "no_quote", message: quote.error };
  return quote;
}

async function prepareSwapTx(params: Record<string, unknown>, walletAddress?: string) {
  const owner = (params.walletAddress as string) ?? walletAddress;
  if (!owner) return { status: "needs_wallet", message: "Provide walletAddress to prepare a signable swap." };
  const prepared = await prepareSwap(
    String(params.fromToken ?? ""),
    String(params.toToken ?? ""),
    String(params.amount ?? ""),
    owner,
    Number(params.slippageBps ?? 50),
    NETWORK
  );
  if ("error" in prepared) return { status: "no_quote", message: prepared.error };
  return prepared;
}

function aavePositionData(walletAddress?: string) {
  return {
    walletAddress,
    protocol: "Aave V3 on Celo",
    source: "Aave/Celo contract reference",
    status: walletAddress ? "position_lookup_prepared" : "wallet_required",
    aavePoolAddress: "0x3E59A31363E6b6d5E4BF2b15D01Fc8a52f1De78",
    supportedAssets: ["CELO", "cUSD", "cEUR", "USDC", "WETH"],
    message: walletAddress
      ? "Query Aave Pool getUserAccountData(address) for live position details."
      : "Provide walletAddress to prepare an Aave position lookup.",
  };
}

function selfData(address?: string) {
  return {
    address,
    protocol: "Self",
    source: "Self Protocol docs",
    docs: "https://docs.self.xyz",
    message: address
      ? "Agent/identity status requires a Self attestation lookup for this address."
      : "Self supports privacy-preserving identity verification with proofs.",
  };
}

function uiHintForTool(tool: string) {
  if (tool.includes("risk") || tool.includes("malicious")) return { type: "risk_card" as const };
  if (tool.includes("portfolio") || tool.includes("wallet")) return { type: "portfolio_card" as const };
  if (tool.includes("transaction") || tool.includes("tx")) return { type: "transaction_card" as const };
  if (tool.includes("token") || tool.includes("trending") || tool.includes("launched")) return { type: "token_card" as const };
  if (tool.includes("docs") || tool.includes("self")) return { type: "docs_answer" as const };
  if (tool.includes("send") || tool.includes("execute") || tool.includes("supply") || tool.includes("x402") || tool.includes("copy_wallet_action")) {
    return { type: "confirmation_required" as const };
  }
  return { type: "result_card" as const };
}

export async function toolRoutes(app: FastifyInstance) {
  app.post<{ Params: { tool: string } }>("/api/tools/:tool/run", async (req, reply) => {
    const { tool } = req.params;
    const parsed = ToolRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(makeErr(`tool_${tool}`, NETWORK, "VALIDATION_ERROR", parsed.error.message));
    }
    const { params, walletAddress, network } = parsed.data;
    const net = network ?? NETWORK;

    void logToolCall({ toolName: tool, walletAddress, network: net, requestSummary: JSON.stringify(params).slice(0, 200) });

    try {
      let data: unknown;

      switch (tool) {
        case "celo_get_balance": {
          const address = (params.address as string) ?? walletAddress;
          if (!address) throw new Error("address required");
          data = await getNativeBalance(address, net);
          break;
        }
        case "celo_get_token_balance": {
          const wa = (params.walletAddress as string) ?? walletAddress;
          const tok = params.tokenSymbolOrAddress as string;
          if (!wa || !tok) throw new Error("walletAddress and tokenSymbolOrAddress required");
          const token = await findTokenAsync(tok, net);
          data = await getTokenBalance(wa, token?.address ?? tok, net);
          break;
        }
        case "get_trending_celo_tokens":
          data = await getTrendingCeloTokens();
          break;
        case "get_recently_launched_celo_tokens":
          data = await getRecentlyLaunchedCeloTokens();
          break;
        case "get_celo_token_info":
          data = await getCeloTokenInfo(params.address as string);
          break;
        case "get_celo_token_price":
          data = await getCeloTokenPrice(params.coingeckoId as string);
          break;
        case "get_celo_wallet_portfolio":
          data = await getCeloWalletPortfolio((params.address as string) ?? walletAddress ?? "", net);
          break;
        case "get_celo_recent_transactions":
          data = await getCeloRecentTransactions((params.address as string) ?? walletAddress ?? "", net);
          break;
        case "celo_swap_quote":
          data = await swapQuoteData(params);
          break;
        case "prepare_celo_swap":
          data = await prepareSwapTx(params, walletAddress);
          break;
        case "celo_swap_execute":
        case "celo_send":
        case "celo_aave_supply":
          data = confirmationData(tool, params);
          break;
        case "celo_aave_position":
          data = aavePositionData((params.walletAddress as string) ?? walletAddress);
          break;
        case "self_verify":
          data = {
            ...selfData((params.address as string) ?? walletAddress),
            context: await buildDocsContextAsync("Self Protocol Celo identity verification"),
          };
          break;
        case "self_agent_id_check":
          data = selfData((params.address as string) ?? walletAddress);
          break;
        case "x402_pay":
          data = {
            ...confirmationData(tool, params),
            protocol: "x402",
            source: "x402 protocol docs",
            flow: ["Call API", "Receive HTTP 402 requirements", "Review payment", "Confirm in wallet", "Retry with payment proof"],
          };
          break;
        case "celo_docs_explain":
          data = {
            question: params.question,
            context: await buildDocsContextAsync(String(params.question ?? "Celo docs")),
            source: "docs.celo.org / curated CeloMind docs",
          };
          break;
        case "check_contract_risk":
          data = await checkContractRisk(params.contractAddress as string, net);
          break;
        case "check_token_risk":
          data = await checkTokenRisk(params.tokenAddress as string, net);
          break;
        case "check_malicious_transaction":
          data = await checkMaliciousTransaction(params.txData as string, net);
          break;
        case "explain_transaction_risk":
          data = await checkMaliciousTransaction(String(params.txData ?? params.txHash ?? ""), net);
          break;
        case "watch_whale_wallet":
        case "get_whale_wallet_activity":
          data = await getWhaleWalletActivity((params.address as string) ?? walletAddress ?? "", net, params.label as string | undefined);
          break;
        case "compare_wallets":
          data = await analyzeCopyWallet(params.wallet1 as string, params.wallet2 as string, net);
          break;
        case "analyze_copy_wallet_strategy":
          data = await analyzeCopyWallet(params.sourceWallet as string, params.myWallet as string, net);
          break;
        case "prepare_copy_wallet_action":
          data = {
            ...(await analyzeCopyWallet(params.sourceWallet as string, params.myWallet as string, net)),
            status: "prepared_for_review",
            requires_confirmation: true,
          };
          break;
        case "get_portfolio_risk_score": {
          const address = (params.address as string) ?? walletAddress ?? "";
          const portfolio = await getCeloWalletPortfolio(address, net);
          const tokenCount = portfolio.data.length;
          const riskScore = Math.min(tokenCount * 5, 80);
          data = {
            address,
            tokenCount,
            riskScore,
            riskLevel: riskScore < 30 ? "low" : riskScore < 60 ? "medium" : "high",
            explanation: `Wallet has ${tokenCount} detected token position(s). This is a heuristic concentration/diversification score.`,
            uncertainty: "Portfolio risk uses available transfer/portfolio data and is not a full investment audit.",
          };
          break;
        }
        default:
          return reply.code(404).send(makeErr(`tool_${tool}`, net, "UNKNOWN_TOOL", `Tool '${tool}' not found`));
      }

      return makeOk(`tool_${tool}`, net, data, uiHintForTool(tool));
    } catch (e: unknown) {
      return reply.code(500).send(makeErr(`tool_${tool}`, net, "TOOL_ERROR", String(e)));
    }
  });
}
