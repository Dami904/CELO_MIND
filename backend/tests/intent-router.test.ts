import { describe, it, expect } from "vitest";
import { detectIntent, resolveIntent } from "../apps/api/src/ai/intent-router.js";

describe("detectIntent", () => {
  it("detects balance intent", () => {
    expect(detectIntent("What is my balance?", "full")).toBe("balance");
  });

  it("detects token_balance intent before the generic balance fallback", () => {
    expect(detectIntent("Check cUSD balance", "full")).toBe("token_balance");
  });

  it("detects token_price intent", () => {
    expect(detectIntent("What is the price of CELO?", "full")).toBe("token_price");
  });

  it("detects market_trending intent", () => {
    expect(detectIntent("Show me trending tokens", "full")).toBe("market_trending");
  });

  it("asks for an address when a whale wallet is mentioned without one", () => {
    const result = resolveIntent("Track this whale wallet", "full");
    expect(result.intent).toBe("unsupported");
    expect(result.clarification).toContain("wallet address");
  });

  it("detects whale_watch intent for top-whale queries", () => {
    expect(detectIntent("Show top whales on Celo", "full")).toBe("whale_watch");
  });

  it("detects contract_risk intent", () => {
    expect(detectIntent("Check contract risk for 0x1234567890123456789012345678901234567890", "full")).toBe("contract_risk");
  });

  it("detects token_risk intent", () => {
    expect(detectIntent("Is this token a rug pull?", "full")).toBe("token_risk");
  });

  it("detects copy_wallet_analyze intent", () => {
    expect(detectIntent("Copy wallet strategy for this address", "full")).toBe("copy_wallet_analyze");
  });

  it("detects docs_explain intent", () => {
    expect(detectIntent("Explain how Celo works", "full")).toBe("docs_explain");
  });

  it("detects mcp_setup intent", () => {
    expect(detectIntent("How do I set up the MCP server?", "full")).toBe("mcp_setup");
  });

  it("returns unsupported for landing chatbot write intent", () => {
    expect(detectIntent("Send 1 CELO to 0x1234", "landing")).toBe("unsupported");
  });

  it("allows send intent on full chatbot", () => {
    expect(detectIntent("Send 1 CELO to 0x1234", "full")).toBe("send");
  });

  it("returns unsupported for unrecognized message", () => {
    expect(detectIntent("blah blah blah xyz random", "full")).toBe("unsupported");
  });

  it("detects recent_transactions intent", () => {
    expect(detectIntent("Show my transaction history", "full")).toBe("recent_transactions");
  });

  it("detects wallet_portfolio intent for wallet token queries", () => {
    expect(detectIntent("wallet tokens", "full")).toBe("wallet_portfolio");
  });

  it("detects aave_position intent", () => {
    expect(detectIntent("Check my Aave borrowings", "full")).toBe("aave_position");
  });

  it("detects self_verify intent", () => {
    expect(detectIntent("How do I verify my identity with Self?", "full")).toBe("self_verify");
  });

  it("detects x402_pay intent", () => {
    expect(detectIntent("How does x402 payment work?", "full")).toBe("x402_pay");
  });

  it("routes generic x402 questions to docs_explain instead of payment prep", () => {
    expect(detectIntent("What is x402?", "full")).toBe("docs_explain");
  });

  it("routes generic MCP questions to docs_explain instead of setup", () => {
    expect(detectIntent("What is MCP?", "full")).toBe("docs_explain");
  });

  it("routes token explanation questions to token_info for non-CELO assets", () => {
    expect(detectIntent("What is cUSD?", "full")).toBe("token_info");
  });

  it("routes bare Aave concept questions to docs_explain", () => {
    expect(detectIntent("What is Aave?", "full")).toBe("docs_explain");
  });

  it("routes whale activity queries to whale_activity", () => {
    const result = resolveIntent("Show whale activity", "full");
    expect(result.intent).toBe("unsupported");
    expect(result.clarification).toContain("wallet address");
  });

  it("detects whale_activity intent when a wallet address is included", () => {
    expect(detectIntent("Show whale activity for 0x1234567890123456789012345678901234567890", "full")).toBe("whale_activity");
  });

  it("asks for pool metric clarification when best pool is ambiguous", () => {
    const result = resolveIntent("best pool", "full");
    expect(result.intent).toBe("unsupported");
    expect(result.clarification).toContain("highest TVL");
  });

  it("asks for a token when price history is ambiguous", () => {
    const result = resolveIntent("price history", "full");
    expect(result.intent).toBe("unsupported");
    expect(result.clarification).toContain("Which token");
  });

  it("clarifies gas history requests instead of guessing current gas", () => {
    const result = resolveIntent("Inspect Celo gas price history", "full");
    expect(result.intent).toBe("unsupported");
    expect(result.clarification).toContain("historical gas charts");
  });

  it("clarifies whale trade detection requests instead of guessing whale watch", () => {
    const result = resolveIntent("Detect whale trades in past 24 hours", "full");
    expect(result.intent).toBe("unsupported");
    expect(result.clarification).toContain("market-wide whale trade detection");
  });

  it("asks for a tx hash when the request is missing one", () => {
    const result = resolveIntent("explain this tx", "full");
    expect(result.intent).toBe("unsupported");
    expect(result.clarification).toContain("transaction hash");
  });

  it("asks for a contract address when the request is missing one", () => {
    const result = resolveIntent("audit contract", "full");
    expect(result.intent).toBe("unsupported");
    expect(result.clarification).toContain("contract address");
  });

  it("landing chatbot blocks swap_execute", () => {
    // swap_execute now requires an amount (an actual command, not an explanation)
    expect(detectIntent("Swap 10 CELO for cUSD", "landing")).toBe("unsupported");
  });
});

describe("quick action variants", () => {
  const cases: Array<{
    name: string;
    intent: ReturnType<typeof detectIntent>;
    variants: string[];
  }> = [
    {
      name: "CELO balance",
      intent: "balance",
      variants: [
        "What is my CELO balance?",
        "Check my CELO balance",
        "Show my CELO balance",
        "How much CELO do I have?",
        "View my CELO balance",
      ],
    },
    {
      name: "wallet portfolio",
      intent: "wallet_portfolio",
      variants: [
        "Show my wallet portfolio",
        "View my wallet portfolio",
        "List my wallet holdings",
        "What tokens are in my wallet?",
        "What do I hold in this wallet?",
      ],
    },
    {
      name: "cUSD balance",
      intent: "token_balance",
      variants: [
        "What is my cUSD balance?",
        "Check my cUSD balance",
        "Show my cUSD balance",
        "How much cUSD do I have?",
        "View my cUSD balance",
      ],
    },
    {
      name: "token price",
      intent: "token_price",
      variants: [
        "What is the price of CELO?",
        "Check the CELO price",
        "Show cUSD price",
        "What is the cEUR price?",
        "Give me the USDC price",
      ],
    },
    {
      name: "trending tokens",
      intent: "market_trending",
      variants: [
        "Show trending tokens on Celo",
        "Show me trending tokens",
        "What tokens are trending?",
        "Show hot coins on Celo",
        "List popular tokens",
      ],
    },
    {
      name: "recent launches",
      intent: "recent_launches",
      variants: [
        "Show recently launched tokens on Celo",
        "Show recent launches",
        "What new tokens launched recently?",
        "List recently launched tokens on Celo",
        "Show new tokens on Celo",
      ],
    },
    {
      name: "whale leaderboard",
      intent: "whale_watch",
      variants: [
        "Show the Whale Leaderboard on Celo",
        "Show top whales on Celo",
        "List top holders on Celo",
        "Who are the biggest holders on Celo?",
        "Whale leaderboard",
      ],
    },
    {
      name: "swap quote",
      intent: "swap_quote",
      variants: [
        "Swap quote for 10 CELO to cUSD",
        "Get swap quote for 10 CELO to cUSD",
        "What is the quote for 10 CELO to cUSD?",
        "How much would I get swapping 10 CELO?",
        "Quote 10 CELO to cUSD",
      ],
    },
    {
      name: "swap execution",
      intent: "swap_execute",
      variants: [
        "Swap 10 CELO for cUSD",
        "Swap 2 CELO to cUSD",
        "Trade 5 CELO for cUSD",
        "Exchange 1 CELO for cUSD",
        "Swap 0.5 CELO into cUSD",
      ],
    },
    {
      name: "send transfer",
      intent: "send",
      variants: [
        "Transfer 1 CELO to 0xRecipientAddress",
        "Send 1 CELO to 0xRecipientAddress",
        "Transfer 1 CELO -> 0xRecipientAddress",
        "Send 1 CELO to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        "Transfer 0.5 CELO to 0xRecipientAddress",
      ],
    },
    {
      name: "contract risk",
      intent: "contract_risk",
      variants: [
        "Check contract risk for 0x471EcE3750Da237f93B8E339c536989b8978a438",
        "Audit contract risk for 0x471EcE3750Da237f93B8E339c536989b8978a438",
        "Audit 0x471EcE3750Da237f93B8E339c536989b8978a438",
        "Check contract 0x471EcE3750Da237f93B8E339c536989b8978a438",
        "Audit contract for 0x471EcE3750Da237f93B8E339c536989b8978a438",
      ],
    },
    {
      name: "gas price",
      intent: "gas_price",
      variants: [
        "What is the current Celo gas price?",
        "Check current gas price",
        "Show current gas price",
        "How much is gas right now on Celo?",
        "What's the gas price on Celo?",
      ],
    },
  ];

  it.each(cases)("$name stays on the intended route across common phrasings", ({ intent, variants }) => {
    for (const variant of variants) {
      expect(detectIntent(variant, "full")).toBe(intent);
    }
  });
});

describe("text normalization", () => {
  it("handles contractions and shorthand before routing", () => {
    expect(detectIntent("What's my CELO balance?", "full")).toBe("balance");
    expect(detectIntent("What's my cUSD balance?", "full")).toBe("token_balance");
    expect(detectIntent("What's cUSD?", "full")).toBe("token_info");
    expect(detectIntent("What's the current Celo gas price?", "full")).toBe("gas_price");
    expect(detectIntent("What would I get if I swapped 10 CELO nd cUSD?", "full")).toBe("swap_quote");
  });
});
