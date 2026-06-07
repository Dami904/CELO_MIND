/**
 * Mento protocol (Celo's native stable AMM) — quotes + swap calldata.
 *
 * Mento is the right venue for stable pairs (cUSD↔cEUR↔USDC↔USDT, CELO↔stables) where Uniswap V3
 * has thin liquidity. We quote via the Broker and build approve + swapIn calldata for signing.
 *
 * Flow: Broker.getExchangeProviders() → each BiPoolManager.getExchanges() → match the pair's
 * exchangeId → Broker.getAmountOut(provider, exchangeId, tokenIn, tokenOut, amountIn).
 */
import { encodeFunctionData, type Address } from "viem";
import { cached, type Network } from "@celomind/shared";
import { getPublicClient } from "./celo-client.js";

export const MENTO_BROKER = "0x777A8255cA72412f0d706dc03C9D1987306B4CaD" as Address;

const BROKER_ABI = [
  { type: "function", name: "getExchangeProviders", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  {
    type: "function",
    name: "getAmountOut",
    stateMutability: "view",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "swapIn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const BIPOOL_ABI = [
  {
    type: "function",
    name: "getExchanges",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "exchangeId", type: "bytes32" },
          { name: "assets", type: "address[]" },
        ],
      },
    ],
  },
] as const;

type MentoExchange = { provider: Address; exchangeId: `0x${string}`; assets: string[] };

/** All Mento exchanges (provider + exchangeId + assets), cached 1h — the list is near-static. */
async function getMentoExchanges(network: Network): Promise<MentoExchange[]> {
  return cached(`mento:exchanges:${network}`, 300, async () => {
    const client = getPublicClient(network);
    const providers = (await client.readContract({
      address: MENTO_BROKER,
      abi: BROKER_ABI,
      functionName: "getExchangeProviders",
    })) as Address[];

    const out: MentoExchange[] = [];
    for (const provider of providers) {
      try {
        const exchanges = (await client.readContract({
          address: provider,
          abi: BIPOOL_ABI,
          functionName: "getExchanges",
        })) as { exchangeId: `0x${string}`; assets: Address[] }[];
        for (const ex of exchanges) {
          out.push({ provider, exchangeId: ex.exchangeId, assets: ex.assets.map((a) => a.toLowerCase()) });
        }
      } catch {
        // provider doesn't expose getExchanges — skip
      }
    }
    return out;
  });
}

export type MentoQuote = { amountOut: bigint; provider: Address; exchangeId: `0x${string}` };

/** Quote tokenIn→tokenOut on Mento. Returns null if no Mento exchange covers the pair. */
export async function getMentoQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  network: Network
): Promise<MentoQuote | null> {
  const exchanges = await getMentoExchanges(network);
  const a = tokenIn.toLowerCase();
  const b = tokenOut.toLowerCase();
  const match = exchanges.find((e) => e.assets.includes(a) && e.assets.includes(b));
  if (!match) return null;

  try {
    const client = getPublicClient(network);
    const amountOut = (await client.readContract({
      address: MENTO_BROKER,
      abi: BROKER_ABI,
      functionName: "getAmountOut",
      args: [match.provider, match.exchangeId, tokenIn as Address, tokenOut as Address, amountIn],
    })) as bigint;
    if (amountOut <= 0n) return null;
    return { amountOut, provider: match.provider, exchangeId: match.exchangeId };
  } catch {
    return null;
  }
}

/** Build the Mento swapIn calldata (approval is handled by the caller). */
export function encodeMentoSwap(
  q: MentoQuote,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  amountOutMin: bigint
): string {
  return encodeFunctionData({
    abi: BROKER_ABI,
    functionName: "swapIn",
    args: [q.provider, q.exchangeId, tokenIn as Address, tokenOut as Address, amountIn, amountOutMin],
  });
}
