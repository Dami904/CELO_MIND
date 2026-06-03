import { describe, it, expect } from "vitest";
import { searchDocs, buildDocsContext, CELO_DOCS } from "../packages/docs-knowledge/src/celo-docs.js";

describe("searchDocs", () => {
  it("finds docs about stablecoins", () => {
    const results = searchDocs("cusd stablecoin");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].topic).toContain("Stablecoin");
  });

  it("finds docs about Aave", () => {
    const results = searchDocs("aave lending");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].keywords).toContain("aave");
  });

  it("finds docs about wallets", () => {
    const results = searchDocs("wallet setup");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty for completely unrelated query", () => {
    const results = searchDocs("quantum physics space travel");
    expect(results.length).toBe(0);
  });

  it("finds docs about MCP setup", () => {
    const results = searchDocs("mcp claude desktop");
    expect(results.length).toBeGreaterThan(0);
  });

  it("finds docs about risk assessment", () => {
    const results = searchDocs("rug pull token risk");
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("buildDocsContext", () => {
  it("returns a non-empty string for known topics", () => {
    const ctx = buildDocsContext("what is celo");
    expect(ctx.length).toBeGreaterThan(10);
    expect(ctx).not.toContain("No specific Celo documentation");
  });

  it("returns fallback for unknown topics", () => {
    const ctx = buildDocsContext("quantum physics neutron stars");
    expect(ctx).toContain("No specific Celo documentation");
  });

  it("limits results to maxEntries", () => {
    const ctx = buildDocsContext("celo", 1);
    const headerCount = (ctx.match(/### /g) ?? []).length;
    expect(headerCount).toBeLessThanOrEqual(1);
  });
});

describe("CELO_DOCS entries", () => {
  it("all entries have required fields", () => {
    for (const entry of CELO_DOCS) {
      expect(entry.topic).toBeTruthy();
      expect(Array.isArray(entry.keywords)).toBe(true);
      expect(entry.keywords.length).toBeGreaterThan(0);
      expect(entry.content.length).toBeGreaterThan(20);
    }
  });
});
