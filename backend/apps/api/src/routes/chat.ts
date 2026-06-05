import type { FastifyInstance } from "fastify";
import { makeOk, makeErr, ChatRequestSchema, type Intent, getTokenList, resolveNetwork } from "@celomind/shared";
import { buildDocsContextAsync, buildDocsContext } from "@celomind/docs-knowledge";
import { resolveIntent } from "../ai/intent-router.js";
import { aiComplete, routeForIntent, type AIMessage } from "../ai/providers.js";
import {
  getChatMessages,
  getChatConversationSummary,
  logChatMessage,
  upsertChatConversationSummary,
} from "../db/sqlite.js";
import { recordChatRequest, type MetricsProvider } from "../../../../dashboard/src/index.js";
import { marketNetwork } from "@celomind/shared";
import { getNativeBalance, getTokenBalance } from "@celomind/mcp-server/celo-client";
import {
  getCeloTokenPrice,
  getTrendingCeloTokens,
  getRecentlyLaunchedCeloTokens,
  getCeloTokenInfo,
  getCeloWalletPortfolio,
  getCeloRecentTransactions,
  getCeloTopTokensByHolders,
  getCeloTopTokensByMarketCap,
  getCeloGasPrice,
  getCeloDefiProtocols,
  getCeloNetworkStats,
  getCeloPriceHistory,
  getCeloTopPools,
  searchCeloTokens,
  getCeloTokenHolders,
  getCeloWalletStats,
  getCeloNFTBalances,
  getCeloYieldOpportunities,
} from "@celomind/mcp-server/market";
import { checkContractRisk, checkTokenRisk, explainTransaction } from "@celomind/mcp-server/risk";
import { getWhaleWalletActivity, analyzeCopyWallet, getTopCeloWhales } from "@celomind/mcp-server/whale";
import { getSwapQuote, prepareSwap, parseSwapRequest } from "@celomind/mcp-server/swap";
import { prepareTransfer, parseSendRequest } from "@celomind/mcp-server/transfer";
import { getAavePosition, prepareAaveSupply } from "@celomind/mcp-server/aave";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;
const HASH_RE = /0x[0-9a-fA-F]{64}/;
const CHAT_MEMORY_LIMIT = 8;

function extractAddress(message: string, fallback?: string): string | undefined {
  return message.match(ADDRESS_RE)?.[0] ?? fallback;
}

function extractTwoAddresses(message: string, fallback?: string): [string | undefined, string | undefined] {
  const matches = message.match(new RegExp(ADDRESS_RE.source, "g")) ?? [];
  return [matches[0] ?? fallback, matches[1] ?? fallback];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveMentionedToken(message: string, network = NETWORK) {
  const tokens = Object.values(getTokenList(network));
  return tokens.find((token) => {
    const candidates = [token.symbol, token.name, token.coingeckoId?.replace(/-/g, " "), token.address].filter(Boolean) as string[];
    return candidates.some((candidate) => new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "i").test(message));
  });
}

/** Loosely extract a payment "{amount} {TOKEN} ... 0x{recipient}" from free text (used by x402). */
function parsePayment(message: string): { amount: string; token: string; to: string } | null {
  const to = message.match(ADDRESS_RE)?.[0];
  const amt = message.match(/([\d.]+)\s*([a-zA-Z$]{2,10})\b/);
  if (to && amt) return { amount: amt[1], token: amt[2], to };
  return null;
}

async function swapQuoteData(message: string) {
  const parsed = parseSwapRequest(message);
  if (!parsed) return { note: "Tell me the amount and tokens, e.g. \"swap 3 USDT to CELO\"." };
  const quote = await getSwapQuote(parsed.fromToken, parsed.toToken, parsed.amount);
  if ("error" in quote) return { note: quote.error };
  return { result: quote, source: quote.source };
}

function getAaveInfo(walletAddress?: string) {
  return {
    walletAddress,
    source: "Aave/Celo contract reference",
    protocol: "Aave V3 on Celo",
    status: walletAddress ? "position_lookup_prepared" : "wallet_required",
    message: walletAddress
      ? "Aave position lookup is prepared for this wallet. Live position reads should query Aave Pool getUserAccountData."
      : "Connect or provide a wallet address to read the Aave position.",
    aavePoolAddress: "0x3E59A31363E6b6d5E4BF2b15D01Fc8a52f1De78",
    supportedAssets: ["CELO", "cUSD", "cEUR", "USDC", "WETH"],
  };
}

function getSelfInfo(address?: string) {
  return {
    address,
    source: "Self Protocol docs",
    protocol: "Self",
    status: "prepared",
    message: address
      ? "Self agent/identity verification requires querying the relevant Self attestation or agent identity integration for this address."
      : "Self lets users prove identity attributes with privacy-preserving proofs.",
    docs: "https://docs.self.xyz",
  };
}

function getX402Info(message: string) {
  return {
    source: "x402 protocol docs",
    protocol: "x402",
    status: "confirmation_required",
    message: "x402 payment requests are prepared only. A wallet confirmation is required before any payment can be executed.",
    detectedRequest: message,
    flow: ["Request gated resource", "Receive HTTP 402 payment requirements", "Review payment", "Confirm with wallet", "Retry request with proof"],
  };
}

export async function buildChatMemory(chatReq: { conversationId?: string; walletAddress?: string; chatbotType: string }): Promise<AIMessage[]> {
  try {
    const conversationId = chatReq.conversationId?.trim();
    const walletAddress = chatReq.walletAddress?.trim();

    if (!conversationId && !walletAddress) return [];

    const messages = await getChatMessages({
      conversationId: conversationId || undefined,
      walletAddress: walletAddress || undefined,
      chatbotType: chatReq.chatbotType,
      limit: CHAT_MEMORY_LIMIT,
    });

    return messages
      .reverse()
      .filter((msg) => msg.role === "user" || msg.role === "assistant")
      .map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));
  } catch {
    return [];
  }
}

function compactText(value: string, maxChars: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildSummaryFallback(previousSummary: string | null, recentTurns: AIMessage[], userMessage: string, assistantReply: string): string {
  const parts: string[] = [];
  if (previousSummary?.trim()) parts.push(previousSummary.trim());

  const recent = recentTurns
    .slice(-4)
    .map((msg) => `${msg.role === "assistant" ? "Assistant" : "User"}: ${compactText(msg.content, 180)}`);

  if (recent.length) {
    parts.push(`Recent turns:\n${recent.join("\n")}`);
  }

  parts.push(`Latest user message: ${compactText(userMessage, 220)}`);
  parts.push(`Latest assistant reply: ${compactText(assistantReply, 220)}`);

  return compactText(parts.join("\n\n"), 1200);
}

async function refreshConversationSummary(
  chatReq: { conversationId?: string; walletAddress?: string; chatbotType: string },
  previousSummary: string | null,
  recentTurns: AIMessage[],
  userMessage: string,
  assistantReply: string
): Promise<void> {
  const scope = {
    conversationId: chatReq.conversationId,
    walletAddress: chatReq.walletAddress,
    chatbotType: chatReq.chatbotType,
  };

  const transcript = [
    previousSummary?.trim() ? `Existing summary:\n${previousSummary.trim()}` : "Existing summary: (none)",
    "Recent conversation turns:",
    ...recentTurns.map((msg) => `${msg.role === "assistant" ? "Assistant" : "User"}: ${msg.content}`),
    `User: ${userMessage}`,
    `Assistant: ${assistantReply}`,
  ].join("\n");

  try {
    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content:
            "You maintain a compact long-term memory for a Celo blockchain chat assistant. Rewrite the conversation summary so it stays short, factual, and useful for future turns. Keep at most 5 bullet points or one short paragraph, under 900 characters if possible. Preserve durable facts like user goals, wallet addresses, token names, protocol names, amounts, and open questions. Drop filler, repetition, and chain-of-thought. Output only the updated summary.",
        },
        { role: "user", content: transcript },
      ],
      maxTokens: 180,
      temperature: 0.1,
    });

    const summary = compactText(result.text, 1200);
    if (summary) {
      await upsertChatConversationSummary(scope, summary);
      return;
    }
  } catch {
    // Fall through to the deterministic summary below.
  }

  const fallbackSummary = buildSummaryFallback(previousSummary, recentTurns, userMessage, assistantReply);
  await upsertChatConversationSummary(scope, fallbackSummary);
}

/** Unwrap a `{ items|result, source }` envelope (used by market/data intents) into payload + source. */
function unwrapEnvelope(data: unknown): { payload: unknown; source?: string } {
  if (data && typeof data === "object" && "source" in data && ("items" in data || "result" in data)) {
    const d = data as { items?: unknown; result?: unknown; source?: string };
    return { payload: d.items ?? d.result, source: d.source };
  }
  return { payload: data };
}

function formatFallbackAnswer(intent: Intent, data: unknown): string {
  if (intent === "unsupported") {
    return "I focus on the Celo ecosystem — ask me about Celo tokens, prices, wallets, swaps, DeFi, whales, or security and I'll help.";
  }
  if (!data) return "I could not find enough live data for that request yet. Try adding a wallet address, token address, or transaction hash.";
  if (typeof data === "object" && data !== null && "note" in data) return String((data as { note: unknown }).note);

  const { payload, source } = unwrapEnvelope(data);
  const srcLine = (fallback: string) => `Source: ${source ?? fallback}.`;

  switch (intent) {
    case "market_trending": {
      const items = Array.isArray(payload) ? payload.slice(0, 8) : [];
      if (!items.length) return "I checked the live sources, but no trending Celo tokens came back right now.";
      return [
        `Trending Celo tokens (${source ?? "GeckoTerminal"}):`,
        ...items.map((item, i) => {
          const pool = item as { name?: string; symbol?: string; priceUsd?: string; volume24h?: string; poolCreatedAt?: string };
          return `${i + 1}. ${pool.name ?? pool.symbol ?? "Unknown"}${pool.priceUsd ? ` at $${pool.priceUsd}` : ""}${pool.volume24h ? `, 24h volume $${Number(pool.volume24h).toLocaleString()}` : ""}${pool.poolCreatedAt ? `, pool created ${pool.poolCreatedAt}` : ""}`;
        }),
        srcLine("GeckoTerminal"),
      ].join("\n");
    }
    case "recent_launches": {
      const items = Array.isArray(payload) ? payload.slice(0, 8) : [];
      if (!items.length) return "I checked GeckoTerminal, but no recently launched Celo pools came back right now.";
      return [`Recently launched Celo pools (${source ?? "GeckoTerminal"}):`, ...items.map((item, i) => {
        const pool = item as { name?: string; symbol?: string; priceUsd?: string; poolCreatedAt?: string };
        return `${i + 1}. ${pool.name ?? pool.symbol ?? "Unknown pool"}${pool.priceUsd ? ` at $${pool.priceUsd}` : ""}${pool.poolCreatedAt ? `, created ${pool.poolCreatedAt}` : ""}`;
      }), srcLine("GeckoTerminal")].join("\n");
    }
    case "token_price": {
      const entries = isRecord(payload) ? Object.entries(payload) : [];
      if (!entries.length) return `Live token prices from ${source ?? "CoinGecko"} are currently unavailable.`;
      const lines = entries.map(([label, value]) => {
        const price = value as { usd?: number; usd_24h_change?: number } | null;
        if (price && typeof price.usd === "number") {
          const change = typeof price.usd_24h_change === "number"
            ? ` (${price.usd_24h_change >= 0 ? "+" : ""}${price.usd_24h_change.toFixed(2)}% 24h)`
            : "";
          return `${label}: $${price.usd.toFixed(6)}${change}`;
        }
        return `${label}: unavailable`;
      });
      return `Live token prices from ${source ?? "CoinGecko"}:\n${lines.join("\n")}`;
    }
    case "token_info": {
      const t = payload as { symbol?: string; name?: string; usdPrice?: string | null; holdersCount?: string | null; circulatingMarketCap?: string | null };
      return `${t.name ?? "Token"} (${t.symbol ?? "?"})${t.usdPrice ? ` — $${t.usdPrice}` : ""}${t.holdersCount ? `, ${Number(t.holdersCount).toLocaleString()} holders` : ""}${t.circulatingMarketCap ? `, market cap $${Number(t.circulatingMarketCap).toLocaleString()}` : ""}.\n${srcLine("Blockscout")}`;
    }
    case "balance": {
      const b = payload as { balance?: string; balanceRaw?: string };
      return `Wallet CELO balance: ${b.balance ?? "unknown"} CELO.\nSource: Celo RPC.`;
    }
    case "token_balance":
    case "wallet_portfolio": {
      const items = Array.isArray(payload) ? payload.slice(0, 12) : [];
      if (!items.length) return `I could not find token portfolio data for that wallet yet. ${srcLine(source ?? "Blockscout")}`;
      return ["Wallet portfolio summary:", ...items.map((item, i) => {
        const token = item as { symbol?: string; name?: string; balance?: string; usdValue?: string | null; address?: string };
        return `${i + 1}. ${token.symbol ?? token.name ?? "Token"}${token.balance ? `: ${token.balance}` : ""}${token.usdValue ? ` ($${token.usdValue})` : ""}${token.address ? ` (${token.address})` : ""}`;
      }), srcLine("Blockscout")].join("\n");
    }
    case "recent_transactions": {
      const txs = Array.isArray(payload) ? payload.slice(0, 8) : [];
      if (!txs.length) return "I checked Blockscout, but found no recent transactions for that wallet.";
      return [`Recent wallet transactions (${source ?? "Blockscout"}):`, ...txs.map((tx, i) => {
        const t = tx as { hash?: string; timestamp?: string; timeStamp?: string; from?: { hash?: string } | string; to?: { hash?: string } | string; status?: string; result?: string; isError?: string };
        const from = typeof t.from === "object" ? t.from?.hash : t.from;
        const to = typeof t.to === "object" ? t.to?.hash : t.to;
        const ts = t.timestamp ?? (t.timeStamp ? new Date(Number(t.timeStamp) * 1000).toISOString() : undefined);
        const okFlag = t.status === "ok" || t.result === "success" || t.isError === "0";
        return `${i + 1}. ${t.hash ?? "Unknown hash"} ${okFlag ? "succeeded" : "failed/pending"}${from && to ? ` from ${from} to ${to}` : ""}${ts ? ` at ${ts}` : ""}`;
      }), srcLine("Blockscout")].join("\n");
    }
    case "contract_risk":
    case "token_risk":
    case "malicious_tx_check":
    case "transaction_explain": {
      const risk = payload as { riskLevel?: string; riskScore?: number; explanation?: string; recommendation?: string; uncertainty?: string };
      return `Risk result: ${risk.riskLevel ?? "unknown"}${typeof risk.riskScore === "number" ? ` (${risk.riskScore}/100)` : ""}.\n${risk.explanation ?? ""}\nRecommendation: ${risk.recommendation ?? "Review carefully before signing."}${risk.uncertainty ? `\nUncertainty: ${risk.uncertainty}` : ""}\n${srcLine("Blockscout")}`;
    }
    case "aave_position": {
      const p = payload as { totalCollateralUsd?: string; totalDebtUsd?: string; availableBorrowsUsd?: string; healthFactor?: string; hasPosition?: boolean };
      if (!p || p.hasPosition === false) return "No active Aave V3 position for that wallet (no collateral or debt).\nSource: Aave V3 Pool.";
      return `Aave V3 position:\nCollateral: $${p.totalCollateralUsd} · Debt: $${p.totalDebtUsd} · Available to borrow: $${p.availableBorrowsUsd}\nHealth factor: ${p.healthFactor}.\nSource: Aave V3 Pool.`;
    }
    case "whale_watch":
    case "whale_activity": {
      const { payload, source } = unwrapEnvelope(data);
      if (Array.isArray(payload)) {
        const items = payload.slice(0, 10);
        if (!items.length) return "I couldn't fetch the Whale Leaderboard right now.";
        return [
          "Whale Leaderboard:",
          ...items.map((it, i) => {
            const w = it as Record<string, unknown>;
            const addr =
              (w.address && typeof w.address === "object" ? (w.address as { hash?: string }).hash : w.address) ??
              w.wallet ?? w.holder ?? w.name ?? "unknown";
            const val = w.value ?? w.balance ?? w.usdValue ?? w.amount ?? w.total;
            return `${i + 1}. ${addr}${val ? ` — ${val}` : ""}`;
          }),
          `Source: ${source ?? "Dune"}.`,
        ].join("\n");
      }
      const whale = payload as { address?: string; nativeBalance?: string; txCount?: number; label?: string };
      return `Whale Wallet Activity from Blockscout:\nWallet: ${whale.address ?? "unknown"}${whale.label ? ` (${whale.label})` : ""}\nNative balance: ${whale.nativeBalance ?? "0"} CELO\nRecent transaction count fetched: ${whale.txCount ?? 0}`;
    }
    case "copy_wallet_analyze":
    case "copy_wallet_prepare": {
      const copy = data as { sourceWallet?: string; myWallet?: string; tokensToAdd?: string[]; tokensToRemove?: string[]; warning?: string };
      return `Copy-wallet analysis only, no trade executed.\nSource wallet: ${copy.sourceWallet ?? "unknown"}\nYour wallet: ${copy.myWallet ?? "unknown"}\nTokens to research/add: ${(copy.tokensToAdd ?? []).join(", ") || "none"}\nTokens to review/remove: ${(copy.tokensToRemove ?? []).join(", ") || "none"}\n${copy.warning ?? "Prepared actions require review and wallet confirmation."}`;
    }
    case "gas_price": {
      const gp = payload as { gasPriceGwei?: string; gasPriceWei?: string };
      if (!gp?.gasPriceGwei) return "Could not fetch current gas price. Try again shortly.";
      return `Current Celo gas price: ${gp.gasPriceGwei} Gwei (${gp.gasPriceWei} wei).\nSource: Celo RPC.`;
    }
    case "defi_protocols": {
      const items = Array.isArray(payload) ? payload.slice(0, 10) : [];
      if (!items.length) return "Could not fetch DeFi protocol data from DefiLlama right now.";
      return [
        `Top DeFi protocols on Celo (${source ?? "DefiLlama"}):`,
        ...items.map((p, i) => {
          const prot = p as { name?: string; tvlUsd?: number; category?: string };
          return `${i + 1}. ${prot.name ?? "?"}${prot.category ? ` (${prot.category})` : ""}${typeof prot.tvlUsd === "number" ? ` — TVL $${prot.tvlUsd.toLocaleString()}` : ""}`;
        }),
        `Source: ${source ?? "DefiLlama"}.`,
      ].join("\n");
    }
    case "network_stats": {
      const s = payload as { totalBlocks?: number; totalAddresses?: number; totalTransactions?: number; transactionsToday?: number; averageBlockTimeMs?: number; coinPriceUsd?: string | null };
      if (!s) return "Could not fetch Celo network stats right now.";
      return [
        "Celo network stats (Blockscout):",
        `Total blocks: ${s.totalBlocks?.toLocaleString() ?? "?"}`,
        `Total addresses: ${s.totalAddresses?.toLocaleString() ?? "?"}`,
        `Total transactions: ${s.totalTransactions?.toLocaleString() ?? "?"}`,
        `Transactions today: ${s.transactionsToday?.toLocaleString() ?? "?"}`,
        `Avg block time: ${s.averageBlockTimeMs ? `${(s.averageBlockTimeMs / 1000).toFixed(1)}s` : "?"}`,
        s.coinPriceUsd ? `CELO price: $${s.coinPriceUsd}` : "",
        `Source: ${source ?? "Blockscout"}.`,
      ].filter(Boolean).join("\n");
    }
    case "price_history": {
      const items = Array.isArray(payload) ? payload : [];
      if (!items.length) return "Could not fetch price history from CoinGecko right now.";
      return [
        `${(data as { token?: string }).token?.toUpperCase() ?? "CELO"} price over ${(data as { period?: string }).period ?? "7 days"} (${source ?? "CoinGecko"}):`,
        ...items.map((p) => {
          const pt = p as { date?: string; priceUsd?: string };
          return `  ${pt.date ?? "?"}: $${pt.priceUsd ?? "?"}`;
        }),
      ].join("\n");
    }
    case "top_pools": {
      const items = Array.isArray(payload) ? payload.slice(0, 10) : [];
      if (!items.length) return "Could not fetch pool data from GeckoTerminal right now.";
      return [
        `Top Celo liquidity pools (${source ?? "GeckoTerminal"}):`,
        ...items.map((p, i) => {
          const pool = p as { name?: string; reserveUsd?: string; volume24hUsd?: string; feeTier?: string | null };
          return `${i + 1}. ${pool.name ?? "?"}${pool.reserveUsd ? ` — Reserve $${Number(pool.reserveUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}${pool.volume24hUsd ? `, 24h Vol $${Number(pool.volume24hUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}`;
        }),
        `Source: ${source ?? "GeckoTerminal"}.`,
      ].join("\n");
    }
    case "token_search": {
      const items = Array.isArray(payload) ? payload : [];
      if (!items.length) return `No tokens found matching that search on Celo. Try a different name or symbol.`;
      return [
        `Celo tokens matching "${(data as { query?: string }).query ?? ""}" (${source ?? "Blockscout"}):`,
        ...items.map((t, i) => {
          const tok = t as { symbol?: string; name?: string; address?: string; holdersCount?: string | null; usdPrice?: string | null };
          return `${i + 1}. ${tok.symbol ?? "?"} — ${tok.name ?? "?"}${tok.usdPrice ? ` @ $${tok.usdPrice}` : ""}${tok.holdersCount ? `, ${Number(tok.holdersCount).toLocaleString()} holders` : ""}`;
        }),
        `Source: ${source ?? "Blockscout"}.`,
      ].join("\n");
    }
    case "token_holders": {
      const items = Array.isArray(payload) ? payload.slice(0, 10) : [];
      if (!items.length) return "Could not fetch token holders from Blockscout. Make sure the address is a valid ERC-20 token.";
      return [
        "Top token holders (Blockscout):",
        ...items.map((h, i) => {
          const holder = h as { address?: string; value?: string; isContract?: boolean; label?: string | null };
          return `${i + 1}. ${holder.address ?? "?"}${holder.label ? ` (${holder.label})` : ""}${holder.isContract ? " [contract]" : ""} — ${holder.value ?? "?"}`;
        }),
        `Source: ${source ?? "Blockscout"}.`,
      ].join("\n");
    }
    case "wallet_stats": {
      const s = payload as { address?: string; nativeBalance?: string; txCount?: number; tokenTransfersCount?: number; isContract?: boolean };
      if (!s) return "Could not fetch wallet stats from Blockscout.";
      return [
        `Wallet stats (${source ?? "Blockscout"}):`,
        `Address: ${s.address ?? "?"}`,
        `Native balance: ${s.nativeBalance ?? "0"} CELO`,
        `Total transactions: ${s.txCount?.toLocaleString() ?? "0"}`,
        `Token transfers: ${s.tokenTransfersCount?.toLocaleString() ?? "0"}`,
        s.isContract ? "Type: Contract" : "Type: Externally-owned account (EOA)",
        `Source: ${source ?? "Blockscout"}.`,
      ].join("\n");
    }
    case "nft_balances": {
      const items = Array.isArray(payload) ? payload : [];
      if (!items.length) return `No NFTs found in that wallet on Celo. NFTs must be ERC-721 or ERC-1155 tokens indexed on Blockscout.`;
      return [
        `NFTs in wallet (${source ?? "Blockscout"}):`,
        ...items.map((n, i) => {
          const nft = n as { name?: string | null; symbol?: string | null; tokenId?: string; type?: string };
          return `${i + 1}. ${nft.name ?? nft.symbol ?? "Unknown NFT"} #${nft.tokenId ?? "?"} (${nft.type ?? "ERC-721"})`;
        }),
        `Source: ${source ?? "Blockscout"}.`,
      ].join("\n");
    }
    case "yield_info": {
      const items = Array.isArray(payload) ? payload.slice(0, 10) : [];
      if (!items.length) return "Could not fetch yield data from DefiLlama Yields right now.";
      return [
        `Best yield opportunities on Celo (${source ?? "DefiLlama Yields"}):`,
        ...items.map((y, i) => {
          const yld = y as { project?: string; symbol?: string; apy?: string; apyBase?: string | null; apyReward?: string | null; tvlUsd?: number };
          return `${i + 1}. ${yld.project ?? "?"} — ${yld.symbol ?? "?"} — APY ${yld.apy ?? "?"}${yld.apyReward ? ` (base ${yld.apyBase ?? "?"} + reward ${yld.apyReward})` : ""}${yld.tvlUsd ? `, TVL $${yld.tvlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}`;
        }),
        `Source: ${source ?? "DefiLlama Yields"}.`,
      ].join("\n");
    }
    case "docs_explain":
    case "mcp_setup":
    case "claude_setup": {
      const context = (data as { context?: string }).context;
      return context ? `Based on live/curated documentation:\n\n${context}` : "I could not fetch documentation context for that question.";
    }
    case "swap_quote": {
      const q = payload as { fromToken?: string; toToken?: string; amountIn?: string; amountOut?: string; rate?: number; feeTier?: number };
      if (!q?.amountOut) return "I couldn't get a swap quote for that pair right now.";
      return `Swap quote (${source ?? "Uniswap V3"}): ${q.amountIn} ${q.fromToken} → ~${q.amountOut} ${q.toToken}\nRate: 1 ${q.fromToken} ≈ ${q.rate?.toFixed(6)} ${q.toToken} · fee tier ${q.feeTier}.\nThis is a quote only — nothing was executed.`;
    }
    case "swap_execute": {
      const s = data as { quote?: { fromToken?: string; toToken?: string; amountIn?: string; amountOut?: string }; minAmountOut?: string; transactions?: { type: string }[] };
      if (!s?.quote) return "Connect your wallet and tell me the amount + tokens, e.g. \"swap 3 USDT to CELO\".";
      const steps = (s.transactions ?? []).map((t) => t.type).join(" → ");
      return `Prepared swap (Uniswap V3): ${s.quote.amountIn} ${s.quote.fromToken} → ~${s.quote.amountOut} ${s.quote.toToken} (min ${s.minAmountOut}).\nSteps to sign in your wallet: ${steps}.\nNothing was executed — review and confirm in your wallet.`;
    }
    case "send":
    case "x402_pay": {
      const t = data as { token?: string; amount?: string; to?: string; transaction?: unknown };
      if (t?.transaction && t.to) return `Prepared transfer: ${t.amount} ${t.token} → ${t.to}.\nReview and sign in your wallet — the backend does not move funds.`;
      return "This is a write/payment operation. I prepared the request, but nothing was executed. Please confirm in your wallet.";
    }
    case "aave_supply": {
      const s = data as { asset?: string; amount?: string; transactions?: { type: string }[] };
      if (!s?.transactions) return "Tell me the amount and asset, e.g. \"supply 10 cUSD to Aave\".";
      return `Prepared Aave V3 supply: ${s.amount} ${s.asset}.\nSteps to sign: ${(s.transactions ?? []).map((x) => x.type).join(" → ")}.\nNothing executed — confirm in your wallet.`;
    }
    default:
      return typeof data === "string" ? data : `Here is the clean result I found:\n${JSON.stringify(data, null, 2)}`;
  }
}

// ─── System prompts by chatbot type ──────────────────────────────────────────
function getSystemPrompt(chatbotType: string, network: string): string {
  const base = `You are CeloMind, an AI assistant specializing exclusively in the Celo blockchain ecosystem — Celo itself, its tokens and stablecoins (CELO, cUSD, cEUR, cREAL), wallets, DeFi (swaps, Mento, Aave), security/risk, market data, and the CeloMind app/MCP server.

SCOPE (important): Only answer questions within this Celo / blockchain / crypto / DeFi / wallet scope. If the user asks about anything unrelated — general trivia, recipes, geography, entertainment, math, coding help, etc. — do NOT answer it. Politely decline in one short sentence and invite a Celo-related question instead.

When "Live Celo data for this request" is provided below, treat it as current and authoritative and base your answer on it (do not contradict it or rely on stale memory). Be clear, concise, and honest about uncertainty. Current network: ${network}.`;

  const extras: Record<string, string> = {
    landing: `${base} You are the landing page assistant — be welcoming and informative. Do NOT execute any write operations.`,
    docs: `${base} You are the documentation assistant. Focus on explaining Celo concepts clearly with examples.`,
    mini: `${base} You are a compact assistant widget. Be brief and direct.`,
    tool: `${base} You are assisting with a specific tool. Provide step-by-step guidance.`,
    full: base,
  };

  return extras[chatbotType] ?? base;
}

// ─── Intent data fetcher ──────────────────────────────────────────────────────
async function fetchIntentData(intent: Intent, req: { message: string; walletAddress?: string; selectedTool?: string }) {
  const net = NETWORK;
  const wa = req.walletAddress;

  try {
    switch (intent) {
      case "balance":
        if (!wa) return { note: "No wallet address provided. Please connect your wallet." };
        return await getNativeBalance(wa, net);

      case "token_balance": {
        if (!wa) return { note: "No wallet address provided." };
        const tokenSymbols = Object.values(getTokenList(net));
        const balances = await Promise.allSettled(
          tokenSymbols.map((t) => getTokenBalance(wa, t.address, net).then((b) => ({ ...t, ...b })))
        );
        const items = balances.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<unknown>).value);
        return { items, source: "Celo RPC" };
      }

      case "token_price": {
        const mentioned = resolveMentionedToken(req.message, net);
        if (mentioned?.coingeckoId) {
          const price = await getCeloTokenPrice(mentioned.coingeckoId);
          return {
            result: { [mentioned.symbol]: price },
            source: "CoinGecko",
            note: !price ? `Live price data for ${mentioned.symbol} is unavailable right now.` : undefined,
          };
        }

        const supported = Object.values(getTokenList(net)).filter((token) => token.coingeckoId);
        const prices = await Promise.all(
          supported.map(async (token) => [token.symbol, await getCeloTokenPrice(token.coingeckoId as string)] as const)
        );
        const result = Object.fromEntries(prices);
        return {
          result,
          source: "CoinGecko",
          note: Object.values(result).every((price) => !price) ? "Live token price data is unavailable right now." : undefined,
        };
      }

      case "market_trending": {
        const msg = req.message.toLowerCase();
        const wantsHolders = /holder|most holder|by holder/.test(msg);
        const wantsMarketCap = /market cap|by market cap|highest market|largest market/.test(msg);

        if (wantsHolders) {
          const r = await getCeloTopTokensByHolders();
          return { items: r.data, source: r.source, note: "Tokens ranked by on-chain holder count (Blockscout)" };
        }
        if (wantsMarketCap) {
          const [mc, trending] = await Promise.allSettled([getCeloTopTokensByMarketCap(), getTrendingCeloTokens()]);
          const mcData = mc.status === "fulfilled" ? mc.value : { data: [], source: "unavailable" };
          const trendData = trending.status === "fulfilled" ? trending.value : { data: [], source: "unavailable" };
          return { marketCapItems: mcData.data, trendingItems: trendData.data, source: `${mcData.source} + ${trendData.source}` };
        }
        const r = await getTrendingCeloTokens();
        return { items: r.data, source: r.source };
      }

      case "token_info": {
        const address = extractAddress(req.message, req.selectedTool);
        if (!address) return { note: "Provide a Celo token contract address to fetch token info." };
        const r = await getCeloTokenInfo(address, marketNetwork());
        return r ? { result: r.data, source: r.source } : { note: "No token info found for that address." };
      }

      case "recent_launches": {
        const r = await getRecentlyLaunchedCeloTokens();
        return { items: r.data, source: r.source };
      }

      case "wallet_portfolio": {
        if (!wa) return { note: "No wallet address provided." };
        const r = await getCeloWalletPortfolio(wa, net);
        return { items: r.data, source: r.source };
      }

      case "recent_transactions": {
        if (!wa) return { note: "No wallet address provided." };
        const r = await getCeloRecentTransactions(wa, net);
        return { items: r.data, source: r.source };
      }

      case "docs_explain":
        return { context: await buildDocsContextAsync(req.message) };

      case "mcp_setup":
        return { context: await buildDocsContextAsync("MCP and Claude Desktop") };

      case "claude_setup":
        return { context: await buildDocsContextAsync("Claude Desktop MCP server setup") };

      case "swap_quote":
        return await swapQuoteData(req.message);

      case "aave_position": {
        const addr = extractAddress(req.message, wa);
        if (!addr) return { note: "Connect or provide a wallet address to read its Aave V3 position." };
        try {
          return { result: await getAavePosition(addr, marketNetwork()), source: "Aave V3 Pool" };
        } catch {
          return { ...getAaveInfo(addr), note: "Could not read the live Aave position right now." };
        }
      }

      case "self_verify":
        return { ...getSelfInfo(extractAddress(req.message, wa)), context: await buildDocsContextAsync("Self Protocol Celo identity verification") };

      case "agent_id_check":
        return getSelfInfo(extractAddress(req.message, wa));

      case "x402_pay": {
        // The real, signable leg of an x402 flow is the payment transfer. If the message names an
        // amount + token + recipient, prepare it; otherwise explain the flow.
        const pay = parsePayment(req.message);
        if (pay) {
          const prepared = await prepareTransfer(pay.to, pay.amount, pay.token, marketNetwork());
          if (!("error" in prepared)) return { ...prepared, protocol: "x402", requires_confirmation: true };
        }
        return getX402Info(req.message);
      }

      case "whale_watch": {
        const top = await getTopCeloWhales();
        return { items: top.data, source: top.source };
      }

      case "whale_activity": {
        const address = extractAddress(req.message, wa);
        if (!address) return { note: "Send the whale wallet address you want me to inspect, or ask for top whale wallets instead." };
        return await getWhaleWalletActivity(address, marketNetwork());
      }

      case "contract_risk": {
        // Try to extract address from message
        const match = req.message.match(/0x[0-9a-fA-F]{40}/);
        if (!match) return { note: "Provide a contract address (0x...) in your message." };
        return await checkContractRisk(match[0], marketNetwork());
      }

      case "token_risk": {
        const match = req.message.match(/0x[0-9a-fA-F]{40}/);
        if (!match) return { note: "Provide a token address (0x...) in your message." };
        return await checkTokenRisk(match[0], marketNetwork());
      }

      case "malicious_tx_check":
        return { result: await explainTransaction(req.message, marketNetwork()), source: "Blockscout + heuristics" };

      case "copy_wallet_analyze": {
        const [source, mine] = extractTwoAddresses(req.message, wa);
        if (!source || !mine || source === mine) {
          return { note: "Provide source wallet and your wallet address to compare." };
        }
        return await analyzeCopyWallet(source, mine, marketNetwork());
      }

      case "copy_wallet_prepare": {
        const [source, mine] = extractTwoAddresses(req.message, wa);
        if (!source || !mine || source === mine) {
          return { note: "Provide source wallet and your wallet address. I will prepare actions only; nothing executes automatically." };
        }
        const analysis = await analyzeCopyWallet(source, mine, marketNetwork());
        // Real, live quotes for acquiring each missing token (illustrative 1 cUSD each).
        const suggestedSwaps: { token: string; route?: string; quote: string }[] = [];
        for (const sym of analysis.tokensToAdd.slice(0, 3)) {
          const q = await getSwapQuote("cUSD", sym, "1", marketNetwork());
          if (!("error" in q)) suggestedSwaps.push({ token: sym, route: q.route, quote: `1 cUSD ≈ ${q.amountOut} ${sym}` });
        }
        return {
          ...analysis,
          suggestedSwaps,
          requires_confirmation: true,
          status: "prepared_for_review",
          note: "Quotes are illustrative (1 cUSD each). To get a signable swap, say e.g. \"swap 10 cUSD to <TOKEN>\".",
        };
      }

      case "transaction_explain":
        return { result: await explainTransaction(req.message, marketNetwork()), source: "Blockscout" };

      case "gas_price": {
        const gp = await getCeloGasPrice();
        return gp ? { result: gp, source: "Celo RPC" } : { note: "Could not fetch current gas price from the Celo RPC." };
      }

      case "defi_protocols": {
        const r = await getCeloDefiProtocols();
        return { items: r.data, source: r.source };
      }

      case "network_stats": {
        const r = await getCeloNetworkStats();
        return { result: r.data, source: r.source };
      }

      case "price_history": {
        const msg = req.message.toLowerCase();
        const days = /(\d+)\s*day/i.test(msg)
          ? parseInt(msg.match(/(\d+)\s*day/i)?.[1] ?? "7", 10)
          : /month/i.test(msg) ? 30 : /year/i.test(msg) ? 365 : /week/i.test(msg) ? 7 : 7;
        const token = resolveMentionedToken(req.message, net);
        if (!token?.coingeckoId) {
          return {
            note: token
              ? `${token.symbol} does not have historical price data configured yet.`
              : "Which token's price history do you want?",
          };
        }
        const r = await getCeloPriceHistory(token.coingeckoId, days);
        return { items: r.data, source: r.source, period: `${days} days`, token: token.symbol };
      }

      case "top_pools": {
        const r = await getCeloTopPools();
        return { items: r.data, source: r.source };
      }

      case "token_search": {
        const query = req.message
          .replace(/\b(search|find|look up|show|token|tokens|on celo|celo|for|me|the|a|an|of|list|all|any|some|coin|coins|called|named)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!query) return { note: "Tell me what token name or symbol to search for." };
        const r = await searchCeloTokens(query);
        return { items: r.data, source: r.source, query };
      }

      case "token_holders": {
        const address = extractAddress(req.message);
        if (!address) return { note: "Provide a token contract address (0x…) to see its top holders." };
        const [info, holders] = await Promise.allSettled([
          getCeloTokenInfo(address, marketNetwork()),
          getCeloTokenHolders(address),
        ]);
        return {
          tokenInfo: info.status === "fulfilled" ? info.value?.data : null,
          items: holders.status === "fulfilled" ? holders.value.data : [],
          source: "Blockscout",
        };
      }

      case "wallet_stats": {
        const address = extractAddress(req.message, wa);
        if (!address) return { note: "Provide or connect a wallet address to see its stats." };
        const r = await getCeloWalletStats(address);
        return { result: r.data, source: r.source };
      }

      case "nft_balances": {
        const address = extractAddress(req.message, wa);
        if (!address) return { note: "Connect your wallet or provide an address to see its NFTs." };
        const r = await getCeloNFTBalances(address);
        return { items: r.data, source: r.source };
      }

      case "yield_info": {
        const r = await getCeloYieldOpportunities();
        return { items: r.data, source: r.source };
      }

      case "swap_execute": {
        const parsed = parseSwapRequest(req.message);
        if (!parsed) return { note: "Tell me the amount and tokens, e.g. \"swap 3 USDT to CELO\"." };
        if (!wa) return { note: "Connect your wallet first — I prepare the swap, your wallet signs it." };
        const prepared = await prepareSwap(parsed.fromToken, parsed.toToken, parsed.amount, wa);
        if ("error" in prepared) return { note: prepared.error };
        return { ...prepared, requires_confirmation: true };
      }

      case "send": {
        const parsed = parseSendRequest(req.message);
        if (!parsed) return { note: "Tell me the amount, token, and recipient, e.g. \"send 5 cUSD to 0x…\"." };
        const prepared = await prepareTransfer(parsed.to, parsed.amount, parsed.token, marketNetwork());
        if ("error" in prepared) return { note: prepared.error };
        return { ...prepared, requires_confirmation: true };
      }

      case "aave_supply": {
        const m = req.message.match(/supply\s+([\d.]+)\s+([a-zA-Z$]+)/i);
        if (!m) return { note: "Tell me the amount and asset, e.g. \"supply 10 cUSD to Aave\"." };
        if (!wa) return { note: "Connect your wallet first — I prepare the supply, your wallet signs it." };
        const prepared = await prepareAaveSupply(m[2], m[1], wa, marketNetwork());
        if ("error" in prepared) return { note: prepared.error };
        return { ...prepared, requires_confirmation: true };
      }

      case "unsupported":
        return null;

      default:
        return null;
    }
  } catch (e) {
    return { error: String(e), note: "Could not fetch live data for this request." };
  }
}

// ─── Route ─────────────────────────────────────────────────────────────────────
export async function chatRoutes(app: FastifyInstance) {
  app.post("/api/chat", async (req, reply) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(makeErr("chat", NETWORK, "VALIDATION_ERROR", parsed.error.message));
    }

    const chatReq = parsed.data;
    const resolved = resolveIntent(chatReq.message, chatReq.chatbotType);
    const intent = resolved.intent;

    // Log user message (fire-and-forget — non-fatal)
    void logChatMessage({
      conversationId: chatReq.conversationId,
      chatbotType: chatReq.chatbotType,
      role: "user",
      content: chatReq.message,
      intent,
      walletAddress: chatReq.walletAddress,
    });

    if (resolved.clarification) {
      const reply = resolved.clarification;
      void recordChatRequest({
        chatbotType: chatReq.chatbotType,
        intent,
        provider: "fallback",
        model: "clarification-rule",
        fallback: true,
        latencyMs: 0,
        walletAddress: chatReq.walletAddress,
        conversationId: chatReq.conversationId,
      });
      void logChatMessage({
        conversationId: chatReq.conversationId,
        chatbotType: chatReq.chatbotType,
        role: "assistant",
        content: reply,
        intent,
        walletAddress: chatReq.walletAddress,
      });

      return makeOk("chat", NETWORK, {
        reply,
        intent,
        aiProvider: "fallback",
        intentData: { clarification: reply },
        conversationId: chatReq.conversationId,
      }, { type: "result_card" });
    }

    const [conversationMemory, conversationSummary, intentData] = await Promise.all([
      buildChatMemory(chatReq),
      getChatConversationSummary(chatReq),
      fetchIntentData(intent, {
        message: chatReq.message,
        walletAddress: chatReq.walletAddress,
        selectedTool: chatReq.selectedTool,
      }),
    ]);

    // Build AI messages
    const systemPrompt = getSystemPrompt(chatReq.chatbotType, NETWORK);
    const summaryBlock = conversationSummary
      ? `\n\nLong-term conversation summary:\n${conversationSummary}\n\nUse this summary as durable context for the thread.`
      : "";
    const contextBlock = intentData
      ? `\n\nLive Celo data for this request:\n${JSON.stringify(intentData, null, 2)}\n\nUse this data to answer the user's question accurately.`
      : "";
    const pageContext = chatReq.pageContext ? `\nUser is on page: ${chatReq.pageContext}` : "";
    let aiResponse: string;
    let aiProvider: string;
    let aiModel = "fallback";
    let fallback = false;
    const aiStartedAt = Date.now();

    try {
      const route = routeForIntent(intent);
      const result = await aiComplete({
        messages: [
          { role: "system", content: systemPrompt + summaryBlock + contextBlock + pageContext },
          ...conversationMemory,
          { role: "user", content: chatReq.message },
        ],
        maxTokens: 1024,
        temperature: 0.7,
        provider: route.provider,
        model: route.model,
      });
      aiResponse = result.text;
      aiProvider = result.provider;
      aiModel = result.model;
    } catch (e: unknown) {
      aiResponse = formatFallbackAnswer(intent, intentData);
      aiProvider = "fallback";
      fallback = true;
    }

    void recordChatRequest({
      chatbotType: chatReq.chatbotType,
      intent,
      provider: aiProvider as MetricsProvider,
      model: aiModel,
      fallback,
      latencyMs: Date.now() - aiStartedAt,
      walletAddress: chatReq.walletAddress,
      conversationId: chatReq.conversationId,
    });

    // Log assistant response (fire-and-forget)
    void logChatMessage({
      conversationId: chatReq.conversationId,
      chatbotType: chatReq.chatbotType,
      role: "assistant",
      content: aiResponse,
      intent,
      walletAddress: chatReq.walletAddress,
    });

    void refreshConversationSummary(chatReq, conversationSummary, conversationMemory, chatReq.message, aiResponse);

    // Determine UI hint
    const uiHintMap: Record<string, NonNullable<ReturnType<typeof makeOk>>["uiHints"]> = {
      docs_explain: { type: "docs_answer" },
      mcp_setup: { type: "docs_answer" },
      claude_setup: { type: "docs_answer" },
      balance: { type: "result_card" },
      token_balance: { type: "portfolio_card" },
      token_info: { type: "token_card" },
      token_price: { type: "token_card" },
      market_trending: { type: "token_card" },
      recent_launches: { type: "token_card" },
      wallet_portfolio: { type: "portfolio_card" },
      contract_risk: { type: "risk_card" },
      token_risk: { type: "risk_card" },
      malicious_tx_check: { type: "risk_card" },
      transaction_explain: { type: "risk_card" },
      send: { type: "confirmation_required" },
      swap_execute: { type: "confirmation_required" },
      swap_quote: { type: "result_card" },
      aave_position: { type: "result_card" },
      aave_supply: { type: "confirmation_required" },
      self_verify: { type: "docs_answer" },
      agent_id_check: { type: "result_card" },
      x402_pay: { type: "confirmation_required" },
      recent_transactions: { type: "transaction_card" },
      whale_watch: { type: "result_card" },
      whale_activity: { type: "result_card" },
      gas_price: { type: "result_card" },
      defi_protocols: { type: "result_card" },
      network_stats: { type: "result_card" },
      price_history: { type: "token_card" },
      top_pools: { type: "result_card" },
      token_search: { type: "token_card" },
      token_holders: { type: "result_card" },
      wallet_stats: { type: "result_card" },
      nft_balances: { type: "result_card" },
      yield_info: { type: "result_card" },
      copy_wallet_analyze: { type: "result_card" },
      copy_wallet_prepare: { type: "confirmation_required" },
    };

    return makeOk("chat", NETWORK, {
      reply: aiResponse,
      intent,
      aiProvider,
      intentData,
      conversationId: chatReq.conversationId,
    }, uiHintMap[intent] ?? { type: "result_card" });
  });

  app.get("/api/chat/history", async (req, reply) => {
    const query = req.query as {
      walletAddress?: string;
      conversationId?: string;
      chatbotType?: string;
      limit?: string;
    };

    const limit = Number.parseInt(query.limit ?? "200", 10);
    const walletAddress = query.walletAddress?.trim();
    const conversationId = query.conversationId?.trim();
    const chatbotType = query.chatbotType?.trim();

    if (!walletAddress && !conversationId) {
      return reply.code(400).send(makeErr("chat_history", NETWORK, "MISSING_PARAM", "Provide walletAddress or conversationId"));
    }

    const messages = await getChatMessages({
      walletAddress,
      conversationId,
      chatbotType,
      limit: Number.isFinite(limit) ? limit : 200,
    });

    return makeOk("chat_history", NETWORK, {
      scope: walletAddress ? "wallet" : "conversation",
      walletAddress: walletAddress ?? null,
      conversationId: conversationId ?? null,
      count: messages.length,
      messages: messages.reverse(),
    }, { type: "result_card" });
  });

  app.post("/api/docs/ask", async (req, reply) => {
    const body = req.body as { question?: string };
    if (!body?.question) {
      return reply.code(400).send(makeErr("docs_ask", NETWORK, "MISSING_PARAM", "question is required"));
    }
    const context = await buildDocsContextAsync(body.question);
    let answer: string;
    try {
      const route = routeForIntent("docs_explain");
      const result = await aiComplete({
        messages: [
          {
            role: "system",
            content: `You are CeloMind's documentation assistant. Answer questions about Celo using the provided documentation context. Be accurate and cite specific details.\n\nDocumentation context:\n${context}`,
          },
          { role: "user", content: body.question },
        ],
        maxTokens: 1024,
        provider: route.provider,
        model: route.model,
      });
      answer = result.text;
    } catch {
      answer = formatFallbackAnswer("docs_explain", { context });
    }
    return makeOk("docs_ask", NETWORK, { question: body.question, answer, context }, { type: "docs_answer" });
  });
}
