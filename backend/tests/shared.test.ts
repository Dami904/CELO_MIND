import { describe, it, expect } from "vitest";
import { ChatRequestSchema, RiskCheckRequestSchema, WalletAddressSchema, makeOk, makeErr, findToken, getTokenList, NETWORKS } from "../packages/shared/src/index.js";

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
      network: "alfajores",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = RiskCheckRequestSchema.safeParse({ type: "unknown", target: "0x123" });
    expect(result.success).toBe(false);
  });

  it("defaults network to alfajores", () => {
    const result = RiskCheckRequestSchema.safeParse({ type: "token", target: "0x123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.network).toBe("alfajores");
  });
});

describe("makeOk / makeErr", () => {
  it("makeOk returns correct shape", () => {
    const res = makeOk("test_action", "alfajores", { value: 42 });
    expect(res.success).toBe(true);
    expect(res.action).toBe("test_action");
    expect(res.network).toBe("alfajores");
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

describe("findToken", () => {
  it("finds cUSD by symbol on alfajores", () => {
    const token = findToken("cUSD", "alfajores");
    expect(token).toBeDefined();
    expect(token?.symbol).toBe("cUSD");
    expect(token?.decimals).toBe(18);
  });

  it("finds CELO by symbol on mainnet", () => {
    const token = findToken("CELO", "celo");
    expect(token).toBeDefined();
    expect(token?.address).toBe("0x471EcE3750Da237f93B8E339c536989b8978a438");
  });

  it("finds token by lowercase address", () => {
    const token = findToken("0x874069fa1eb16d44d622f2e0ca25eea172369bc1", "alfajores");
    expect(token?.symbol).toBe("cUSD");
  });

  it("returns undefined for unknown token", () => {
    const token = findToken("UNKNOWN", "alfajores");
    expect(token).toBeUndefined();
  });
});

describe("getTokenList", () => {
  it("returns alfajores tokens", () => {
    const list = getTokenList("alfajores");
    expect(list).toHaveProperty("CELO");
    expect(list).toHaveProperty("cUSD");
  });

  it("returns mainnet tokens", () => {
    const list = getTokenList("celo");
    expect(list).toHaveProperty("USDC");
  });
});

describe("NETWORKS config", () => {
  it("alfajores has correct chain id", () => {
    expect(NETWORKS.alfajores.chainId).toBe(44787);
  });

  it("celo mainnet has correct chain id", () => {
    expect(NETWORKS.celo.chainId).toBe(42220);
  });
});
