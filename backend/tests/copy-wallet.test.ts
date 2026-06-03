import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Copy-wallet safety tests — ensures no auto-execution ever happens, and that the token diff
 * works off Blockscout v2 balances. Network is mocked so no real RPC calls are made.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function balanceItem(symbol: string, addr: string) {
  return { value: "1000000000000000000", token: { address_hash: addr, decimals: "18", exchange_rate: "1.0", symbol, name: symbol, type: "ERC-20", icon_url: null } };
}

describe("copy-wallet no-auto-execute rule", () => {
  it("computes token diff and returns only pending_review actions", async () => {
    const SOURCE = "0x1111111111111111111111111111111111111111";
    const MINE = "0x2222222222222222222222222222222222222222";

    vi.stubGlobal("fetch", async (url: string) => {
      const u = String(url).toLowerCase();
      // Source holds CELO + UBE; mine holds only CELO → tokensToAdd should include UBE.
      const body = u.includes(SOURCE.toLowerCase())
        ? [balanceItem("CELO", "0xc"), balanceItem("UBE", "0xu")]
        : [balanceItem("CELO", "0xc")];
      return { ok: true, json: async () => body };
    });

    const { analyzeCopyWallet } = await import("../packages/mcp-server/src/whale.js");
    const result = await analyzeCopyWallet(SOURCE, MINE, "celo");

    expect(result.tokensToAdd).toContain("UBE");
    expect(result.tokensToRemove).toEqual([]);
    for (const action of result.preparedActions) {
      expect(action.status).toBe("pending_review");
    }
    expect(result.warning).toContain("never auto-executes");
    expect(result.strategyNotes.length).toBeGreaterThan(0);
  });

  it("analysis result never includes an 'executed' or 'sent' field", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => [] }));
    const { analyzeCopyWallet } = await import("../packages/mcp-server/src/whale.js");
    const result = await analyzeCopyWallet(
      "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "celo"
    );
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain('"executed"');
    expect(resultStr).not.toContain('"sent"');
  });
});
