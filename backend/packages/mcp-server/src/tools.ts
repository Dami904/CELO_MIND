/**
 * CeloMind MCP tool definitions and handler — shared by stdio (index.ts) and HTTP transport.
 * Import createMcpServer() to get a fully wired Server instance.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CeloPreparedSwapParamsSchema,
  CeloSwapQuoteParamsSchema,
  CeloTransferParamsSchema,
  findTokenAsync,
  resolveNetwork,
  marketNetwork,
} from "@celomind/shared";
import { buildDocsContext } from "@celomind/docs-knowledge";
import { getNativeBalance, getTokenBalance, sendNative, sendToken, getWalletClient } from "./celo-client.js";
import { getSwapQuote, prepareSwap, executeSwap } from "./swap.js";
import {
  getCeloTokenPrice, getTrendingCeloTokens, getRecentlyLaunchedCeloTokens,
  getCeloTokenInfo, getCeloWalletPortfolio, getCeloRecentTransactions,
  getCeloTopTokensByHolders, getCeloTopTokensByMarketCap,
  getCeloGasPrice, getCeloDefiProtocols, getCeloNetworkStats,
  getCeloPriceHistory, getCeloTopPools, searchCeloTokens,
  getCeloTokenHolders, getCeloWalletStats, getCeloNFTBalances, getCeloYieldOpportunities,
  getTransactionByHash, getCeloFilteredTransactions,
} from "./market.js";
import { checkContractRisk, checkTokenRisk, explainTransaction } from "./risk.js";
import { getAavePosition, prepareAaveSupply } from "./aave.js";
import { getWhaleWalletActivity, analyzeCopyWallet, getTopCeloWhales } from "./whale.js";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);
const ADDRESS_Z = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address");
const TX_DATA_Z = z.string().min(1, "Transaction data or hash is required");
const AMOUNT_Z = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/, "Amount must be a positive decimal string");
const TOKEN_Z = z.enum(["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"]);
const SLIPPAGE_BPS_Z = z.number().int().min(10).max(500).optional();

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

export const TOOLS = [
  // ─── Balances ──────────────────────────────────────────────────────────────
  { name: "celo_get_balance", description: "Get the native CELO balance of a wallet address", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "celo_get_token_balance", description: "Get ERC-20 token balance for a wallet on Celo", inputSchema: { type: "object", properties: { walletAddress: { type: "string" }, tokenSymbolOrAddress: { type: "string" } }, required: ["walletAddress", "tokenSymbolOrAddress"] } },
  // ─── Send ──────────────────────────────────────────────────────────────────
  { name: "celo_send", description: "Send CELO or a supported Celo token to a valid EVM address (requires CELO_PRIVATE_KEY)", inputSchema: { type: "object", properties: { to: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" }, amount: { type: "string", pattern: "^(?:0|[1-9]\\d*)(?:\\.\\d{1,18})?$" }, tokenSymbolOrAddress: { type: "string", enum: ["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"] } }, required: ["to", "amount", "tokenSymbolOrAddress"] } },
  // ─── Swap ──────────────────────────────────────────────────────────────────
  { name: "celo_swap_quote", description: "Get a read-only quote between supported Celo tokens", inputSchema: { type: "object", properties: { fromToken: { type: "string", enum: ["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"] }, toToken: { type: "string", enum: ["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"] }, amount: { type: "string", pattern: "^(?:0|[1-9]\\d*)(?:\\.\\d{1,18})?$" } }, required: ["fromToken", "toToken", "amount"] } },
  { name: "celo_swap_execute", description: "Execute a token swap on Celo (requires CELO_PRIVATE_KEY, user must confirm)", inputSchema: { type: "object", properties: { fromToken: { type: "string", enum: ["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"] }, toToken: { type: "string", enum: ["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"] }, amount: { type: "string", pattern: "^(?:0|[1-9]\\d*)(?:\\.\\d{1,18})?$" }, slippageBps: { type: "number", minimum: 10, maximum: 500 } }, required: ["fromToken", "toToken", "amount"] } },
  { name: "prepare_celo_swap", description: "Prepare (but not execute) a Celo swap — returns unsigned txs for the wallet to review and sign", inputSchema: { type: "object", properties: { fromToken: { type: "string", enum: ["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"] }, toToken: { type: "string", enum: ["CELO", "cUSD", "cEUR", "cREAL", "USDC", "USDT", "WBTC"] }, amount: { type: "string", pattern: "^(?:0|[1-9]\\d*)(?:\\.\\d{1,18})?$" }, walletAddress: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" }, slippageBps: { type: "number", minimum: 10, maximum: 500 } }, required: ["fromToken", "toToken", "amount"] } },
  // ─── Aave ──────────────────────────────────────────────────────────────────
  { name: "celo_aave_position", description: "Get Aave V3 lending/borrowing position for a wallet on Celo", inputSchema: { type: "object", properties: { walletAddress: { type: "string" } }, required: ["walletAddress"] } },
  { name: "celo_aave_supply", description: "Supply an asset to Aave V3 on Celo (requires CELO_PRIVATE_KEY)", inputSchema: { type: "object", properties: { asset: { type: "string" }, amount: { type: "string" } }, required: ["asset", "amount"] } },
  // ─── Identity ──────────────────────────────────────────────────────────────
  { name: "self_verify", description: "Explain how to verify identity with Self Protocol on Celo", inputSchema: { type: "object", properties: {} } },
  { name: "self_agent_id_check", description: "Check if an address has a Self identity attestation", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "x402_pay", description: "Explain or prepare an x402 API payment on Celo", inputSchema: { type: "object", properties: { endpoint: { type: "string" }, amount: { type: "string" }, currency: { type: "string" } }, required: ["endpoint"] } },
  // ─── Docs ──────────────────────────────────────────────────────────────────
  { name: "celo_docs_explain", description: "Answer questions about Celo using curated documentation", inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } },
  // ─── Market data ───────────────────────────────────────────────────────────
  { name: "get_celo_gas_price", description: "Get the current Celo network gas price in Gwei", inputSchema: { type: "object", properties: {} } },
  { name: "get_celo_network_stats", description: "Get Celo network stats: block count, address count, daily transactions, avg block time", inputSchema: { type: "object", properties: {} } },
  { name: "get_celo_defi_protocols", description: "Get top DeFi protocols deployed on Celo ranked by TVL (DefiLlama)", inputSchema: { type: "object", properties: {} } },
  { name: "get_celo_yield_opportunities", description: "Get best yield/APY opportunities on Celo (DefiLlama Yields)", inputSchema: { type: "object", properties: {} } },
  { name: "get_trending_celo_tokens", description: "Get trending token pools on Celo via GeckoTerminal or Dune", inputSchema: { type: "object", properties: {} } },
  { name: "get_celo_top_pools", description: "Get top DEX liquidity pools on Celo by reserve/volume (GeckoTerminal)", inputSchema: { type: "object", properties: {} } },
  { name: "get_celo_top_tokens_by_holders", description: "Get top ERC-20 tokens on Celo ranked by holder count (Blockscout)", inputSchema: { type: "object", properties: {} } },
  { name: "get_celo_top_tokens_by_market_cap", description: "Get top Celo ecosystem tokens ranked by market cap (CoinGecko)", inputSchema: { type: "object", properties: {} } },
  { name: "get_recently_launched_celo_tokens", description: "Get recently launched token pools on Celo", inputSchema: { type: "object", properties: {} } },
  { name: "search_celo_tokens", description: "Search Celo ERC-20 tokens by name or symbol", inputSchema: { type: "object", properties: { query: { type: "string", description: "Token name or symbol to search" } }, required: ["query"] } },
  { name: "get_celo_token_price", description: "Get USD price of a Celo token by CoinGecko ID (e.g. 'celo', 'celo-dollar')", inputSchema: { type: "object", properties: { coingeckoId: { type: "string" } }, required: ["coingeckoId"] } },
  { name: "get_celo_price_history", description: "Get historical price data for a Celo token over N days (CoinGecko)", inputSchema: { type: "object", properties: { coingeckoId: { type: "string" }, days: { type: "number", description: "Number of days (e.g. 7, 30, 365)" } }, required: ["coingeckoId", "days"] } },
  { name: "get_celo_token_info", description: "Get token info for a Celo token by contract address", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "get_celo_token_holders", description: "Get top holders of a specific ERC-20 token on Celo", inputSchema: { type: "object", properties: { tokenAddress: { type: "string" } }, required: ["tokenAddress"] } },
  // ─── Wallet ────────────────────────────────────────────────────────────────
  { name: "get_celo_wallet_portfolio", description: "Get full token portfolio for a wallet address on Celo", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "get_celo_wallet_stats", description: "Get wallet stats: tx count, token transfer count, native balance (Blockscout)", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "get_celo_nft_balances", description: "Get ERC-721 and ERC-1155 NFT holdings for a wallet on Celo (Blockscout)", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "get_celo_recent_transactions", description: "Get recent transactions for a wallet address on Celo", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "get_celo_transaction", description: "Fetch a specific transaction by hash from Blockscout (retries for indexing lag)", inputSchema: { type: "object", properties: { txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } }, required: ["txHash"] } },
  { name: "get_celo_filtered_transactions", description: "Get filtered transaction history for a wallet — filter by direction (in/out), minimum CELO value, or date", inputSchema: { type: "object", properties: { address: { type: "string" }, direction: { type: "string", enum: ["in", "out"] }, minValueCelo: { type: "number" }, afterDate: { type: "string" } }, required: ["address"] } },
  // ─── Security ──────────────────────────────────────────────────────────────
  { name: "check_malicious_transaction", description: "Analyze transaction calldata for malicious patterns", inputSchema: { type: "object", properties: { txData: { type: "string" } }, required: ["txData"] } },
  { name: "check_contract_risk", description: "Check risk level of a smart contract on Celo", inputSchema: { type: "object", properties: { contractAddress: { type: "string" } }, required: ["contractAddress"] } },
  { name: "check_token_risk", description: "Check risk level of a token on Celo", inputSchema: { type: "object", properties: { tokenAddress: { type: "string" } }, required: ["tokenAddress"] } },
  { name: "explain_transaction_risk", description: "Explain the risk of a transaction in plain language", inputSchema: { type: "object", properties: { txData: { type: "string" } }, required: ["txData"] } },
  // ─── Whale ─────────────────────────────────────────────────────────────────
  { name: "get_whale_wallet_activity", description: "Get recent activity for a whale wallet. Omit address to get the top Celo whales leaderboard.", inputSchema: { type: "object", properties: { address: { type: "string" }, label: { type: "string" } } } },
  { name: "compare_wallets", description: "Compare token holdings between two wallets", inputSchema: { type: "object", properties: { wallet1: { type: "string" }, wallet2: { type: "string" } }, required: ["wallet1", "wallet2"] } },
  { name: "analyze_copy_wallet_strategy", description: "Analyze what tokens to add/remove to mirror a source wallet (read-only, never executes)", inputSchema: { type: "object", properties: { sourceWallet: { type: "string" }, myWallet: { type: "string" } }, required: ["sourceWallet", "myWallet"] } },
  { name: "get_portfolio_risk_score", description: "Get a portfolio-level risk score for a wallet", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
];

export async function handleTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "celo_get_balance": {
      const address = args.address as string;
      return ok({ address, network: NETWORK, ...(await getNativeBalance(address, NETWORK)), symbol: "CELO" });
    }
    case "celo_get_token_balance": {
      const { walletAddress, tokenSymbolOrAddress } = args as { walletAddress: string; tokenSymbolOrAddress: string };
      const token = await findTokenAsync(tokenSymbolOrAddress, NETWORK);
      const tokenAddr = token?.address ?? tokenSymbolOrAddress;
      return ok({ walletAddress, network: NETWORK, tokenAddress: tokenAddr, ...(await getTokenBalance(walletAddress, tokenAddr, NETWORK)) });
    }
    case "celo_send": {
      const { to, amount, tokenSymbolOrAddress } = args as { to: string; amount: string; tokenSymbolOrAddress: string };
      const parsed = CeloTransferParamsSchema.safeParse({ to, amount, tokenSymbolOrAddress, network: NETWORK });
      if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid transfer request.");
      const transfer = parsed.data;
      if (transfer.tokenSymbolOrAddress === "CELO") return ok({ network: NETWORK, ...(await sendNative(transfer.to, transfer.amount, NETWORK)) });
      const token = await findTokenAsync(transfer.tokenSymbolOrAddress, NETWORK);
      if (!token) return err(`Unknown token: ${transfer.tokenSymbolOrAddress}`);
      return ok({ network: NETWORK, token: token.symbol, ...(await sendToken(token.address, transfer.to, transfer.amount, NETWORK)) });
    }
    case "celo_swap_quote": {
      const { fromToken, toToken, amount } = args as { fromToken: string; toToken: string; amount: string };
      const parsed = CeloSwapQuoteParamsSchema.safeParse({ fromToken, toToken, amount, network: NETWORK });
      if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid swap quote request.");
      const quote = await getSwapQuote(parsed.data.fromToken, parsed.data.toToken, parsed.data.amount, parsed.data.network);
      return "error" in quote ? err(quote.error) : ok({ network: NETWORK, ...quote });
    }
    case "prepare_celo_swap": {
      const { fromToken, toToken, amount, walletAddress, slippageBps } = args as { fromToken: string; toToken: string; amount: string; walletAddress?: string; slippageBps?: number };
      let owner = walletAddress;
      if (!owner && process.env.CELO_PRIVATE_KEY) { try { owner = getWalletClient(NETWORK).account!.address; } catch { /* ignore */ } }
      if (!owner) return err("Provide walletAddress (or set CELO_PRIVATE_KEY) to prepare a swap.");
      const parsed = CeloPreparedSwapParamsSchema.safeParse({ fromToken, toToken, amount, walletAddress: owner, slippageBps, network: NETWORK });
      if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid swap request.");
      const prepared = await prepareSwap(parsed.data.fromToken, parsed.data.toToken, parsed.data.amount, parsed.data.walletAddress, parsed.data.slippageBps, parsed.data.network);
      return "error" in prepared ? err(prepared.error) : ok({ network: NETWORK, ...prepared });
    }
    case "celo_swap_execute": {
      const { fromToken, toToken, amount, slippageBps } = args as { fromToken: string; toToken: string; amount: string; slippageBps?: number };
      let owner: string | undefined;
      if (process.env.CELO_PRIVATE_KEY) { try { owner = getWalletClient(NETWORK).account!.address; } catch { /* ignore */ } }
      if (!owner) return err("Set CELO_PRIVATE_KEY to execute a swap, or use prepare_celo_swap for unsigned wallet review.");
      const parsed = CeloPreparedSwapParamsSchema.safeParse({ fromToken, toToken, amount, walletAddress: owner, slippageBps, network: NETWORK });
      if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid swap request.");
      const result = await executeSwap(parsed.data.fromToken, parsed.data.toToken, parsed.data.amount, parsed.data.slippageBps, parsed.data.network);
      return "error" in result ? err(result.error) : ok({ network: NETWORK, status: "executed", ...result });
    }
    case "celo_aave_position": {
      const { walletAddress } = args as { walletAddress: string };
      return ok({ network: NETWORK, ...(await getAavePosition(walletAddress, NETWORK)) });
    }
    case "celo_aave_supply": {
      const { asset, amount, walletAddress } = args as { asset: string; amount: string; walletAddress?: string };
      let owner = walletAddress;
      if (!owner && process.env.CELO_PRIVATE_KEY) { try { owner = getWalletClient(NETWORK).account!.address; } catch { /* ignore */ } }
      if (!owner) return err("Provide walletAddress (or set CELO_PRIVATE_KEY) to prepare Aave supply.");
      const prepared = await prepareAaveSupply(asset, amount, owner, NETWORK);
      return "error" in prepared ? err(prepared.error) : ok({ network: NETWORK, ...prepared });
    }
    case "self_verify":
      return ok({ protocol: "Self (selfxyz.com)", docs: "https://docs.selfxyz.com", steps: ["Download Self app", "Scan your passport", "ZK proof generated locally", "Share proof on-chain"], network: NETWORK });
    case "self_agent_id_check": {
      const { address } = args as { address: string };
      return ok({ address, message: "Self identity check requires querying Self smart contracts. Visit https://selfxyz.com or use Self SDK.", docs: "https://docs.selfxyz.com", network: NETWORK });
    }
    case "x402_pay": {
      const { endpoint, amount, currency } = args as { endpoint: string; amount?: string; currency?: string };
      return ok({ protocol: "x402", endpoint, amount: amount ?? "variable", currency: currency ?? "cUSD", flow: ["Call API", "Receive 402", "Sign payment tx", "Retry with proof"], docs: "https://x402.org", network: NETWORK });
    }
    case "celo_docs_explain": {
      const { question } = args as { question: string };
      return ok({ question, context: buildDocsContext(question), source: "CeloMind curated docs" });
    }
    case "get_celo_gas_price": {
      const gp = await getCeloGasPrice();
      return gp ? ok({ network: NETWORK, ...gp, source: "Celo RPC" }) : err("Could not fetch gas price from Celo RPC.");
    }
    case "get_celo_network_stats": {
      const r = await getCeloNetworkStats();
      return ok({ network: NETWORK, stats: r.data, source: r.source });
    }
    case "get_celo_defi_protocols": {
      const r = await getCeloDefiProtocols();
      return ok({ network: "celo", protocols: r.data, source: r.source });
    }
    case "get_celo_yield_opportunities": {
      const r = await getCeloYieldOpportunities();
      return ok({ network: "celo", yields: r.data, source: r.source });
    }
    case "get_trending_celo_tokens": {
      const r = await getTrendingCeloTokens();
      return ok({ network: "celo", tokens: r.data, source: r.source });
    }
    case "get_celo_top_pools": {
      const r = await getCeloTopPools();
      return ok({ network: "celo", pools: r.data, source: r.source });
    }
    case "get_celo_top_tokens_by_holders": {
      const r = await getCeloTopTokensByHolders();
      return ok({ network: "celo", tokens: r.data, source: r.source });
    }
    case "get_celo_top_tokens_by_market_cap": {
      const r = await getCeloTopTokensByMarketCap();
      return ok({ network: "celo", tokens: r.data, source: r.source });
    }
    case "get_recently_launched_celo_tokens": {
      const r = await getRecentlyLaunchedCeloTokens();
      return ok({ network: "celo", tokens: r.data, source: r.source });
    }
    case "search_celo_tokens": {
      const { query } = args as { query: string };
      const r = await searchCeloTokens(query);
      return ok({ network: "celo", query, tokens: r.data, source: r.source });
    }
    case "get_celo_token_price": {
      const { coingeckoId } = args as { coingeckoId: string };
      return ok({ coingeckoId, network: NETWORK, price: await getCeloTokenPrice(coingeckoId), source: "CoinGecko" });
    }
    case "get_celo_price_history": {
      const { coingeckoId, days } = args as { coingeckoId: string; days: number };
      const r = await getCeloPriceHistory(coingeckoId, days);
      return ok({ coingeckoId, days, network: NETWORK, prices: r.data, source: r.source });
    }
    case "get_celo_token_info": {
      const { address } = args as { address: string };
      const r = await getCeloTokenInfo(address, marketNetwork());
      return ok({ address, network: marketNetwork(), info: r?.data ?? null, source: r?.source ?? "unavailable" });
    }
    case "get_celo_token_holders": {
      const { tokenAddress } = args as { tokenAddress: string };
      const r = await getCeloTokenHolders(tokenAddress);
      return ok({ tokenAddress, network: "celo", holders: r.data, source: r.source });
    }
    case "get_celo_wallet_portfolio": {
      const { address } = args as { address: string };
      const r = await getCeloWalletPortfolio(address, marketNetwork());
      return ok({ address, network: marketNetwork(), portfolio: r.data, source: r.source });
    }
    case "get_celo_wallet_stats": {
      const { address } = args as { address: string };
      const r = await getCeloWalletStats(address);
      return ok({ address, network: "celo", stats: r.data, source: r.source });
    }
    case "get_celo_nft_balances": {
      const { address } = args as { address: string };
      const r = await getCeloNFTBalances(address);
      return ok({ address, network: "celo", nfts: r.data, source: r.source });
    }
    case "get_celo_recent_transactions": {
      const { address } = args as { address: string };
      const r = await getCeloRecentTransactions(address, marketNetwork());
      return ok({ address, network: marketNetwork(), transactions: r.data, source: r.source });
    }
    case "get_celo_transaction": {
      const { txHash } = args as { txHash: string };
      const r = await getTransactionByHash(txHash, NETWORK);
      if (!r.data) return r.pending
        ? ok({ txHash, status: "pending", message: "Transaction submitted but not yet indexed by Blockscout. Try again in a few seconds." })
        : err(`Transaction ${txHash} not found on Blockscout. Verify the hash is correct.`);
      return ok({ txHash, network: NETWORK, transaction: r.data, source: r.source });
    }
    case "get_celo_filtered_transactions": {
      const { address, direction, minValueCelo, afterDate } = args as { address: string; direction?: "in" | "out"; minValueCelo?: number; afterDate?: string };
      const r = await getCeloFilteredTransactions(address, marketNetwork(), { direction, minValueCelo, afterDate });
      return ok({ address, network: marketNetwork(), filter: { direction, minValueCelo, afterDate }, transactions: r.data, source: r.source });
    }
    case "check_malicious_transaction":
    case "explain_transaction_risk": {
      const { txData } = args as { txData: string };
      return ok({ network: NETWORK, ...(await explainTransaction(txData, NETWORK)) });
    }
    case "check_contract_risk": {
      const { contractAddress } = args as { contractAddress: string };
      return ok({ network: NETWORK, ...(await checkContractRisk(contractAddress, NETWORK)) });
    }
    case "check_token_risk": {
      const { tokenAddress } = args as { tokenAddress: string };
      return ok({ network: NETWORK, ...(await checkTokenRisk(tokenAddress, NETWORK)) });
    }
    case "get_whale_wallet_activity": {
      const { address, label } = args as { address?: string; label?: string };
      if (!address) { const top = await getTopCeloWhales(); return ok({ topWhales: top.data, source: top.source }); }
      return ok(await getWhaleWalletActivity(address, marketNetwork(), label));
    }
    case "compare_wallets": {
      const { wallet1, wallet2 } = args as { wallet1: string; wallet2: string };
      return ok({ ...(await analyzeCopyWallet(wallet1, wallet2, marketNetwork())), mode: "compare_only" });
    }
    case "analyze_copy_wallet_strategy": {
      const { sourceWallet, myWallet } = args as { sourceWallet: string; myWallet: string };
      return ok({ ...(await analyzeCopyWallet(sourceWallet, myWallet, marketNetwork())), warning: "CeloMind NEVER auto-executes copy trades." });
    }
    case "get_portfolio_risk_score": {
      const { address } = args as { address: string };
      const portfolio = await getCeloWalletPortfolio(address, marketNetwork());
      const tokenCount = portfolio.data.length;
      const riskScore = Math.min(tokenCount * 5, 80);
      return ok({ address, network: NETWORK, tokenCount, riskScore, riskLevel: riskScore < 30 ? "low" : riskScore < 60 ? "medium" : "high", uncertainty: "Heuristic only." });
    }
    default:
      return err(`Unknown tool: ${name}`);
  }
}

function registerCeloTool(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Record<string, z.ZodTypeAny>
) {
  server.registerTool(name, { description, inputSchema }, async (args) => {
    try { return await handleTool(name, args as Record<string, unknown>); }
    catch (e: unknown) { return err(e instanceof Error ? e.message : String(e)); }
  });
}

/** Create a fully configured MCP server instance. Use with any transport (stdio or HTTP). */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "celomind-mcp", version: "1.0.0" });

  registerCeloTool(server, "celo_get_balance", "Get the native CELO balance of a wallet address.", {
    address: ADDRESS_Z.describe("Wallet address to check."),
  });
  registerCeloTool(server, "celo_get_token_balance", "Get a supported ERC-20 token balance for a wallet on Celo.", {
    walletAddress: ADDRESS_Z.describe("Wallet address to check."),
    tokenSymbolOrAddress: z.string().describe("Token symbol or contract address."),
  });
  registerCeloTool(server, "celo_send", "Send CELO or a supported Celo token to a valid EVM address. Requires CELO_PRIVATE_KEY.", {
    to: ADDRESS_Z.describe("Exact destination wallet address."),
    amount: AMOUNT_Z.describe("Human-readable positive amount to send."),
    tokenSymbolOrAddress: TOKEN_Z.describe("Supported token to send."),
  });
  registerCeloTool(server, "celo_swap_quote", "Get a read-only swap quote between supported Celo tokens.", {
    fromToken: TOKEN_Z.describe("Token the user wants to sell."),
    toToken: TOKEN_Z.describe("Token the user wants to buy."),
    amount: AMOUNT_Z.describe("Human-readable positive input amount."),
  });
  registerCeloTool(server, "prepare_celo_swap", "Prepare, but do not execute, a Celo swap for wallet review/signing.", {
    fromToken: TOKEN_Z.describe("Token the user wants to sell."),
    toToken: TOKEN_Z.describe("Token the user wants to buy."),
    amount: AMOUNT_Z.describe("Human-readable positive input amount."),
    walletAddress: ADDRESS_Z.optional().describe("Wallet that will sign the swap."),
    slippageBps: SLIPPAGE_BPS_Z.describe("Slippage tolerance in basis points; defaults to 50."),
  });
  registerCeloTool(server, "celo_swap_execute", "Execute a token swap on Celo. Requires CELO_PRIVATE_KEY and prior user confirmation.", {
    fromToken: TOKEN_Z.describe("Token the user wants to sell."),
    toToken: TOKEN_Z.describe("Token the user wants to buy."),
    amount: AMOUNT_Z.describe("Human-readable positive input amount."),
    slippageBps: SLIPPAGE_BPS_Z.describe("Slippage tolerance in basis points; defaults to 50."),
  });
  registerCeloTool(server, "celo_aave_position", "Get Aave V3 lending/borrowing position for a wallet on Celo.", {
    walletAddress: ADDRESS_Z.describe("Wallet address to inspect."),
  });
  registerCeloTool(server, "celo_aave_supply", "Prepare an Aave V3 supply transaction on Celo. Requires wallet review/signing.", {
    asset: TOKEN_Z.describe("Supported asset to supply."),
    amount: AMOUNT_Z.describe("Human-readable positive amount to supply."),
    walletAddress: ADDRESS_Z.optional().describe("Wallet that will sign the supply."),
  });
  registerCeloTool(server, "self_verify", "Explain how to verify identity with Self Protocol on Celo.", {});
  registerCeloTool(server, "self_agent_id_check", "Check whether an address has a Self identity attestation.", {
    address: ADDRESS_Z.describe("Address to check."),
  });
  registerCeloTool(server, "x402_pay", "Explain or prepare an x402 API payment on Celo.", {
    endpoint: z.string().min(1).describe("API endpoint or payment target."),
    amount: AMOUNT_Z.optional().describe("Optional payment amount."),
    currency: TOKEN_Z.optional().describe("Optional payment currency; defaults to cUSD in explanations."),
  });
  registerCeloTool(server, "celo_docs_explain", "Answer questions about Celo using curated documentation.", {
    question: z.string().min(1).describe("User's Celo documentation question."),
  });
  registerCeloTool(server, "get_celo_gas_price", "Get the current Celo network gas price in Gwei.", {});
  registerCeloTool(server, "get_celo_network_stats", "Get Celo network stats such as block count, address count, daily transactions, and average block time.", {});
  registerCeloTool(server, "get_celo_defi_protocols", "Get top DeFi protocols deployed on Celo ranked by TVL.", {});
  registerCeloTool(server, "get_celo_yield_opportunities", "Get yield/APY opportunities on Celo.", {});
  registerCeloTool(server, "get_trending_celo_tokens", "Get trending token pools on Celo.", {});
  registerCeloTool(server, "get_celo_top_pools", "Get top DEX liquidity pools on Celo by reserve or volume.", {});
  registerCeloTool(server, "get_celo_top_tokens_by_holders", "Get top ERC-20 tokens on Celo ranked by holder count.", {});
  registerCeloTool(server, "get_celo_top_tokens_by_market_cap", "Get top Celo ecosystem tokens ranked by market cap.", {});
  registerCeloTool(server, "get_recently_launched_celo_tokens", "Get recently launched token pools on Celo.", {});
  registerCeloTool(server, "search_celo_tokens", "Search Celo ERC-20 tokens by name or symbol.", {
    query: z.string().min(1).describe("Token name or symbol to search."),
  });
  registerCeloTool(server, "get_celo_token_price", "Get USD price of a Celo token by CoinGecko ID.", {
    coingeckoId: z.string().min(1).describe("CoinGecko token ID, e.g. celo or celo-dollar."),
  });
  registerCeloTool(server, "get_celo_price_history", "Get historical price data for a Celo token over N days.", {
    coingeckoId: z.string().min(1).describe("CoinGecko token ID."),
    days: z.number().int().min(1).max(3650).describe("Number of days to fetch."),
  });
  registerCeloTool(server, "get_celo_token_info", "Get token info for a Celo token by contract address.", {
    address: ADDRESS_Z.describe("Token contract address."),
  });
  registerCeloTool(server, "get_celo_token_holders", "Get top holders of a specific ERC-20 token on Celo.", {
    tokenAddress: ADDRESS_Z.describe("Token contract address."),
  });
  registerCeloTool(server, "get_celo_wallet_portfolio", "Get full token portfolio for a wallet address on Celo.", {
    address: ADDRESS_Z.describe("Wallet address."),
  });
  registerCeloTool(server, "get_celo_wallet_stats", "Get wallet stats such as tx count, token transfer count, and native balance.", {
    address: ADDRESS_Z.describe("Wallet address."),
  });
  registerCeloTool(server, "get_celo_nft_balances", "Get ERC-721 and ERC-1155 NFT holdings for a wallet on Celo.", {
    address: ADDRESS_Z.describe("Wallet address."),
  });
  registerCeloTool(server, "get_celo_recent_transactions", "Get recent transactions for a wallet address on Celo.", {
    address: ADDRESS_Z.describe("Wallet address."),
  });
  registerCeloTool(server, "get_celo_transaction", "Fetch a specific transaction by hash. Retries automatically for Blockscout indexing lag.", {
    txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a valid 0x transaction hash (64 hex chars).").describe("Transaction hash."),
  });
  registerCeloTool(server, "get_celo_filtered_transactions", "Get filtered transaction history for a wallet — filter by direction, min CELO value, or date.", {
    address: ADDRESS_Z.describe("Wallet address."),
    direction: z.enum(["in", "out"]).optional().describe("Filter to incoming or outgoing transactions only."),
    minValueCelo: z.number().positive().optional().describe("Minimum native CELO value to include."),
    afterDate: z.string().optional().describe("ISO date string — only return transactions after this date."),
  });
  registerCeloTool(server, "check_malicious_transaction", "Analyze transaction calldata or hash for malicious patterns.", {
    txData: TX_DATA_Z.describe("Transaction calldata or hash."),
  });
  registerCeloTool(server, "check_contract_risk", "Check risk level of a smart contract on Celo.", {
    contractAddress: ADDRESS_Z.describe("Contract address."),
  });
  registerCeloTool(server, "check_token_risk", "Check risk level of a token on Celo.", {
    tokenAddress: ADDRESS_Z.describe("Token contract address."),
  });
  registerCeloTool(server, "explain_transaction_risk", "Explain the risk of a transaction in plain language.", {
    txData: TX_DATA_Z.describe("Transaction calldata or hash."),
  });
  registerCeloTool(server, "get_whale_wallet_activity", "Get recent activity for a whale wallet, or top Celo whales if address is omitted.", {
    address: ADDRESS_Z.optional().describe("Optional whale wallet address."),
    label: z.string().optional().describe("Optional label for the wallet."),
  });
  registerCeloTool(server, "compare_wallets", "Compare token holdings between two wallets.", {
    wallet1: ADDRESS_Z.describe("First wallet address."),
    wallet2: ADDRESS_Z.describe("Second wallet address."),
  });
  registerCeloTool(server, "analyze_copy_wallet_strategy", "Analyze what tokens to add/remove to mirror a source wallet. Read-only, never executes.", {
    sourceWallet: ADDRESS_Z.describe("Wallet to compare against."),
    myWallet: ADDRESS_Z.describe("User wallet."),
  });
  registerCeloTool(server, "get_portfolio_risk_score", "Get a heuristic portfolio-level risk score for a wallet.", {
    address: ADDRESS_Z.describe("Wallet address."),
  });

  return server;
}
