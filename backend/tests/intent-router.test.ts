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

  it("detects whale_watch intent", () => {
    expect(detectIntent("Track this whale wallet", "full")).toBe("whale_watch");
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
    expect(detectIntent("Show whale activity", "full")).toBe("whale_activity");
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
