#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { findTokenAsync, getTokenList, resolveNetwork, marketNetwork } from "@celomind/shared";
import { buildDocsContext } from "@celomind/docs-knowledge";
import {
  getNativeBalance,
  getTokenBalance,
  sendNative,
  sendToken,
  getWalletClient,
} from "./celo-client.js";
import { getSwapQuote, prepareSwap, executeSwap } from "./swap.js";
import {
  getCeloTokenPrice,
  getTrendingCeloTokens,
  getRecentlyLaunchedCeloTokens,
  getCeloTokenInfo,
  getCeloWalletPortfolio,
  getCeloRecentTransactions,
  getCeloTVL,
} from "./market.js";
import { checkContractRisk, checkTokenRisk, checkMaliciousTransaction, explainTransaction } from "./risk.js";
import { getAavePosition, prepareAaveSupply } from "./aave.js";
import { getWhaleWalletActivity, analyzeCopyWallet, getTopCeloWhales } from "./whale.js";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

const TOOLS = [
  // ─── Balances ─────────────────────────────────────────────────────────────
  {
    name: "celo_get_balance",
    description: "Get the native CELO balance of a wallet address",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address (0x...)" } }, required: ["address"] },
  },
  {
    name: "celo_get_token_balance",
    description: "Get ERC-20 token balance for a wallet on Celo",
    inputSchema: {
      type: "object",
      properties: {
        walletAddress: { type: "string" },
        tokenSymbolOrAddress: { type: "string", description: "e.g. cUSD or 0x765DE..." },
      },
      required: ["walletAddress", "tokenSymbolOrAddress"],
    },
  },
  // ─── Send ─────────────────────────────────────────────────────────────────
  {
    name: "celo_send",
    description: "Send CELO or a token to an address (requires CELO_PRIVATE_KEY)",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        amount: { type: "string", description: "Human-readable amount, e.g. '1.5'" },
        tokenSymbolOrAddress: { type: "string", description: "CELO for native, or token symbol/address" },
      },
      required: ["to", "amount", "tokenSymbolOrAddress"],
    },
  },
  // ─── Swap ─────────────────────────────────────────────────────────────────
  {
    name: "celo_swap_quote",
    description: "Get a swap quote for two Celo tokens (read-only)",
    inputSchema: {
      type: "object",
      properties: {
        fromToken: { type: "string" },
        toToken: { type: "string" },
        amount: { type: "string" },
      },
      required: ["fromToken", "toToken", "amount"],
    },
  },
  {
    name: "celo_swap_execute",
    description: "Execute a token swap on Celo (requires CELO_PRIVATE_KEY, user must confirm)",
    inputSchema: {
      type: "object",
      properties: {
        fromToken: { type: "string" },
        toToken: { type: "string" },
        amount: { type: "string" },
        slippageBps: { type: "number", description: "Slippage in basis points (e.g. 50 = 0.5%)" },
      },
      required: ["fromToken", "toToken", "amount"],
    },
  },
  // ─── Aave ─────────────────────────────────────────────────────────────────
  {
    name: "celo_aave_position",
    description: "Get Aave V3 lending/borrowing position for a wallet on Celo",
    inputSchema: { type: "object", properties: { walletAddress: { type: "string" } }, required: ["walletAddress"] },
  },
  {
    name: "celo_aave_supply",
    description: "Supply an asset to Aave V3 on Celo (requires CELO_PRIVATE_KEY)",
    inputSchema: {
      type: "object",
      properties: {
        asset: { type: "string" },
        amount: { type: "string" },
      },
      required: ["asset", "amount"],
    },
  },
  // ─── Identity ─────────────────────────────────────────────────────────────
  {
    name: "self_verify",
    description: "Explain how to verify identity with Self Protocol on Celo",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "self_agent_id_check",
    description: "Check if an address has a Self agent ID or identity attestation",
    inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "x402_pay",
    description: "Explain or prepare an x402 payment for API access on Celo",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: { type: "string", description: "The API endpoint requiring payment" },
        amount: { type: "string" },
        currency: { type: "string", description: "e.g. cUSD or USDC" },
      },
      required: ["endpoint"],
    },
  },
  // ─── Docs ─────────────────────────────────────────────────────────────────
  {
    name: "celo_docs_explain",
    description: "Answer questions about Celo using curated documentation",
    inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
  },
  // ─── Market ───────────────────────────────────────────────────────────────
  {
    name: "get_trending_celo_tokens",
    description: "Get trending token pools on Celo via GeckoTerminal",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_celo_token_info",
    description: "Get token info for a Celo token by contract address",
    inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "get_celo_token_price",
    description: "Get USD price of a Celo token by CoinGecko ID",
    inputSchema: { type: "object", properties: { coingeckoId: { type: "string" } }, required: ["coingeckoId"] },
  },
  {
    name: "get_celo_wallet_portfolio",
    description: "Get token portfolio for a wallet (token tx history based)",
    inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "get_celo_recent_transactions",
    description: "Get recent transactions for a wallet address on Celo",
    inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "prepare_celo_swap",
    description: "Prepare (but do not execute) a Uniswap V3 swap on Celo — returns unsigned approve + swap txs for the wallet to sign",
    inputSchema: {
      type: "object",
      properties: {
        fromToken: { type: "string" },
        toToken: { type: "string" },
        amount: { type: "string" },
        walletAddress: { type: "string", description: "Wallet that will sign; omit to use the configured signer" },
        slippageBps: { type: "number", description: "Slippage tolerance in basis points (default 50 = 0.5%)" },
      },
      required: ["fromToken", "toToken", "amount"],
    },
  },
  {
    name: "get_recently_launched_celo_tokens",
    description: "Get recently launched token pools on Celo",
    inputSchema: { type: "object", properties: {} },
  },
  // ─── Security ─────────────────────────────────────────────────────────────
  {
    name: "check_malicious_transaction",
    description: "Analyze transaction calldata for malicious patterns",
    inputSchema: { type: "object", properties: { txData: { type: "string", description: "Raw tx calldata or description" } }, required: ["txData"] },
  },
  {
    name: "check_contract_risk",
    description: "Check risk level of a smart contract on Celo",
    inputSchema: { type: "object", properties: { contractAddress: { type: "string" } }, required: ["contractAddress"] },
  },
  {
    name: "check_token_risk",
    description: "Check risk level of a token on Celo",
    inputSchema: { type: "object", properties: { tokenAddress: { type: "string" } }, required: ["tokenAddress"] },
  },
  // ─── Whale ────────────────────────────────────────────────────────────────
  {
    name: "watch_whale_wallet",
    description: "Fetch activity and profile of a whale wallet on Celo",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string" },
        label: { type: "string", description: "Optional human-readable label for this wallet" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_whale_wallet_activity",
    description: "Get recent transactions and token activity for a whale wallet. Omit address to get the top Celo whales leaderboard.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Optional — omit for the top-whales leaderboard" } } },
  },
  {
    name: "compare_wallets",
    description: "Compare token holdings between two wallets",
    inputSchema: {
      type: "object",
      properties: {
        wallet1: { type: "string" },
        wallet2: { type: "string" },
      },
      required: ["wallet1", "wallet2"],
    },
  },
  {
    name: "analyze_copy_wallet_strategy",
    description: "Analyze what tokens to add/remove to mirror a source wallet (does NOT execute trades)",
    inputSchema: {
      type: "object",
      properties: {
        sourceWallet: { type: "string" },
        myWallet: { type: "string" },
      },
      required: ["sourceWallet", "myWallet"],
    },
  },
  {
    name: "prepare_copy_wallet_action",
    description: "Prepare (NOT execute) copy-wallet actions for user review",
    inputSchema: {
      type: "object",
      properties: {
        sourceWallet: { type: "string" },
        myWallet: { type: "string" },
      },
      required: ["sourceWallet", "myWallet"],
    },
  },
  {
    name: "explain_transaction_risk",
    description: "Explain the risk of a given transaction in plain language",
    inputSchema: { type: "object", properties: { txData: { type: "string" } }, required: ["txData"] },
  },
  {
    name: "get_portfolio_risk_score",
    description: "Get a portfolio-level risk score for a wallet",
    inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
];

async function handleTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "celo_get_balance": {
      const address = args.address as string;
      const result = await getNativeBalance(address, NETWORK);
      return ok({ address, network: NETWORK, ...result, symbol: "CELO" });
    }

    case "celo_get_token_balance": {
      const { walletAddress, tokenSymbolOrAddress } = args as { walletAddress: string; tokenSymbolOrAddress: string };
      const token = await findTokenAsync(tokenSymbolOrAddress, NETWORK);
      const tokenAddr = token?.address ?? tokenSymbolOrAddress;
      const result = await getTokenBalance(walletAddress, tokenAddr, NETWORK);
      return ok({ walletAddress, network: NETWORK, tokenAddress: tokenAddr, ...result });
    }

    case "celo_send": {
      const { to, amount, tokenSymbolOrAddress } = args as { to: string; amount: string; tokenSymbolOrAddress: string };
      const isNative = tokenSymbolOrAddress.toUpperCase() === "CELO";
      if (isNative) {
        const result = await sendNative(to, amount, NETWORK);
        return ok({ network: NETWORK, ...result });
      }
      const token = await findTokenAsync(tokenSymbolOrAddress, NETWORK);
      if (!token) return err(`Unknown token: ${tokenSymbolOrAddress}`);
      const result = await sendToken(token.address, to, amount, NETWORK);
      return ok({ network: NETWORK, token: token.symbol, ...result });
    }

    case "celo_swap_quote": {
      const { fromToken, toToken, amount } = args as { fromToken: string; toToken: string; amount: string };
      const quote = await getSwapQuote(fromToken, toToken, amount, NETWORK);
      if ("error" in quote) return err(quote.error);
      return ok({ network: NETWORK, ...quote });
    }

    case "prepare_celo_swap": {
      const { fromToken, toToken, amount, walletAddress, slippageBps } = args as {
        fromToken: string; toToken: string; amount: string; walletAddress?: string; slippageBps?: number;
      };
      // Use the provided wallet, or the configured signer's address (agent mode), to prepare txs.
      let owner = walletAddress;
      if (!owner && process.env.CELO_PRIVATE_KEY) {
        try { owner = getWalletClient(NETWORK).account!.address; } catch { /* ignore */ }
      }
      if (!owner) return err("Provide walletAddress (or set CELO_PRIVATE_KEY) to prepare a swap.");
      const prepared = await prepareSwap(fromToken, toToken, amount, owner, slippageBps ?? 50, NETWORK);
      if ("error" in prepared) return err(prepared.error);
      return ok({ network: NETWORK, ...prepared });
    }

    case "celo_swap_execute": {
      // Agent mode: actually send the swap using CELO_PRIVATE_KEY (no human wallet in the loop).
      const { fromToken, toToken, amount, slippageBps } = args as {
        fromToken: string; toToken: string; amount: string; slippageBps?: number;
      };
      const result = await executeSwap(fromToken, toToken, amount, slippageBps ?? 50, NETWORK);
      if ("error" in result) return err(result.error);
      return ok({ network: NETWORK, status: "executed", ...result });
    }

    case "celo_aave_position": {
      const { walletAddress } = args as { walletAddress: string };
      if (!walletAddress) return err("walletAddress is required");
      const position = await getAavePosition(walletAddress, NETWORK);
      return ok({ network: NETWORK, ...position });
    }

    case "celo_aave_supply": {
      const { asset, amount, walletAddress } = args as { asset: string; amount: string; walletAddress?: string };
      let owner = walletAddress;
      if (!owner && process.env.CELO_PRIVATE_KEY) {
        try { owner = getWalletClient(NETWORK).account!.address; } catch { /* ignore */ }
      }
      if (!owner) return err("Provide walletAddress (or set CELO_PRIVATE_KEY) to prepare an Aave supply.");
      const prepared = await prepareAaveSupply(asset, amount, owner, NETWORK);
      if ("error" in prepared) return err(prepared.error);
      return ok({ network: NETWORK, ...prepared });
    }

    case "self_verify": {
      return ok({
        protocol: "Self (selfxyz.com)",
        description: "Privacy-preserving identity verification using ZK proofs of real-world documents.",
        steps: [
          "1. Download Self app from selfxyz.com",
          "2. Scan your passport or national ID in the app",
          "3. ZK proof generated locally — raw data never leaves your device",
          "4. Share proof on-chain to verify humanity",
        ],
        useCases: ["Sybil resistance", "KYC-gating DeFi", "Undercollateralized lending"],
        docs: "https://docs.selfxyz.com",
        network: NETWORK,
      });
    }

    case "self_agent_id_check": {
      const { address } = args as { address: string };
      return ok({
        address,
        message: "Self identity check requires querying Self smart contracts. Visit https://selfxyz.com or use Self SDK.",
        docs: "https://docs.selfxyz.com",
        network: NETWORK,
      });
    }

    case "x402_pay": {
      const { endpoint, amount, currency } = args as { endpoint: string; amount?: string; currency?: string };
      return ok({
        protocol: "x402",
        endpoint,
        amount: amount ?? "variable",
        currency: currency ?? "cUSD",
        description: "x402 enables HTTP payment-gated API access using the HTTP 402 status code.",
        flow: [
          "1. Call API endpoint",
          "2. Receive HTTP 402 with payment requirements",
          "3. Sign and send payment transaction",
          "4. Retry request with payment proof",
        ],
        docs: "https://x402.org",
        network: NETWORK,
      });
    }

    case "celo_docs_explain": {
      const { question } = args as { question: string };
      const context = buildDocsContext(question);
      return ok({ question, context, source: "CeloMind curated docs" });
    }

    case "get_trending_celo_tokens": {
      const r = await getTrendingCeloTokens();
      return ok({ network: "celo", tokens: r.data, source: r.source });
    }

    case "get_celo_token_info": {
      const { address } = args as { address: string };
      const r = await getCeloTokenInfo(address, marketNetwork());
      return ok({ address, network: marketNetwork(), info: r?.data ?? null, source: r?.source ?? "unavailable" });
    }

    case "get_celo_token_price": {
      const { coingeckoId } = args as { coingeckoId: string };
      const price = await getCeloTokenPrice(coingeckoId);
      return ok({ coingeckoId, network: NETWORK, price, source: "CoinGecko" });
    }

    case "get_celo_wallet_portfolio": {
      const { address } = args as { address: string };
      const r = await getCeloWalletPortfolio(address, marketNetwork());
      return ok({ address, network: marketNetwork(), portfolio: r.data, source: r.source });
    }

    case "get_celo_recent_transactions": {
      const { address } = args as { address: string };
      const r = await getCeloRecentTransactions(address, marketNetwork());
      return ok({ address, network: marketNetwork(), transactions: r.data, source: r.source });
    }

    case "get_recently_launched_celo_tokens": {
      const r = await getRecentlyLaunchedCeloTokens();
      return ok({ network: "celo", tokens: r.data, source: r.source });
    }

    case "check_malicious_transaction":
    case "explain_transaction_risk": {
      const { txData } = args as { txData: string };
      const report = await explainTransaction(txData, NETWORK);
      return ok({ network: NETWORK, ...report });
    }

    case "check_contract_risk": {
      const { contractAddress } = args as { contractAddress: string };
      const report = await checkContractRisk(contractAddress, NETWORK);
      return ok({ network: NETWORK, ...report });
    }

    case "check_token_risk": {
      const { tokenAddress } = args as { tokenAddress: string };
      const report = await checkTokenRisk(tokenAddress, NETWORK);
      return ok({ network: NETWORK, ...report });
    }

    case "watch_whale_wallet":
    case "get_whale_wallet_activity": {
      const { address, label } = args as { address?: string; label?: string };
      // No specific address → return the top Celo whales leaderboard (Dune, with Blockscout fallback).
      if (!address) {
        const top = await getTopCeloWhales();
        return ok({ topWhales: top.data, source: top.source });
      }
      const profile = await getWhaleWalletActivity(address, marketNetwork(), label);
      return ok(profile);
    }

    case "compare_wallets": {
      const { wallet1, wallet2 } = args as { wallet1: string; wallet2: string };
      const analysis = await analyzeCopyWallet(wallet1, wallet2, marketNetwork());
      return ok({ ...analysis, mode: "compare_only" });
    }

    case "analyze_copy_wallet_strategy":
    case "prepare_copy_wallet_action": {
      const { sourceWallet, myWallet } = args as { sourceWallet: string; myWallet: string };
      const analysis = await analyzeCopyWallet(sourceWallet, myWallet, marketNetwork());
      return ok({ ...analysis, warning: "CeloMind NEVER auto-executes copy trades. These are for review only." });
    }

    case "get_portfolio_risk_score": {
      const { address } = args as { address: string };
      const portfolio = await getCeloWalletPortfolio(address, marketNetwork());
      const tokenCount = portfolio.data.length;
      const riskScore = Math.min(tokenCount * 5, 80); // heuristic
      return ok({
        address,
        network: NETWORK,
        tokenCount,
        riskScore,
        riskLevel: riskScore < 30 ? "low" : riskScore < 60 ? "medium" : "high",
        explanation: `Wallet holds ${tokenCount} unique tokens. Diversification risk score: ${riskScore}/100.`,
        uncertainty: "Score is heuristic only. Does not account for token quality or liquidity.",
      });
    }

    default:
      return err(`Unknown tool: ${name}`);
  }
}

async function main() {
  const server = new Server(
    { name: "celomind-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      return await handleTool(name, args as Record<string, unknown>);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(msg);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[CeloMind MCP] Server running on stdio — network:", NETWORK);
}

main().catch((e) => {
  console.error("[CeloMind MCP] Fatal:", e);
  process.exit(1);
});
