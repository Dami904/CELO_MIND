import { getNetwork, marketNetwork, type Network } from "@celomind/shared";
import { isContractVerifiedV2, getTokenInfoV2 } from "./blockscout.js";

/** Etherscan-V1-compatible API on the Blockscout host (replaces deprecated Celoscan V1). */
function v1Base(network: Network) {
  return getNetwork(network).blockscoutUrl;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskReport = {
  target: string;
  type: string;
  riskLevel: RiskLevel;
  riskScore: number; // 0-100 (100 = most risky)
  flags: string[];
  explanation: string;
  recommendation: string;
  uncertainty?: string;
  source: string;
};

export async function checkContractRisk(contractAddress: string, network: Network = marketNetwork()): Promise<RiskReport> {
  const apiKey = process.env.BLOCKSCOUT_API_KEY ?? "";
  const flags: string[] = [];
  let score = 0;

  try {
    // Check if contract is verified (Blockscout REST v2)
    const verified = await isContractVerifiedV2(contractAddress, network);
    if (verified === false) {
      flags.push("Contract source code is NOT verified on-chain");
      score += 40;
    }

    // Check contract age via first tx (Blockscout, Etherscan-V1-compatible endpoint)
    const txData = await fetchJson<{ status: string; result: { timeStamp: string }[] }>(
      `${v1Base(network)}?module=account&action=txlist&address=${contractAddress}&sort=asc&page=1&offset=1${apiKey ? `&apikey=${apiKey}` : ""}`
    );
    if (txData.status === "1" && txData.result.length > 0) {
      const deployedAt = Number(txData.result[0].timeStamp) * 1000;
      const ageInDays = (Date.now() - deployedAt) / (1000 * 60 * 60 * 24);
      if (ageInDays < 7) {
        flags.push(`Contract is very new (${Math.floor(ageInDays)} days old)`);
        score += 25;
      } else if (ageInDays < 30) {
        flags.push(`Contract is relatively new (${Math.floor(ageInDays)} days old)`);
        score += 10;
      }
    }
  } catch {
    flags.push("Could not fetch contract data — treat as uncertain");
    score += 20;
  }

  const riskLevel = score >= 60 ? "critical" : score >= 40 ? "high" : score >= 20 ? "medium" : "low";

  return {
    target: contractAddress,
    type: "contract",
    riskLevel,
    riskScore: Math.min(score, 100),
    flags,
    explanation: flags.length ? `Found ${flags.length} risk indicator(s): ${flags.join("; ")}` : "No major risk indicators detected.",
    recommendation: riskLevel === "low" ? "Low risk — still DYOR before interacting." : `${riskLevel.toUpperCase()} risk — exercise extreme caution.`,
    uncertainty: "On-chain analysis only. No audit review performed.",
    source: "Blockscout",
  };
}

export async function checkTokenRisk(tokenAddress: string, network: Network = marketNetwork()): Promise<RiskReport> {
  const flags: string[] = [];
  let score = 0;

  try {
    // Token metrics via Blockscout REST v2 (holders, market cap, price).
    const info = await getTokenInfoV2(tokenAddress, network);
    if (info) {
      const holders = Number(info.holdersCount ?? "0");
      if (holders > 0 && holders < 50) {
        flags.push(`Very few holders (${holders}) — concentration / low-distribution risk`);
        score += 25;
      }
      if (!info.usdPrice) {
        flags.push("No market price available — illiquid or unlisted token");
        score += 15;
      }
    } else {
      flags.push("Token not indexed on Blockscout — possibly very new or non-standard");
      score += 30;
    }
  } catch {
    flags.push("Could not fetch token data");
    score += 15;
  }

  // Also run contract checks
  const contractRisk = await checkContractRisk(tokenAddress, network);
  flags.push(...contractRisk.flags);
  score += contractRisk.riskScore * 0.5; // weight contract risk at 50%

  const riskLevel = score >= 60 ? "critical" : score >= 40 ? "high" : score >= 20 ? "medium" : "low";

  return {
    target: tokenAddress,
    type: "token",
    riskLevel,
    riskScore: Math.min(Math.round(score), 100),
    flags,
    explanation: `Token risk analysis: ${flags.join("; ") || "No major issues found."}`,
    recommendation: riskLevel === "low" ? "Moderate confidence — DYOR before investing." : `${riskLevel.toUpperCase()} risk — do not invest without thorough research.`,
    uncertainty: "Analysis based on on-chain metrics and liquidity data only. No smart contract audit.",
    source: "Blockscout",
  };
}

export async function checkMaliciousTransaction(txData: string, network: Network): Promise<RiskReport> {
  const flags: string[] = [];
  let score = 0;

  // Heuristic checks on the raw tx data string
  if (txData.toLowerCase().includes("approve") && txData.includes("0xffffffff")) {
    flags.push("Unlimited token approval detected — could drain wallet");
    score += 60;
  }
  if (txData.toLowerCase().includes("transferfrom") && !txData.toLowerCase().includes("approve")) {
    flags.push("TransferFrom without prior approve context — suspicious");
    score += 30;
  }
  if (txData.includes("selfdestruct") || txData.includes("delegatecall")) {
    flags.push("Dangerous opcode pattern detected (selfdestruct / delegatecall)");
    score += 50;
  }
  if (txData.length > 10000) {
    flags.push("Unusually long calldata — could be obfuscated");
    score += 15;
  }

  const riskLevel = score >= 60 ? "critical" : score >= 40 ? "high" : score >= 20 ? "medium" : "low";

  return {
    target: txData.slice(0, 42),
    type: "transaction",
    riskLevel,
    riskScore: Math.min(score, 100),
    flags,
    explanation: flags.length ? `Transaction risk: ${flags.join("; ")}` : "No obvious malicious patterns detected in calldata.",
    recommendation: riskLevel === "low" ? "Looks safe — verify on explorer before signing." : `${riskLevel.toUpperCase()} risk — DO NOT sign this transaction.`,
    uncertainty: "Heuristic analysis only. Always review transactions on a block explorer.",
    source: "heuristic",
  };
}

export type WalletActivity = {
  address: string;
  txCount: number;
  recentTxs: unknown[];
  nativeBalance: string;
  label?: string;
};
