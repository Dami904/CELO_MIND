import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Blockscout v2 client", () => {
  it("maps token-balances into USD-valued entries", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => [
        {
          value: "1500000000000000000", // 1.5 * 1e18
          token: {
            address_hash: "0xToken",
            decimals: "18",
            exchange_rate: "2.00",
            symbol: "cUSD",
            name: "Celo Dollar",
            type: "ERC-20",
            icon_url: "https://icon",
          },
        },
      ],
    }));

    const { getTokenBalancesV2 } = await import("../packages/mcp-server/src/blockscout.js");
    const out = await getTokenBalancesV2("0xWallet", "celo");
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("cUSD");
    expect(out[0].balance).toBe("1.5");
    expect(out[0].usdValue).toBe("3.00"); // 1.5 * 2.00
    expect(out[0].usdPrice).toBe("2.00");
  });

  it("maps token holders", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        items: [
          { address: { hash: "0xWhale", is_contract: false, is_scam: false, name: null }, value: "999" },
        ],
      }),
    }));
    const { getTokenHoldersV2 } = await import("../packages/mcp-server/src/blockscout.js");
    const holders = await getTokenHoldersV2("0xToken", "celo");
    expect(holders[0].address).toBe("0xWhale");
    expect(holders[0].value).toBe("999");
  });
});

describe("Dune Analytics client", () => {
  it("is disabled (returns null) when DUNE_API_KEY is unset", async () => {
    const saved = process.env.DUNE_API_KEY;
    delete process.env.DUNE_API_KEY;
    const { runDuneQueryLatest, duneEnabled } = await import("../packages/mcp-server/src/dune.js");
    expect(duneEnabled()).toBe(false);
    expect(await runDuneQueryLatest(123)).toBeNull();
    if (saved) process.env.DUNE_API_KEY = saved;
  });

  it("parses rows from the latest-results endpoint when enabled", async () => {
    process.env.DUNE_API_KEY = "test-key";
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ result: { rows: [{ token: "CELO", volume: 100 }] }, execution_ended_at: "2026-01-01T00:00:00Z" }),
    }));
    const { runDuneQueryLatest } = await import("../packages/mcp-server/src/dune.js");
    const out = await runDuneQueryLatest(123, 0);
    expect(out?.source).toBe("Dune Analytics");
    expect(out?.rows).toEqual([{ token: "CELO", volume: 100 }]);
    delete process.env.DUNE_API_KEY;
  });
});
