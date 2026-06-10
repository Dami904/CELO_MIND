import type { Intent, ChatRequest } from "@celomind/shared";
import { getTokenList } from "@celomind/shared";

type IntentPattern = { intent: Intent; patterns: RegExp[] };

export type IntentResolution = {
  intent: Intent;
  clarification?: string;
};

const KNOWN_TOKEN_SYMBOLS = Object.keys(getTokenList()).sort((a, b) => b.length - a.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyTextNormalizations(message: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bwhat['’]?s\b/gi, "what is"],
    [/\bwho['’]?s\b/gi, "who is"],
    [/\bwhere['’]?s\b/gi, "where is"],
    [/\bwhen['’]?s\b/gi, "when is"],
    [/\bhow['’]?s\b/gi, "how is"],
    [/\bthat['’]?s\b/gi, "that is"],
    [/\bthere['’]?s\b/gi, "there is"],
    [/\bit['’]?s\b/gi, "it is"],
    [/\bi['’]?m\b/gi, "i am"],
    [/\bi['’]?ve\b/gi, "i have"],
    [/\bi['’]?ll\b/gi, "i will"],
    [/\byou['’]?re\b/gi, "you are"],
    [/\bwe['’]?re\b/gi, "we are"],
    [/\bthey['’]?re\b/gi, "they are"],
    [/\bcan['’]?t\b/gi, "cannot"],
    [/\bwon['’]?t\b/gi, "will not"],
    [/\bdon['’]?t\b/gi, "do not"],
    [/\bdoesn['’]?t\b/gi, "does not"],
    [/\bdidn['’]?t\b/gi, "did not"],
    [/\bisn['’]?t\b/gi, "is not"],
    [/\baren['’]?t\b/gi, "are not"],
    [/\bwasn['’]?t\b/gi, "was not"],
    [/\bweren['’]?t\b/gi, "were not"],
    [/\bshouldn['’]?t\b/gi, "should not"],
    [/\bcouldn['’]?t\b/gi, "could not"],
    [/\bwouldn['’]?t\b/gi, "would not"],
    [/\bmustn['’]?t\b/gi, "must not"],
    [/\bw\/\b/gi, "with"],
    [/\bw\/o\b/gi, "without"],
    [/\bnd\b/gi, "and"],
    [/\bu\b/gi, "you"],
    [/\bur\b/gi, "your"],
    [/\bpls\b/gi, "please"],
    [/\bplz\b/gi, "please"],
  ];

  let cleaned = message.replace(/[’]/g, "'");
  for (const [pattern, replacement] of replacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

function normalizeMessage(message: string): string {
  return applyTextNormalizations(message).replace(/\s+/g, " ").trim();
}

function extractKnownTokenSymbol(message: string): string | null {
  for (const symbol of KNOWN_TOKEN_SYMBOLS) {
    if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "i").test(message)) return symbol;
  }
  return null;
}

function hasTokenReference(message: string): boolean {
  return Boolean(extractKnownTokenSymbol(message) || message.match(/0x[0-9a-fA-F]{40}/));
}

function hasTxHash(message: string): boolean {
  return /0x[0-9a-fA-F]{64}/.test(message);
}

function hasContractAddress(message: string): boolean {
  return /0x[0-9a-fA-F]{40}/.test(message);
}

function isAaveSupplyQuery(message: string): boolean {
  return /\b(aave|deposit to aave|supply to aave|lend to aave|aave supply)\b/i.test(message) && /\b(supply|deposit|lend)\b/i.test(message);
}

function isAavePositionQuery(message: string): boolean {
  return /\baave\b/i.test(message) && /\b(position|borrow|borrowings?|debt|collateral|health factor|loan|supplied)\b/i.test(message);
}

function needsBestPoolClarification(message: string): boolean {
  return /\b(best pool|which pool|top pool)\b/i.test(message) && !/\b(tvl|volume|fee|apy|liquidity)\b/i.test(message);
}

function needsGasHistoryClarification(message: string): boolean {
  return /\b(gas price history|gas history|historical gas|gas chart|gas over time|gas.*last\s+\d|gas.*week|gas.*month|gas.*year)\b/i.test(message);
}

function needsPriceHistoryClarification(message: string, tokenSymbol: string | null): boolean {
  return /\b(price history|price.*histor|historical price|price.*chart|price over time|price.*week|price.*month|price.*year|price.*last\s+\d)\b/i.test(message) && !tokenSymbol;
}

function needsTxClarification(message: string): boolean {
  return /\b(explain|decode|what is this|check this)\b.*\btx\b/i.test(message) && !hasTxHash(message);
}

function needsContractClarification(message: string): boolean {
  return /\b(check|audit|review|safe)\b.*\bcontract\b/i.test(message) && !hasContractAddress(message);
}

function needsTokenClarification(message: string): boolean {
  return /\b(token info|tokenomics|token price|token balance|holder list|top holder|holder(s)? of|search.*token|find.*token|look.*up.*token)\b/i.test(message) && !hasTokenReference(message);
}

function needsWhaleTradeClarification(message: string): boolean {
  return /\b(whale trade(s)?|detect whale|whale trade detection|whale trades? in|whale moves in|market-wide whale)\b/i.test(message) && !hasContractAddress(message);
}

function needsWhaleActivityClarification(message: string): boolean {
  return /\b(whale activity|whale moves|whale transactions?|watch wallet|track wallet|whale wallet|wallet activity)\b/i.test(message) && !hasContractAddress(message);
}

function looksLikeWalletPortfolio(message: string): boolean {
  return /\b(wallet holdings?|holdings? in my wallet|what tokens are in my wallet|show my wallet holdings|list my wallet holdings|what is in my wallet)\b/i.test(message);
}

function looksLikeTokenBalance(message: string, tokenSymbolLower: string | null): boolean {
  return Boolean(tokenSymbolLower && tokenSymbolLower !== "celo") && /\b(how much|how many)\b/i.test(message) && /\b(do i have|do i own|do i hold|in my wallet|balance)\b/i.test(message);
}

// Broad "state of the network right now" questions → aggregate live data (network_pulse),
// not the static docs answer. Skips anything clearly about a specific wallet/token/tx.
function looksLikeNetworkPulse(message: string): boolean {
  if (/0x[0-9a-fA-F]{40}/.test(message)) return false;
  if (/\bmy\b|\bwallet\b|\bbalance\b|\bportfolio\b|\bswap\b|\bsend\b|\bsign\b/i.test(message)) return false;
  return /\b(what'?s|what is|whats)\s+(happening|going on|up|new)\b/i.test(message)
    || /\b(celo\s+)?(overview|summary|snapshot|rundown|pulse)\b/i.test(message)
    || /\bstate of (celo|the network|the chain)\b/i.test(message)
    || /\banything\s+(new|happening|going on)\b/i.test(message)
    || /\bhow'?s\s+(celo|the network|the chain)\b/i.test(message)
    || /\bhow\s+is\s+(celo|the network|the chain)\s+(doing|going|looking|today|now)\b/i.test(message)
    || /\bis\s+celo\s+(busy|active|doing|healthy)\b/i.test(message);
}

const INTENT_PATTERNS: IntentPattern[] = [
  { intent: "token_balance", patterns: [/\btoken balance\b/i, /\bcusd balance\b/i, /\bceur balance\b/i, /\bbalance of\b/i] },
  { intent: "balance", patterns: [/\bbalance\b/i, /\bhow much celo\b/i, /\bmy celo\b/i] },
  { intent: "send", patterns: [/\bsend\b.*\bcelo\b/i, /\btransfer\b/i, /\bpay\b.*\bwallet\b/i] },
  { intent: "swap_quote", patterns: [/\bswap quote\b/i, /\bexchange rate\b/i, /\bhow much.*swap\b/i, /\bhow much would i get\b/i, /\bwhat would i get\b/i, /\bquote\b/i] },
  { intent: "swap_execute", patterns: [/\bswap\s+[\d.]+/i, /\bexchange\s+[\d.]+/i, /\btrade\s+[\d.]+/i] },
  { intent: "aave_supply", patterns: [/\bsupply to aave\b/i, /\baave supply\b/i, /\blend\b.*\baave\b/i, /\bdeposit\b.*\baave\b/i] },
  { intent: "aave_position", patterns: [/\baave position\b/i, /\blending position\b/i, /\bborrowings?\b/i, /\bsupplied\b/i, /\bhealth factor\b/i, /\bcollateral\b/i, /\bdebt\b/i] },
  { intent: "self_verify", patterns: [/\bself\b.*\bverif/i, /\bverif.*\bidentity/i, /\bidentity verif/i, /\bpassport\b/i, /\bkyc\b/i, /with self\b/i] },
  { intent: "agent_id_check", patterns: [/\bagent id\b/i, /\bself id\b/i, /\bidentity check\b/i] },
  { intent: "x402_pay", patterns: [/\bhttp 402\b/i, /\bapi payment\b/i, /\bpay for api\b/i, /\bpayment request\b/i, /\brequest payment\b/i, /\bpay\b.*\bx402\b/i, /\bx402\b.*\b(pay|payment|request|invoice|charge)\b/i] },
  { intent: "gas_price", patterns: [/\bgas price\b/i, /\bgas fee\b/i, /\bnetwork fee\b/i, /\bhow much.*gas\b/i, /\bcurrent gas\b/i, /\bgas cost\b/i, /\btransaction fee\b/i] },
  { intent: "price_history", patterns: [/\bprice.*histor\b/i, /\bhistorical.*price\b/i, /\bprice.*last\s+\d/i, /\bprice.*chart\b/i, /\bprice.*week\b/i, /\bprice.*month\b/i, /\bprice.*7 day\b/i, /\bprice.*30 day\b/i, /\bprice over time\b/i] },
  { intent: "top_pools", patterns: [/\bliquidity pool\b/i, /\bdex pool\b/i, /\btop pool\b/i, /\bpool.*liquidity\b/i, /\bpool.*volume\b/i, /\bpool.*list\b/i, /\bbest pool\b/i, /\bhighest.*tvl.*pool\b/i] },
  {
    intent: "market_trending",
    patterns: [
      /\btrending\b/i, /\btop tokens?\b/i, /\bhot coins?\b/i, /\bpopular\b/i,
      // market-cap queries
      /\bmarket cap\b/i, /\bby market cap\b/i, /\bhighest market\b/i, /\blargest.*market\b/i,
      // token-holder ranking queries
      /\bmost holders?\b/i, /\bhighest.*holders?\b/i, /\bby holder count\b/i,
      /\btoken.*holder.*rank\b/i, /\bholder.*count\b/i,
      // general "top N tokens" phrasing not caught by more specific intents
      /\btop\s+\d+\s+tokens?\b/i, /\blargest tokens?\b/i, /\bbiggest tokens?\b/i,
    ],
  },
  { intent: "token_search", patterns: [/\bsearch.*token\b/i, /\bfind.*token\b/i, /\blook.*up.*token\b/i, /\btoken search\b/i, /\bsearch for\b.*\b[a-z]{2,}\b/i, /\bfind me.*coin\b/i] },
  { intent: "token_info", patterns: [/\btoken info\b/i, /\bwhat is\b.*\btoken\b/i, /\btokenomics\b/i] },
  { intent: "token_price", patterns: [/\bprice of\b/i, /\btoken price\b/i, /\bcelo price\b/i, /\bcusd price\b/i] },
  { intent: "wallet_portfolio", patterns: [/\bportfolio\b/i, /\bmy tokens\b/i, /\bwallet tokens?\b/i, /\bholdings\b/i, /\bwhat do i hold\b/i, /\bwhat tokens do i have\b/i] },
  { intent: "recent_transactions", patterns: [/\brecent tx\b/i, /\btransaction history\b/i, /\blast.*transaction\b/i, /\bmy txs\b/i] },
  { intent: "recent_launches", patterns: [/\bnew token\b/i, /\brecently launched\b/i, /\brecent launches\b/i, /\bnew tokens?\b/i, /\bnew project\b/i, /\bnew coin\b/i] },
  { intent: "malicious_tx_check", patterns: [/\bmalicious\b/i, /\bscam tx\b/i, /\bdangerous transaction\b/i, /\bcheck this tx\b/i] },
  { intent: "contract_risk", patterns: [/\bcontract risk\b/i, /\bcheck contract\b/i, /\bsafe contract\b/i, /\baudit\b/i] },
  { intent: "token_risk", patterns: [/\btoken risk\b/i, /\brug pull\b/i, /\bhoneypot\b/i, /\bsafe token\b/i] },
  { intent: "token_holders", patterns: [/\bholder(s)? of\b/i, /\bwho holds\b/i, /\bwho owns the most\b/i, /\btoken holder list\b/i, /\bholder list\b/i, /\bshow.*holder/i, /\btop holder.*of\b/i] },
  { intent: "nft_balances", patterns: [/\bnft\b/i, /\bcollectibl/i, /\bnon.fungible\b/i, /\berc.721\b/i, /\berc.1155\b/i, /\bmy.*nft\b/i, /\bnft.*balance\b/i, /\bnft.*wallet\b/i, /\bnft.*hold/i] },
  { intent: "wallet_stats", patterns: [/\bwallet (age|stats|statistics|info|summary)\b/i, /\bhow old is.*wallet\b/i, /\bwallet.*old\b/i, /\btx count\b/i, /\btransaction count\b/i, /\baccount age\b/i, /\bwallet.*active\b/i] },
  { intent: "whale_activity", patterns: [/\bwhale activity\b/i, /\bwhale moves\b/i, /\bwhale transactions\b/i, /\bwatch wallet\b/i, /\btrack wallet\b/i, /\bwhale wallet\b/i, /\bwallet activity\b/i] },
  { intent: "whale_watch", patterns: [/\bwhales?\b/i, /\blarge holders?\b/i, /\btop holders?\b/i, /\bbiggest holders?\b/i, /\btop whales?\b/i, /\bwhale leaderboard\b/i, /\bwhale list\b/i] },
  { intent: "copy_wallet_analyze", patterns: [/\bcopy wallet\b/i, /\bmimic wallet\b/i, /\bfollow wallet\b/i, /\bcopy trader\b/i] },
  { intent: "copy_wallet_prepare", patterns: [/\bprepare copy\b/i, /\bcopy trade\b/i, /\bcopy.*portfolio\b/i] },
  { intent: "transaction_explain", patterns: [/\bexplain.*tx\b/i, /\bwhat is this transaction\b/i, /\bdecode tx\b/i] },
  { intent: "mcp_setup", patterns: [/\bsetup.*server\b/i, /\binstall.*mcp\b/i, /\bconfigure.*mcp\b/i, /\bclaude desktop\b/i] },
  { intent: "claude_setup", patterns: [/\bclaude setup\b/i, /\bclaude desktop\b/i, /\binstall.*claude\b/i, /\bconfigure.*claude\b/i] },
  { intent: "network_stats", patterns: [/\bnetwork stats\b/i, /\bnetwork statistics\b/i, /\bdaily.*transactions?\b/i, /\btransactions? per day\b/i, /\btotal.*transactions?\b/i, /\btps on\b/i, /\bhow.*active.*celo\b/i, /\bcelo.*stats\b/i, /\btotal.*address.*celo\b/i, /\bblock count\b/i] },
  { intent: "defi_protocols", patterns: [/\bprotocol.*tvl\b/i, /\btvl.*protocol\b/i, /\btop.*protocol\b/i, /\bbiggest.*protocol\b/i, /\bdefi.*protocol\b/i, /\bprotocol.*on.*celo\b/i, /\bcelo.*protocol\b/i, /\btvl.*breakdown\b/i] },
  { intent: "yield_info", patterns: [/\byield farm/i, /\bbest.*apy\b/i, /\bbest.*apr\b/i, /\bearn.*on celo\b/i, /\bfarm.*reward/i, /\bstaking.*apy\b/i, /\bstaking.*apr\b/i, /\byield.*opportunit/i, /\bbest.*return\b/i, /\bhighest.*apy\b/i, /\bhighest.*apr\b/i] },
  // Celo educational catch-all — runs LAST so specific data/action intents win first.
  // Any Celo/blockchain concept question lands here and gets answered from live docs context.
  {
    intent: "docs_explain",
    patterns: [
      /\bwhat is celo\b/i, /\babout celo\b/i, /\bdocumentation\b/i, /\bdocs\b/i, /\bexplain\b/i, /\bhow does\b/i, /\blearn\b/i, /\btell me about\b/i,
      /\bmento\b/i, /\bstablecoins?\b/i, /\bc(usd|eur|real)\b/i, /\bcelo\b/i, /\bdefi\b/i, /\bweb3\b/i, /\bblockchain\b/i,
      /\bubeswap\b/i, /\buniswap\b/i, /\bvalidator\b/i, /\bgovernance\b/i, /\bstaking\b/i, /\bgas fees?\b/i,
      /\bmcp\b/i, /\bmodel context protocol\b/i, /\bx402\b/i, /\baave\b/i, /\bclaude\b/i,
    ],
  },
];

export function resolveIntent(message: string, chatbotType: ChatRequest["chatbotType"]): IntentResolution {
  const cleaned = normalizeMessage(message);
  const tokenSymbol = extractKnownTokenSymbol(cleaned);
  const tokenSymbolLower = tokenSymbol?.toLowerCase() ?? null;

  // A pasted tx hash or contract address on its own (no other words) is never "predefined" —
  // route it straight to a live on-chain lookup instead of falling through to "unsupported".
  const bareHash = cleaned.match(/0x[0-9a-fA-F]{64}/)?.[0];
  if (bareHash && cleaned.replace(bareHash, "").replace(/[^a-z0-9]/gi, "") === "") {
    return { intent: "transaction_explain" };
  }
  const bareAddr = cleaned.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/)?.[0];
  if (bareAddr && cleaned.replace(bareAddr, "").replace(/[^a-z0-9]/gi, "") === "") {
    return { intent: "token_info" };
  }

  // Broad "what's happening / state of Celo" → live aggregated snapshot, before the docs catch-all.
  if (looksLikeNetworkPulse(cleaned)) return { intent: "network_pulse" };

  if (needsBestPoolClarification(cleaned)) {
    return { intent: "unsupported", clarification: "Do you mean the highest TVL pool, the highest volume pool, or the best fee tier?" };
  }

  if (needsGasHistoryClarification(cleaned)) {
    return { intent: "unsupported", clarification: "I can show the current Celo gas price, but I do not have historical gas charts yet." };
  }

  if (needsPriceHistoryClarification(cleaned, tokenSymbol)) {
    return { intent: "unsupported", clarification: "Which token's price history do you want on Celo?" };
  }

  if (needsTxClarification(cleaned)) {
    return { intent: "unsupported", clarification: "Send me the transaction hash so I can explain or inspect that transaction." };
  }

  if (needsContractClarification(cleaned)) {
    return { intent: "unsupported", clarification: "Send the contract address (0x...) and I’ll check it for risk." };
  }

  if (needsTokenClarification(cleaned)) {
    return { intent: "unsupported", clarification: "Send the token symbol or contract address so I can fetch the right token." };
  }

  if (needsWhaleTradeClarification(cleaned)) {
    return { intent: "unsupported", clarification: "I can show Whale Wallet Activity or the Whale Leaderboard, but I do not yet do market-wide whale trade detection." };
  }

  if (needsWhaleActivityClarification(cleaned)) {
    return { intent: "unsupported", clarification: "Send the whale wallet address you want me to inspect, or ask for the Whale Leaderboard instead." };
  }

  if (looksLikeWalletPortfolio(cleaned)) return { intent: "wallet_portfolio" };
  if (looksLikeTokenBalance(cleaned, tokenSymbolLower)) return { intent: "token_balance" };

  if (isAaveSupplyQuery(cleaned)) return { intent: "aave_supply" };
  if (isAavePositionQuery(cleaned)) return { intent: "aave_position" };

  const x402Words = /\bx402\b/i.test(cleaned);
  if (x402Words) {
    if (/\b(pay|payment|request|invoice|charge|checkout|buy|purchase)\b/i.test(cleaned)) return { intent: "x402_pay" };
    return { intent: "docs_explain" };
  }

  if (/\bmcp\b/i.test(cleaned) || /\bmodel context protocol\b/i.test(cleaned)) {
    if (/\b(setup|install|configure|desktop|server)\b/i.test(cleaned)) return { intent: "mcp_setup" };
    return { intent: "docs_explain" };
  }

  if (/\bclaude\b/i.test(cleaned)) {
    if (/\b(setup|install|configure|desktop|server)\b/i.test(cleaned)) return { intent: "claude_setup" };
    return { intent: "docs_explain" };
  }

  if (/\bgas\b/i.test(cleaned) && /\b(price|fee|cost)\b/i.test(cleaned)) {
    return { intent: "gas_price" };
  }

  if (/\bprice\b/i.test(cleaned) && /\b(chart|histor|over time|week|month|year|last)\b/i.test(cleaned)) {
    return tokenSymbol ? { intent: "price_history" } : { intent: "unsupported", clarification: "Which token's price chart or history do you want?" };
  }

  if (/\bprice\b/i.test(cleaned) && tokenSymbol) return { intent: "token_price" };
  if (/\bprice\b/i.test(cleaned) && /\b(celo|cusd|ceur|creal|usdc|usdt|wbtc)\b/i.test(cleaned)) return { intent: "token_price" };

  if (/\b(balance of|token balance|my tokens|wallet tokens?|holdings|what do i hold|what tokens do i have)\b/i.test(cleaned)) {
    return { intent: /\b(my tokens|wallet tokens?|holdings|what do i hold|what tokens do i have)\b/i.test(cleaned) ? "wallet_portfolio" : "token_balance" };
  }

  if (/\bbalance\b/i.test(cleaned)) {
    if (tokenSymbolLower && tokenSymbolLower !== "celo") return { intent: "token_balance" };
    if (/\bcelo\b/i.test(cleaned) || /\bhow much celo\b/i.test(cleaned) || /\bmy celo\b/i.test(cleaned)) return { intent: "balance" };
    if (tokenSymbol) return { intent: "token_balance" };
    return { intent: "balance" };
  }
  if (/\bportfolio\b/i.test(cleaned)) return { intent: "wallet_portfolio" };

  if (tokenSymbol && tokenSymbolLower !== "celo" && /\b(what is|tell me about|token info|tokenomics|info on|details of)\b/i.test(cleaned)) {
    return { intent: "token_info" };
  }

  if (/\btoken( info|omics)?\b/i.test(cleaned) || /\bwhat is\b.*\b(token|coin|asset)\b/i.test(cleaned)) {
    if (tokenSymbol || hasTokenReference(cleaned)) return { intent: "token_info" };
  }

  if (/\bsearch\b.*\btoken\b/i.test(cleaned) || /\bfind\b.*\btoken\b/i.test(cleaned) || /\blook\b.*\btoken\b/i.test(cleaned) || /\btoken search\b/i.test(cleaned) || /\bfind me\b.*\bcoin\b/i.test(cleaned)) {
    return { intent: "token_search" };
  }

  // Landing chatbot is read-only — never execute write intents.
  const writeIntents: Intent[] = ["send", "swap_execute", "aave_supply", "x402_pay", "copy_wallet_prepare"];

  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(cleaned))) {
      if (chatbotType === "landing" && writeIntents.includes(intent)) {
        return { intent: "unsupported" };
      }
      return { intent };
    }
  }

  return { intent: "unsupported" };
}

export function detectIntent(message: string, chatbotType: ChatRequest["chatbotType"]): Intent {
  return resolveIntent(message, chatbotType).intent;
}
