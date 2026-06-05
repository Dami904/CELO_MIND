import { describe, it, expect } from "vitest";
import {
  CeloPreparedSwapParamsSchema,
  CeloSwapQuoteParamsSchema,
  CeloTransferParamsSchema,
  ChatRequestSchema,
  RiskCheckRequestSchema,
  WalletAddressSchema,
  makeOk,
  makeErr,
  findToken,
  getTokenList,
  NETWORKS,
} from "../packages/shared/src/index.js";

describe("WalletAddressSchema", () => {
  it("accepts a valid address", () => {
    expect(WalletAddressSchema.safeParse("0xAbCdEf1234567890abcdef1234567890ABCDEF12").success).toBe(true);
  });

  it("rejects address without 0x prefix", () => {
    expect(WalletAddressSchema.safeParse("AbCdEf1234567890abcdef1234567890ABCDEF12").success).toBe(false);
  });

  it("rejects address that is too short", () => {
    expect(WalletAddressSchema.safeParse("0x1234").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(WalletAddressSchema.safeParse("").success).toBe(false);
  });
});

describe("ChatRequestSchema", () => {
  it("validates a full chat request", () => {
    const result = ChatRequestSchema.safeParse({
      message: "What is my CELO balance?",
      walletAddress: "0x1234567890123456789012345678901234567890",
      chatbotType: "full",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = ChatRequestSchema.safeParse({ message: "", chatbotType: "full" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid chatbotType", () => {
    const result = ChatRequestSchema.safeParse({ message: "hi", chatbotType: "invalid" });
    expect(result.success).toBe(false);
  });

  it("allows optional walletAddress", () => {
    const result = ChatRequestSchema.safeParse({ message: "What is Celo?", chatbotType: "docs" });
    expect(result.success).toBe(true);
  });
});

describe("RiskCheckRequestSchema", () => {
  it("accepts valid contract risk check", () => {
    const result = RiskCheckRequestSchema.safeParse({
      type: "contract",
      target: "0x1234567890123456789012345678901234567890",
      network: "celo",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = RiskCheckRequestSchema.safeParse({ type: "unknown", target: "0x123" });
    expect(result.success).toBe(false);
  });

  it("defaults network to celo", () => {
    const result = RiskCheckRequestSchema.safeParse({ type: "token", target: "0x123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.network).toBe("celo");
  });
});

describe("Celo action schemas", () => {
  it("canonicalizes transfer token symbols and numeric amounts", () => {
    const result = CeloTransferParamsSchema.safeParse({
      to: "0x1234567890123456789012345678901234567890",
      amount: 1.5,
      tokenSymbolOrAddress: "cusd",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe("1.5");
      expect(result.data.tokenSymbolOrAddress).toBe("cUSD");
      expect(result.data.network).toBe("celo");
    }
  });

  it("rejects placeholder or malformed transfer recipients", () => {
    const result = CeloTransferParamsSchema.safeParse({
      to: "0xRecipientAddress",
      amount: "1",
      tokenSymbolOrAddress: "CELO",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported transfer tokens", () => {
    const result = CeloTransferParamsSchema.safeParse({
      to: "0x1234567890123456789012345678901234567890",
      amount: "1",
      tokenSymbolOrAddress: "DOGE",
    });

    expect(result.success).toBe(false);
  });

  it("validates and canonicalizes swap quote parameters", () => {
    const result = CeloSwapQuoteParamsSchema.safeParse({
      fromToken: "celo",
      toToken: "CUSD",
      amount: "10",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fromToken).toBe("CELO");
      expect(result.data.toToken).toBe("cUSD");
    }
  });

  it("defaults prepared swap slippage to 50 bps", () => {
    const result = CeloPreparedSwapParamsSchema.safeParse({
      fromToken: "CELO",
      toToken: "cUSD",
      amount: "10",
      walletAddress: "0x1234567890123456789012345678901234567890",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slippageBps).toBe(50);
  });

  it("rejects unsafe swap slippage", () => {
    const tooLow = CeloPreparedSwapParamsSchema.safeParse({
      fromToken: "CELO",
      toToken: "cUSD",
      amount: "10",
      walletAddress: "0x1234567890123456789012345678901234567890",
      slippageBps: 0,
    });
    const tooHigh = CeloPreparedSwapParamsSchema.safeParse({
      fromToken: "CELO",
      toToken: "cUSD",
      amount: "10",
      walletAddress: "0x1234567890123456789012345678901234567890",
      slippageBps: 501,
    });

    expect(tooLow.success).toBe(false);
    expect(tooHigh.success).toBe(false);
  });
});

describe("makeOk / makeErr", () => {
  it("makeOk returns correct shape", () => {
    const res = makeOk("test_action", "celo", { value: 42 });
    expect(res.success).toBe(true);
    expect(res.action).toBe("test_action");
    expect(res.network).toBe("celo");
    expect(res.data).toEqual({ value: 42 });
    expect(res.error).toBeNull();
    expect(res.timestamp).toBeDefined();
  });

  it("makeErr returns correct shape", () => {
    const res = makeErr("test_action", "celo", "ERR_CODE", "Something failed");
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("ERR_CODE");
    expect(res.error?.message).toBe("Something failed");
    expect(res.data).toBeNull();
  });
});

describe("findToken (mainnet-only)", () => {
  it("finds cUSD by symbol", () => {
    const token = findToken("cUSD", "celo");
    expect(token).toBeDefined();
    expect(token?.symbol).toBe("cUSD");
    expect(token?.decimals).toBe(18);
  });

  it("finds CELO by symbol", () => {
    const token = findToken("CELO", "celo");
    expect(token).toBeDefined();
    expect(token?.address).toBe("0x471EcE3750Da237f93B8E339c536989b8978a438");
  });

  it("finds token by lowercase mainnet address", () => {
    const token = findToken("0x765de816845861e75a25fca122bb6898b8b1282a", "celo");
    expect(token?.symbol).toBe("cUSD");
  });

  it("returns undefined for unknown token", () => {
    const token = findToken("UNKNOWN", "celo");
    expect(token).toBeUndefined();
  });

  it("works with no network arg (defaults to celo)", () => {
    expect(findToken("CELO")?.symbol).toBe("CELO");
  });
});

describe("getTokenList (mainnet-only)", () => {
  it("returns Celo mainnet tokens", () => {
    const list = getTokenList("celo");
    expect(list).toHaveProperty("CELO");
    expect(list).toHaveProperty("cUSD");
    expect(list).toHaveProperty("USDC");
  });
});

describe("NETWORKS config (mainnet-only)", () => {
  it("celo mainnet has correct chain id", () => {
    expect(NETWORKS.celo.chainId).toBe(42220);
  });

  it("has no testnet entries", () => {
    expect(Object.keys(NETWORKS)).toEqual(["celo"]);
  });
});
