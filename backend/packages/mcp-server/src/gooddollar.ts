/**
 * GoodDollar integration — UBI checks, reserve quotes, and claim actions.
 * GoodDollar is native to Celo: G$ token, daily UBI claims, and a bonding-curve reserve.
 * Public API: https://gooddollar.org  Contracts verified on Celo mainnet.
 */
import { cached } from "@celomind/shared";
import { getPublicClient, getWalletClient } from "./celo-client.js";
import type { Network } from "@celomind/shared";

const GD_API = "https://goodserver.gooddollar.org";
const GD_SUBGRAPH = "https://api.studio.thegraph.com/query/30829/gooddollar-celo/version/latest";

// Celo mainnet contract addresses
const CONTRACTS = {
  identity:      "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as `0x${string}`,
  ubi:           "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as `0x${string}`,
  reserve:       "0x9Ad949b8253EAB5c33B7C28Ac8C02c186E44b3C7" as `0x${string}`,
  gdToken:       "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as `0x${string}`,
};

const IDENTITY_ABI = [
  { name: "isWhitelisted",   type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "getWhitelistedRoot", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "address" }] },
] as const;

const UBI_ABI = [
  { name: "checkEntitlement", type: "function", stateMutability: "view",    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "claim",            type: "function", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "bool" }] },
] as const;

const RESERVE_ABI = [
  { name: "buyReturn",  type: "function", stateMutability: "view", inputs: [{ name: "toToken", type: "address" }, { name: "gdAmount", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "sellReturn", type: "function", stateMutability: "view", inputs: [{ name: "fromToken", type: "address" }, { name: "tokenAmount", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_BALANCE_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000), ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export async function getGoodDollarWhitelistingInfo(address: string, network: Network) {
  const client = getPublicClient(network);
  try {
    const [isWhitelisted, root] = await Promise.all([
      client.readContract({ address: CONTRACTS.identity, abi: IDENTITY_ABI, functionName: "isWhitelisted",      args: [address as `0x${string}`] }),
      client.readContract({ address: CONTRACTS.identity, abi: IDENTITY_ABI, functionName: "getWhitelistedRoot", args: [address as `0x${string}`] }).catch(() => null),
    ]);
    return {
      address,
      isWhitelisted,
      whitelistedRoot: root ?? null,
      identityContract: CONTRACTS.identity,
      note: isWhitelisted ? "This address is verified and can claim GoodDollar UBI." : "Not whitelisted. Verify identity via the GoodDollar app: https://wallet.gooddollar.org",
    };
  } catch (e) {
    return { address, isWhitelisted: false, error: String(e), note: "Could not query identity contract." };
  }
}

export async function getGoodDollarUBIEntitlement(address: string, network: Network) {
  const client = getPublicClient(network);
  try {
    const [entitlementRaw, decimals, gdBalance] = await Promise.all([
      client.readContract({ address: CONTRACTS.ubi,     abi: UBI_ABI,          functionName: "checkEntitlement", args: [address as `0x${string}`] }),
      client.readContract({ address: CONTRACTS.gdToken, abi: ERC20_BALANCE_ABI, functionName: "decimals" }),
      client.readContract({ address: CONTRACTS.gdToken, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [address as `0x${string}`] }),
    ]);
    const div = 10n ** BigInt(decimals);
    return {
      address,
      claimableGD: (Number(entitlementRaw) / Number(div)).toFixed(2),
      claimableRaw: entitlementRaw.toString(),
      currentGDBalance: (Number(gdBalance) / Number(div)).toFixed(2),
      canClaim: entitlementRaw > 0n,
      ubiContract: CONTRACTS.ubi,
    };
  } catch (e) {
    return { address, error: String(e), note: "Could not query UBI contract." };
  }
}

export async function getGoodDollarReserveQuote(gdAmount: string, network: Network) {
  return await cached(`gd:reserve:quote:${gdAmount}`, 60, async () => {
    const client = getPublicClient(network);
    try {
      const gdAmountBig = BigInt(Math.round(parseFloat(gdAmount) * 1e2)); // G$ uses 2 decimals
      const cUSDReturn = await client.readContract({
        address: CONTRACTS.reserve,
        abi: RESERVE_ABI,
        functionName: "sellReturn",
        args: [CONTRACTS.gdToken, gdAmountBig],
      });
      return {
        inputGD: gdAmount,
        outputCUSD: (Number(cUSDReturn) / 1e18).toFixed(6),
        reserveContract: CONTRACTS.reserve,
        note: "Selling G$ to cUSD via GoodDollar reserve. Actual rate may vary at execution.",
      };
    } catch (e) {
      return { inputGD: gdAmount, error: String(e), note: "Could not query reserve contract." };
    }
  });
}

export async function estimateGoodDollarReserveSwap(gdAmount: string, network: Network) {
  const client = getPublicClient(network);
  try {
    const gdAmountBig = BigInt(Math.round(parseFloat(gdAmount) * 1e2));
    const [cUSDReturn, gasPrice] = await Promise.all([
      client.readContract({ address: CONTRACTS.reserve, abi: RESERVE_ABI, functionName: "sellReturn", args: [CONTRACTS.gdToken, gdAmountBig] }),
      client.getGasPrice(),
    ]);
    const estimatedGas = 120000n;
    const gasCostWei = gasPrice * estimatedGas;
    return {
      inputGD: gdAmount,
      estimatedOutputCUSD: (Number(cUSDReturn) / 1e18).toFixed(6),
      estimatedGasUnits: estimatedGas.toString(),
      gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(4),
      estimatedGasCostCELO: (Number(gasCostWei) / 1e18).toFixed(6),
      reserveContract: CONTRACTS.reserve,
    };
  } catch (e) {
    return { inputGD: gdAmount, error: String(e) };
  }
}

export async function claimDailyGoodDollarUBI(network: Network) {
  const client = getWalletClient(network);
  if (!client.account) return { error: "CELO_PRIVATE_KEY not set — claiming UBI requires a signer." };
  try {
    const hash = await client.writeContract({
      address: CONTRACTS.ubi,
      abi: UBI_ABI,
      functionName: "claim",
      args: [],
      account: client.account,
      chain: client.chain,
    });
    return { status: "submitted", txHash: hash, ubiContract: CONTRACTS.ubi, note: "UBI claim submitted. Check your G$ balance after confirmation." };
  } catch (e) {
    return { error: String(e), note: "Claim failed — you may not be whitelisted or have already claimed today." };
  }
}

export async function executeGoodDollarReserveSwap(gdAmount: string, network: Network) {
  return { error: "Reserve swap execution requires signing via the GoodDollar wallet. Prepare the tx via estimateGoodDollarReserveSwap and sign with your wallet.", gdAmount, reserveContract: CONTRACTS.reserve, docs: "https://docs.gooddollar.org" };
}
