/**
 * Aave V3 on Celo — live lending position reads + prepared supply txs.
 * Pool verified on-chain (getReservesList returns CELO/cUSD/cEUR/USDC/USDT/WETH).
 */
import { encodeFunctionData, formatUnits, parseUnits, type Address } from "viem";
import { findTokenAsync, type Network } from "@celomind/shared";
import { getPublicClient } from "./celo-client.js";

export const AAVE_V3_POOL = "0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402" as Address;
const UINT_MAX_HF = 10n ** 30n; // healthFactor is type(uint256).max when there's no debt

const POOL_ABI = [
  {
    type: "function",
    name: "getUserAccountData",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export async function getAavePosition(walletAddress: string, network: Network = "celo") {
  const client = getPublicClient(network);
  const r = (await client.readContract({
    address: AAVE_V3_POOL,
    abi: POOL_ABI,
    functionName: "getUserAccountData",
    args: [walletAddress as Address],
  })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
  const [collateral, debt, available, liqThreshold, ltv, hf] = r;
  const usd = (v: bigint) => Number(formatUnits(v, 8)).toFixed(2); // Aave base currency = 8 decimals
  return {
    walletAddress,
    protocol: "Aave V3 (Celo)",
    source: "Aave V3 Pool",
    poolAddress: AAVE_V3_POOL,
    totalCollateralUsd: usd(collateral),
    totalDebtUsd: usd(debt),
    availableBorrowsUsd: usd(available),
    ltvPct: (Number(ltv) / 100).toFixed(2),
    liquidationThresholdPct: (Number(liqThreshold) / 100).toFixed(2),
    healthFactor: hf >= UINT_MAX_HF ? "∞ (no outstanding debt)" : Number(formatUnits(hf, 18)).toFixed(2),
    hasPosition: collateral > 0n || debt > 0n,
  };
}

export type PreparedAaveTx = { type: "approve" | "supply"; to: string; data: string; value: string; description: string };

export type PreparedAaveSupply = {
  protocol: string;
  asset: string;
  amount: string;
  transactions: PreparedAaveTx[];
  status: "prepared_for_review";
  warning: string;
  source: string;
};

export async function prepareAaveSupply(
  asset: string,
  amount: string,
  walletAddress: string,
  network: Network = "celo"
): Promise<PreparedAaveSupply | { error: string }> {
  const token = await findTokenAsync(asset, network);
  if (!token) return { error: `Unknown asset "${asset}".` };
  let raw: bigint;
  try { raw = parseUnits(amount, token.decimals); } catch { return { error: `Invalid amount "${amount}".` }; }
  if (raw <= 0n) return { error: "Amount must be greater than 0." };

  const transactions: PreparedAaveTx[] = [];
  let needsApproval = true;
  try {
    const client = getPublicClient(network);
    const allowance = (await client.readContract({
      address: token.address as Address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [walletAddress as Address, AAVE_V3_POOL],
    })) as bigint;
    needsApproval = allowance < raw;
  } catch {
    needsApproval = true;
  }
  if (needsApproval) {
    transactions.push({
      type: "approve",
      to: token.address,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [AAVE_V3_POOL, raw] }),
      value: "0",
      description: `Approve Aave to spend ${amount} ${token.symbol}`,
    });
  }
  transactions.push({
    type: "supply",
    to: AAVE_V3_POOL,
    data: encodeFunctionData({ abi: POOL_ABI, functionName: "supply", args: [token.address as Address, raw, walletAddress as Address, 0] }),
    value: "0",
    description: `Supply ${amount} ${token.symbol} to Aave V3`,
  });

  return {
    protocol: "Aave V3 (Celo)",
    asset: token.symbol,
    amount,
    transactions,
    status: "prepared_for_review" as const,
    warning: "Review and sign these in your wallet. The backend never signs or executes.",
    source: "Aave V3 Pool",
  };
}
