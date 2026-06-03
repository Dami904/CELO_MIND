import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveRpcUrl, marketNetwork, getNetwork, resolveNetwork } from "../packages/shared/src/index.js";
import { cached, cacheGet, cacheSet, isRedisConfigured } from "../packages/shared/src/cache.js";

describe("resolveRpcUrl", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("uses CELO_MAINNET_RPC_URL for mainnet", () => {
    process.env.CELO_MAINNET_RPC_URL = "https://mainnet.example";
    expect(resolveRpcUrl("celo")).toBe("https://mainnet.example");
  });

  it("uses CELO_TESTNET_RPC_URL for testnets", () => {
    process.env.CELO_TESTNET_RPC_URL = "https://testnet.example";
    expect(resolveRpcUrl("sepolia")).toBe("https://testnet.example");
    expect(resolveRpcUrl("alfajores")).toBe("https://testnet.example");
  });

  it("falls back to legacy CELO_RPC_URL then the built-in default", () => {
    delete process.env.CELO_MAINNET_RPC_URL;
    delete process.env.CELO_TESTNET_RPC_URL;
    process.env.CELO_RPC_URL = "https://legacy.example";
    expect(resolveRpcUrl("celo")).toBe("https://legacy.example");
    delete process.env.CELO_RPC_URL;
    expect(resolveRpcUrl("celo")).toBe(getNetwork("celo").rpcUrl);
  });
});

describe("marketNetwork (hybrid)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to mainnet", () => {
    delete process.env.MARKET_NETWORK;
    expect(marketNetwork()).toBe("celo");
  });

  it("honors MARKET_NETWORK override", () => {
    process.env.MARKET_NETWORK = "alfajores";
    expect(marketNetwork()).toBe("alfajores");
  });
});

describe("network config uses Blockscout (no Celoscan V1)", () => {
  it("mainnet/alfajores/sepolia all point at blockscout hosts", () => {
    for (const n of ["celo", "alfajores", "sepolia"] as const) {
      expect(getNetwork(n).blockscoutUrl).toContain("blockscout.com");
      expect(getNetwork(n).blockscoutUrl).not.toContain("celoscan.io");
    }
  });

  it("resolveNetwork parses the Sepolia label", () => {
    expect(resolveNetwork("Celo Sepolia Testnet")).toBe("sepolia");
  });
});

describe("cache (in-memory fallback)", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_URL;
    delete process.env.UPSTASH_REDIS_TOKEN;
  });

  it("reports redis not configured when env is absent", () => {
    expect(isRedisConfigured()).toBe(false);
  });

  it("set then get round-trips through memory", async () => {
    await cacheSet("test:k1", 60, { a: 1 });
    expect(await cacheGet<{ a: number }>("test:k1")).toEqual({ a: 1 });
  });

  it("cached() runs the producer once and serves the cached value after", async () => {
    let calls = 0;
    const produce = async () => {
      calls++;
      return { v: calls };
    };
    const first = await cached("test:once", 60, produce);
    const second = await cached("test:once", 60, produce);
    expect(first).toEqual({ v: 1 });
    expect(second).toEqual({ v: 1 });
    expect(calls).toBe(1);
  });

  it("does not cache null results (allows retry)", async () => {
    let calls = 0;
    const produce = async () => {
      calls++;
      return calls === 1 ? null : { ok: true };
    };
    const first = await cached("test:null", 60, produce);
    const second = await cached("test:null", 60, produce);
    expect(first).toBeNull();
    expect(second).toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});
