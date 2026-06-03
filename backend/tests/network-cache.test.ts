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

  it("falls back to legacy CELO_RPC_URL then the built-in default", () => {
    delete process.env.CELO_MAINNET_RPC_URL;
    process.env.CELO_RPC_URL = "https://legacy.example";
    expect(resolveRpcUrl("celo")).toBe("https://legacy.example");
    delete process.env.CELO_RPC_URL;
    expect(resolveRpcUrl("celo")).toBe(getNetwork("celo").rpcUrl);
  });
});

describe("marketNetwork (mainnet-only)", () => {
  it("always resolves to mainnet", () => {
    expect(marketNetwork()).toBe("celo");
  });
});

describe("network config (mainnet-only, Blockscout — no Celoscan V1)", () => {
  it("celo points at the Blockscout host", () => {
    expect(getNetwork("celo").blockscoutUrl).toContain("blockscout.com");
    expect(getNetwork("celo").blockscoutUrl).not.toContain("celoscan.io");
  });

  it("resolveNetwork always returns celo (testnets unsupported)", () => {
    expect(resolveNetwork("Celo Sepolia Testnet")).toBe("celo");
    expect(resolveNetwork("alfajores")).toBe("celo");
    expect(resolveNetwork(undefined)).toBe("celo");
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
