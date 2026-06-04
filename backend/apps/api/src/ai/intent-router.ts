import type { Intent, ChatRequest } from "@celomind/shared";

type IntentPattern = { intent: Intent; patterns: RegExp[] };

const INTENT_PATTERNS: IntentPattern[] = [
  { intent: "balance", patterns: [/\bbalance\b/i, /\bhow much celo\b/i, /\bmy celo\b/i] },
  { intent: "token_balance", patterns: [/\btoken balance\b/i, /\bcusd balance\b/i, /\bceur balance\b/i, /\bbalance of\b/i] },
  { intent: "send", patterns: [/\bsend\b.*\bcelo\b/i, /\btransfer\b/i, /\bpay\b.*\bwallet\b/i] },
  { intent: "swap_quote", patterns: [/\bswap quote\b/i, /\bexchange rate\b/i, /\bhow much.*swap\b/i, /\bquote\b/i] },
  { intent: "swap_execute", patterns: [/\bswap\s+[\d.]+/i, /\bexchange\s+[\d.]+/i, /\btrade\s+[\d.]+/i] },
  { intent: "aave_position", patterns: [/\baave\b/i, /\blending position\b/i, /\bborrowings?\b/i, /\bsupplied\b/i] },
  { intent: "aave_supply", patterns: [/\bsupply to aave\b/i, /\baave supply\b/i, /\blend\b.*\baave\b/i] },
  { intent: "self_verify", patterns: [/\bself\b.*\bverif/i, /\bverif.*\bidentity/i, /\bidentity verif/i, /\bpassport\b/i, /\bkyc\b/i, /with self\b/i] },
  { intent: "agent_id_check", patterns: [/\bagent id\b/i, /\bself id\b/i, /\bidentity check\b/i] },
  { intent: "x402_pay", patterns: [/\bx402\b/i, /\bhttp 402\b/i, /\bapi payment\b/i, /\bpay for api\b/i] },
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
  { intent: "wallet_portfolio", patterns: [/\bportfolio\b/i, /\bmy tokens\b/i, /\bholdings\b/i, /\bwhat do i hold\b/i] },
  { intent: "recent_transactions", patterns: [/\brecent tx\b/i, /\btransaction history\b/i, /\blast.*transaction\b/i, /\bmy txs\b/i] },
  { intent: "recent_launches", patterns: [/\bnew token\b/i, /\brecently launched\b/i, /\bnew project\b/i, /\bnew coin\b/i] },
  { intent: "malicious_tx_check", patterns: [/\bmalicious\b/i, /\bscam tx\b/i, /\bdangerous transaction\b/i, /\bcheck this tx\b/i] },
  { intent: "contract_risk", patterns: [/\bcontract risk\b/i, /\bcheck contract\b/i, /\bsafe contract\b/i, /\baudit\b/i] },
  { intent: "token_risk", patterns: [/\btoken risk\b/i, /\brug pull\b/i, /\bhoneypot\b/i, /\bsafe token\b/i] },
  { intent: "token_holders", patterns: [/\bholder(s)? of\b/i, /\bwho holds\b/i, /\bwho owns the most\b/i, /\btoken holder list\b/i, /\bholder list\b/i, /\bshow.*holder/i, /\btop holder.*of\b/i] },
  { intent: "nft_balances", patterns: [/\bnft\b/i, /\bcollectibl/i, /\bnon.fungible\b/i, /\berc.721\b/i, /\berc.1155\b/i, /\bmy.*nft\b/i, /\bnft.*balance\b/i, /\bnft.*wallet\b/i] },
  { intent: "wallet_stats", patterns: [/\bwallet (age|stats|statistics|info|summary)\b/i, /\bhow old is.*wallet\b/i, /\bwallet.*old\b/i, /\btx count\b/i, /\btransaction count\b/i, /\baccount age\b/i, /\bwallet.*active\b/i] },
  { intent: "whale_watch", patterns: [/\bwhales?\b/i, /\bwatch wallet\b/i, /\btrack wallet\b/i, /\blarge holders?\b/i, /\btop holders?\b/i, /\bbiggest holders?\b/i] },
  { intent: "whale_activity", patterns: [/\bwhale activity\b/i, /\bwhale moves\b/i, /\bwhale transactions\b/i] },
  { intent: "copy_wallet_analyze", patterns: [/\bcopy wallet\b/i, /\bmimic wallet\b/i, /\bfollow wallet\b/i, /\bcopy trader\b/i] },
  { intent: "copy_wallet_prepare", patterns: [/\bprepare copy\b/i, /\bcopy trade\b/i, /\bcopy.*portfolio\b/i] },
  { intent: "transaction_explain", patterns: [/\bexplain.*tx\b/i, /\bwhat is this transaction\b/i, /\bdecode tx\b/i] },
  { intent: "mcp_setup", patterns: [/\bmcp\b/i, /\bmodel context protocol\b/i, /\bclaude desktop\b/i, /\bsetup.*server\b/i] },
  { intent: "claude_setup", patterns: [/\bclaude setup\b/i, /\banthropics?\b/i, /\bapikey\b/i] },
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
    ],
  },
];

export function detectIntent(message: string, chatbotType: ChatRequest["chatbotType"]): Intent {
  // Landing chatbot is read-only — never execute write intents
  const writeIntents: Intent[] = ["send", "swap_execute", "aave_supply", "x402_pay", "copy_wallet_prepare"];

  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(message))) {
      if (chatbotType === "landing" && writeIntents.includes(intent)) {
        return "unsupported";
      }
      return intent;
    }
  }
  return "unsupported";
}
