import type { FastifyInstance } from "fastify";
import { makeOk, makeErr, ChatRequestSchema, type Intent } from "@celomind/shared";
import { buildDocsContextAsync, buildDocsContext } from "@celomind/docs-knowledge";
import { detectIntent } from "../ai/intent-router.js";
import { aiComplete } from "../ai/providers.js";
import { logChatMessage } from "../db/sqlite.js";
import { findToken, getTokenList, marketNetwork } from "@celomind/shared";
import { getNativeBalance, getTokenBalance } from "@celomind/mcp-server/celo-client";
import {
  getCeloTokenPrice,
  getTrendingCeloTokens,
  getRecentlyLaunchedCeloTokens,
  getCeloTokenInfo,
  getCeloWalletPortfolio,
  getCeloRecentTransactions,
} from "@celomind/mcp-server/market";
import { checkContractRisk, checkTokenRisk, checkMaliciousTransaction } from "@celomind/mcp-server/risk";
import { getWhaleWalletActivity, analyzeCopyWallet } from "@celomind/mcp-server/whale";
import { getSwapQuote, prepareSwap, parseSwapRequest } from "@celomind/mcp-server/swap";

import { resolveNetwork } from "@celomind/shared";
const NETWORK = resolveNetwork(process.env.CELO_NETWORK);
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;
const HASH_RE = /0x[0-9a-fA-F]{64}/;

function extractAddress(message: string, fallback?: string): string | undefined {
  return message.match(ADDRESS_RE)?.[0] ?? fallback;
}

function extractTwoAddresses(message: string, fallback?: string): [string | undefined, string | undefined] {
  const matches = message.match(new RegExp(ADDRESS_RE.source, "g")) ?? [];
  return [matches[0] ?? fallback, matches[1] ?? fallback];
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

/** Unwrap a `{ items|result, source }` envelope (used by market/data intents) into payload + source. */
function unwrapEnvelope(data: unknown): { payload: unknown; source?: string } {
  if (data && typeof data === "object" && "source" in data && ("items" in data || "result" in data)) {
    const d = data as { items?: unknown; result?: unknown; source?: string };
    return { payload: d.items ?? d.result, source: d.source };
  }
  return { payload: data };
}

function formatFallbackAnswer(intent: Intent, data: unknown): string {
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
    case "token_price":
      return `Live token prices from ${source ?? "CoinGecko"}:\n${JSON.stringify(payload, null, 2)}`;
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
      const risk = data as { riskLevel?: string; riskScore?: number; explanation?: string; recommendation?: string; uncertainty?: string };
      return `Risk result: ${risk.riskLevel ?? "unknown"}${typeof risk.riskScore === "number" ? ` (${risk.riskScore}/100)` : ""}.\n${risk.explanation ?? ""}\nRecommendation: ${risk.recommendation ?? "Review carefully before signing."}${risk.uncertainty ? `\nUncertainty: ${risk.uncertainty}` : ""}`;
    }
    case "whale_watch":
    case "whale_activity": {
      const whale = data as { address?: string; nativeBalance?: string; txCount?: number; label?: string };
      return `Whale wallet activity from Blockscout/Celoscan:\nWallet: ${whale.address ?? "unknown"}${whale.label ? ` (${whale.label})` : ""}\nNative balance: ${whale.nativeBalance ?? "0"} CELO\nRecent transaction count fetched: ${whale.txCount ?? 0}`;
    }
    case "copy_wallet_analyze":
    case "copy_wallet_prepare": {
      const copy = data as { sourceWallet?: string; myWallet?: string; tokensToAdd?: string[]; tokensToRemove?: string[]; warning?: string };
      return `Copy-wallet analysis only, no trade executed.\nSource wallet: ${copy.sourceWallet ?? "unknown"}\nYour wallet: ${copy.myWallet ?? "unknown"}\nTokens to research/add: ${(copy.tokensToAdd ?? []).join(", ") || "none"}\nTokens to review/remove: ${(copy.tokensToRemove ?? []).join(", ") || "none"}\n${copy.warning ?? "Prepared actions require review and wallet confirmation."}`;
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
    case "aave_supply":
    case "x402_pay":
      return "This is a write/payment operation. I prepared the request, but nothing was executed. Please review and confirm in your wallet before proceeding.";
    default:
      return typeof data === "string" ? data : `Here is the clean result I found:\n${JSON.stringify(data, null, 2)}`;
  }
}

// ─── System prompts by chatbot type ──────────────────────────────────────────
function getSystemPrompt(chatbotType: string, network: string): string {
  const base = `You are CeloMind, an AI assistant specializing in the Celo blockchain ecosystem. You help users understand Celo, manage their wallets, explore DeFi, and stay safe. Always be clear, concise, and honest about uncertainty. Current network: ${network}.`;

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
        const celoPrice = await getCeloTokenPrice("celo");
        const cUSDPrice = await getCeloTokenPrice("celo-dollar");
        return { result: { CELO: celoPrice, cUSD: cUSDPrice }, source: "CoinGecko" };
      }

      case "market_trending": {
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

      case "aave_position":
        return getAaveInfo(wa);

      case "self_verify":
        return { ...getSelfInfo(extractAddress(req.message, wa)), context: await buildDocsContextAsync("Self Protocol Celo identity verification") };

      case "agent_id_check":
        return getSelfInfo(extractAddress(req.message, wa));

      case "x402_pay":
        return getX402Info(req.message);

      case "whale_watch":
      case "whale_activity": {
        const address = extractAddress(req.message, wa);
        if (!address) return { note: "Provide a wallet address to watch." };
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
        return await checkMaliciousTransaction(req.message, net);

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
        return { ...analysis, requires_confirmation: true, status: "prepared_for_review" };
      }

      case "transaction_explain": {
        const hash = req.message.match(HASH_RE)?.[0];
        const risk = await checkMaliciousTransaction(req.message, net);
        return { txHash: hash, ...risk, source: hash ? "Blockscout (tx lookup) + heuristic" : "heuristic message analysis" };
      }

      case "swap_execute": {
        const parsed = parseSwapRequest(req.message);
        if (!parsed) return { note: "Tell me the amount and tokens, e.g. \"swap 3 USDT to CELO\"." };
        if (!wa) return { note: "Connect your wallet first — I prepare the swap, your wallet signs it." };
        const prepared = await prepareSwap(parsed.fromToken, parsed.toToken, parsed.amount, wa);
        if ("error" in prepared) return { note: prepared.error };
        return { ...prepared, requires_confirmation: true };
      }

      case "send":
      case "aave_supply":
        return { requires_confirmation: true, message: "This is a write operation. Please confirm in your wallet before proceeding." };

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
    const intent = detectIntent(chatReq.message, chatReq.chatbotType);

    // Log user message (fire-and-forget — non-fatal)
    void logChatMessage({
      conversationId: chatReq.conversationId,
      chatbotType: chatReq.chatbotType,
      role: "user",
      content: chatReq.message,
      intent,
      walletAddress: chatReq.walletAddress,
    });

    // Fetch live data based on intent
    const intentData = await fetchIntentData(intent, {
      message: chatReq.message,
      walletAddress: chatReq.walletAddress,
      selectedTool: chatReq.selectedTool,
    });

    // Build AI messages
    const systemPrompt = getSystemPrompt(chatReq.chatbotType, NETWORK);
    const contextBlock = intentData
      ? `\n\nLive Celo data for this request:\n${JSON.stringify(intentData, null, 2)}\n\nUse this data to answer the user's question accurately.`
      : "";
    const pageContext = chatReq.pageContext ? `\nUser is on page: ${chatReq.pageContext}` : "";

    let aiResponse: string;
    let aiProvider: string;

    try {
      const result = await aiComplete({
        messages: [
          { role: "system", content: systemPrompt + contextBlock + pageContext },
          { role: "user", content: chatReq.message },
        ],
        maxTokens: 1024,
        temperature: 0.7,
      });
      aiResponse = result.text;
      aiProvider = result.provider;
    } catch (e: unknown) {
      aiResponse = formatFallbackAnswer(intent, intentData);
      aiProvider = "fallback";
    }

    // Log assistant response (fire-and-forget)
    void logChatMessage({
      conversationId: chatReq.conversationId,
      chatbotType: chatReq.chatbotType,
      role: "assistant",
      content: aiResponse,
      intent,
      walletAddress: chatReq.walletAddress,
    });

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

  app.post("/api/docs/ask", async (req, reply) => {
    const body = req.body as { question?: string };
    if (!body?.question) {
      return reply.code(400).send(makeErr("docs_ask", NETWORK, "MISSING_PARAM", "question is required"));
    }
    const context = await buildDocsContextAsync(body.question);
    let answer: string;
    try {
      const result = await aiComplete({
        messages: [
          {
            role: "system",
            content: `You are CeloMind's documentation assistant. Answer questions about Celo using the provided documentation context. Be accurate and cite specific details.\n\nDocumentation context:\n${context}`,
          },
          { role: "user", content: body.question },
        ],
        maxTokens: 1024,
      });
      answer = result.text;
    } catch {
      answer = formatFallbackAnswer("docs_explain", { context });
    }
    return makeOk("docs_ask", NETWORK, { question: body.question, answer, context }, { type: "docs_answer" });
  });
}
