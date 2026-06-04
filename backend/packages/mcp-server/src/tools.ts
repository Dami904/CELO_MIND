/**
 * CeloMind MCP tool definitions and handler — shared by stdio (index.ts) and HTTP transport.
 * Import createMcpServer() to get a fully wired Server instance.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { findTokenAsync, resolveNetwork, marketNetwork } from "@celomind/shared";
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
} from "./market.js";
import { checkContractRisk, checkTokenRisk, explainTransaction } from "./risk.js";
import { getAavePosition, prepareAaveSupply } from "./aave.js";
import { getWhaleWalletActivity, analyzeCopyWallet, getTopCeloWhales } from "./whale.js";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);

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
  { name: "celo_send", description: "Send CELO or a token to an address (requires CELO_PRIVATE_KEY)", inputSchema: { type: "object", properties: { to: { type: "string" }, amount: { type: "string" }, tokenSymbolOrAddress: { type: "string" } }, required: ["to", "amount", "tokenSymbolOrAddress"] } },
  // ─── Swap ──────────────────────────────────────────────────────────────────
  { name: "celo_swap_quote", description: "Get a swap quote for two Celo tokens (read-only)", inputSchema: { type: "object", properties: { fromToken: { type: "string" }, toToken: { type: "string" }, amount: { type: "string" } }, required: ["fromToken", "toToken", "amount"] } },
  { name: "celo_swap_execute", description: "Execute a token swap on Celo (requires CELO_PRIVATE_KEY, user must confirm)", inputSchema: { type: "object", properties: { fromToken: { type: "string" }, toToken: { type: "string" }, amount: { type: "string" }, slippageBps: { type: "number" } }, required: ["fromToken", "toToken", "amount"] } },
  { name: "prepare_celo_swap", description: "Prepare (but not execute) a swap on Celo — returns unsigned txs for the wallet to sign", inputSchema: { type: "object", properties: { fromToken: { type: "string" }, toToken: { type: "string" }, amount: { type: "string" }, walletAddress: { type: "string" }, slippageBps: { type: "number" } }, required: ["fromToken", "toToken", "amount"] } },
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
      if (tokenSymbolOrAddress.toUpperCase() === "CELO") return ok({ network: NETWORK, ...(await sendNative(to, amount, NETWORK)) });
      const token = await findTokenAsync(tokenSymbolOrAddress, NETWORK);
      if (!token) return err(`Unknown token: ${tokenSymbolOrAddress}`);
      return ok({ network: NETWORK, token: token.symbol, ...(await sendToken(token.address, to, amount, NETWORK)) });
    }
    case "celo_swap_quote": {
      const { fromToken, toToken, amount } = args as { fromToken: string; toToken: string; amount: string };
      const quote = await getSwapQuote(fromToken, toToken, amount, NETWORK);
      return "error" in quote ? err(quote.error) : ok({ network: NETWORK, ...quote });
    }
    case "prepare_celo_swap": {
      const { fromToken, toToken, amount, walletAddress, slippageBps } = args as { fromToken: string; toToken: string; amount: string; walletAddress?: string; slippageBps?: number };
      let owner = walletAddress;
      if (!owner && process.env.CELO_PRIVATE_KEY) { try { owner = getWalletClient(NETWORK).account!.address; } catch { /* ignore */ } }
      if (!owner) return err("Provide walletAddress (or set CELO_PRIVATE_KEY) to prepare a swap.");
      const prepared = await prepareSwap(fromToken, toToken, amount, owner, slippageBps ?? 50, NETWORK);
      return "error" in prepared ? err(prepared.error) : ok({ network: NETWORK, ...prepared });
    }
    case "celo_swap_execute": {
      const { fromToken, toToken, amount, slippageBps } = args as { fromToken: string; toToken: string; amount: string; slippageBps?: number };
      const result = await executeSwap(fromToken, toToken, amount, slippageBps ?? 50, NETWORK);
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

/** Create a fully configured MCP Server instance. Use with any transport (stdio or HTTP). */
export function createMcpServer(): Server {
  const server = new Server({ name: "celomind-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try { return await handleTool(name, args as Record<string, unknown>); }
    catch (e: unknown) { return err(e instanceof Error ? e.message : String(e)); }
  });
  return server;
}
