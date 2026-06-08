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

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x471ece3750da237f93b8e339c536989b8978a438": { symbol: "CELO",  decimals: 18 },
  "0x765de816845861e75a25fca122bb6898b8b1282a": { symbol: "cUSD",  decimals: 18 },
  "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73": { symbol: "cEUR",  decimals: 18 },
  "0xe8537a3d056da446677b9e9d6c5db704eaab4787": { symbol: "cREAL", decimals: 18 },
  "0xceba9300f2b948710d2653dd7b07f33a8b32118c": { symbol: "USDC",  decimals: 6  },
  "0x48421ff1c6b93988138130865c4b7e2f76e5b3f5": { symbol: "USDT",  decimals: 6  },
  "0x2f25deb3848c207fc8e0c34035b3ba7fc157602b": { symbol: "WBTC",  decimals: 8  },
};

/** Current live rates for every active Mento exchange pair. */
export async function getMentoRates(network: Network): Promise<Record<string, unknown>> {
  return cached(`mento:rates:${network}`, 60, async () => {
    const [exchanges, client] = await Promise.all([getMentoExchanges(network), Promise.resolve(getPublicClient(network))]);

    const rates = (await Promise.all(
      exchanges.map(async (ex) => {
        const [a0, a1] = ex.assets;
        const tok0 = KNOWN_TOKENS[a0] ?? { symbol: a0.slice(2, 8), decimals: 18 };
        const tok1 = KNOWN_TOKENS[a1] ?? { symbol: a1.slice(2, 8), decimals: 18 };
        const amountIn = 10n ** BigInt(tok0.decimals);
        try {
          const amountOut = (await client.readContract({
            address: MENTO_BROKER, abi: BROKER_ABI, functionName: "getAmountOut",
            args: [ex.provider, ex.exchangeId, a0 as Address, a1 as Address, amountIn],
          })) as bigint;
          const rate = Number(amountOut) / 10 ** tok1.decimals;
          return { pair: `${tok0.symbol}/${tok1.symbol}`, rate: rate.toFixed(6), description: `1 ${tok0.symbol} = ${rate.toFixed(4)} ${tok1.symbol}` };
        } catch {
          return null;
        }
      })
    )).filter(Boolean);

    return {
      rates,
      source: "Mento Broker (on-chain)",
      brokerAddress: MENTO_BROKER,
      note: "Rates are live 1-unit on-chain quotes and include Mento spread.",
    };
  });
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
