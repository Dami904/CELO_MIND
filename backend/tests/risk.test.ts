import { describe, it, expect } from "vitest";
import { checkMaliciousTransaction } from "../packages/mcp-server/src/risk.js";

describe("checkMaliciousTransaction (heuristic, no network)", () => {
  it("flags unlimited approval calldata", async () => {
    const txData = "function approve(address spender, uint256 amount) 0xffffffff unlimited";
    const report = await checkMaliciousTransaction(txData, "alfajores");
    expect(report.riskScore).toBeGreaterThan(0);
    expect(report.flags.length).toBeGreaterThan(0);
    expect(report.riskLevel).not.toBe("low");
  });

  it("flags selfdestruct in calldata", async () => {
    const txData = "contract contains selfdestruct opcode calls";
    const report = await checkMaliciousTransaction(txData, "alfajores");
    expect(report.flags.some((f) => f.includes("selfdestruct"))).toBe(true);
    expect(report.riskScore).toBeGreaterThan(40);
  });

  it("has low risk for benign calldata", async () => {
    const txData = "simple token transfer to 0x1234";
    const report = await checkMaliciousTransaction(txData, "alfajores");
    expect(report.riskLevel).toBe("low");
    expect(report.riskScore).toBe(0);
  });

  it("always includes explanation and recommendation", async () => {
    const report = await checkMaliciousTransaction("some calldata", "alfajores");
    expect(report.explanation).toBeTruthy();
    expect(report.recommendation).toBeTruthy();
  });

  it("always includes uncertainty note", async () => {
    const report = await checkMaliciousTransaction("approve transferFrom", "alfajores");
    expect(report.uncertainty).toBeTruthy();
  });
});
