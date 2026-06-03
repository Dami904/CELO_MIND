/**
 * Celo swaps with best-execution routing across Uniswap V3 + Mento, plus loss guards.
 *
 * Quote: ask BOTH Uniswap V3 (QuoterV2, best fee tier) and Mento (native stable AMM); the venue
 *        with the higher output wins. This alone prevents routing a stable swap through a thin
 *        Uniswap pool (the classic "swap at a loss").
 * Guard: estimate price impact (small reference quote vs the real quote). Warn above a soft limit,
 *        and REFUSE to prepare above a hard limit so a user can't sign a value-destroying swap.
 * Prepare: returns unsigned approve + swap calldata for the chosen venue — the USER'S WALLET signs.
 * Execute (agent/MCP mode only): sends the prepared txs with CELO_PRIVATE_KEY.
 */
import { encodeFunctionData, parseUnits, formatUnits, type Address } from "viem";
import { findTokenAsync, type Network } from "@celomind/shared";
import { getPublicClient, getWalletClient } from "./celo-client.js";
import { getMentoQuote, encodeMentoSwap, MENTO_BROKER, type MentoQuote } from "./mento.js";

export const UNISWAP_V3 = {
  quoterV2: "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8" as Address,
  swapRouter02: "0x5615CDAb10dc425a742d643d949a7F474C01abc4" as Address,
};
const FEE_TIERS = [500, 3000, 10000] as const;

// Loss guards (env-overridable). Price impact = how far the trade moves the price vs ~spot.
const WARN_IMPACT = Number(process.env.SWAP_WARN_PRICE_IMPACT) || 0.03; // 3% → warn
const HARD_IMPACT = Number(process.env.SWAP_MAX_PRICE_IMPACT) || 0.15; // 15% → refuse

const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export type SwapRoute = "Uniswap V3" | "Mento";

export type SwapQuote = {
  route: SwapRoute;
  fromToken: string;
  toToken: string;
  fromAddress: string;
  toAddress: string;
  fromDecimals: number;
  toDecimals: number;
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  amountOutRaw: string;
  rate: number;
  priceImpact: number; // 0–1
  priceImpactPct: string;
  feeTier?: number; // Uniswap only
  mentoProvider?: string; // Mento only
  mentoExchangeId?: string; // Mento only
  warning?: string;
  dex: string;
  source: string;
};

export type SwapError = { error: string };

export type PreparedTx = { type: "approve" | "swap"; to: string; data: string; value: string; description: string };

export type PreparedSwap = {
  quote: SwapQuote;
  slippageBps: number;
  minAmountOut: string;
  transactions: PreparedTx[];
  status: "prepared_for_review";
  warning: string;
  source: string;
};

async function quoteUniswapSingle(tokenIn: string, tokenOut: string, amountIn: bigint, fee: number, network: Network): Promise<bigint | null> {
  try {
    const client = getPublicClient(network);
    const { result } = await client.simulateContract({
      address: UNISWAP_V3.quoterV2,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: tokenIn as Address, tokenOut: tokenOut as Address, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    const out = result[0] as bigint;
    return out > 0n ? out : null;
  } catch {
    return null;
  }
}

async function bestUniswap(tokenIn: string, tokenOut: string, amountIn: bigint, network: Network): Promise<{ amountOut: bigint; fee: number } | null> {
  let best: { amountOut: bigint; fee: number } | null = null;
  for (const fee of FEE_TIERS) {
    const out = await quoteUniswapSingle(tokenIn, tokenOut, amountIn, fee, network);
    if (out && (!best || out > best.amountOut)) best = { amountOut: out, fee };
  }
  return best;
}

function normRate(amountOut: bigint, amountIn: bigint, toDec: number, fromDec: number): number {
  const out = Number(amountOut) / 10 ** toDec;
  const inn = Number(amountIn) / 10 ** fromDec;
  return inn > 0 ? out / inn : 0;
}

/** Price impact = how much worse the real rate is vs a tiny reference trade (~spot) on the same venue. */
async function priceImpact(
  route: SwapRoute,
  fromAddr: string,
  toAddr: string,
  amountIn: bigint,
  amountOut: bigint,
  fromDec: number,
  toDec: number,
  network: Network,
  uniFee?: number
): Promise<number> {
  const refIn = amountIn / 1000n;
  if (refIn <= 0n) return 0;
  let refOut: bigint | null = null;
  if (route === "Uniswap V3" && uniFee != null) refOut = await quoteUniswapSingle(fromAddr, toAddr, refIn, uniFee, network);
  else if (route === "Mento") refOut = (await getMentoQuote(fromAddr, toAddr, refIn, network))?.amountOut ?? null;
  if (!refOut || refOut <= 0n) return 0;
  const mid = normRate(refOut, refIn, toDec, fromDec);
  const exec = normRate(amountOut, amountIn, toDec, fromDec);
  return mid > 0 ? Math.max(0, (mid - exec) / mid) : 0;
}

/** Best-execution quote across Uniswap V3 + Mento, with a price-impact loss guard. */
export async function getSwapQuote(fromSym: string, toSym: string, amount: string, network: Network = "celo"): Promise<SwapQuote | SwapError> {
  const [fromTok, toTok] = await Promise.all([findTokenAsync(fromSym, network), findTokenAsync(toSym, network)]);
  if (!fromTok) return { error: `Could not resolve token "${fromSym}".` };
  if (!toTok) return { error: `Could not resolve token "${toSym}".` };
  if (fromTok.address.toLowerCase() === toTok.address.toLowerCase()) return { error: "Cannot swap a token for itself." };

  let amountIn: bigint;
  try {
    amountIn = parseUnits(amount, fromTok.decimals);
  } catch {
    return { error: `Invalid amount "${amount}".` };
  }
  if (amountIn <= 0n) return { error: "Amount must be greater than 0." };

  // Quote both venues in parallel.
  const [uni, mento] = await Promise.all([
    bestUniswap(fromTok.address, toTok.address, amountIn, network),
    getMentoQuote(fromTok.address, toTok.address, amountIn, network),
  ]);

  // Pick the venue with the higher output.
  let route: SwapRoute;
  let amountOut: bigint;
  let uniFee: number | undefined;
  let mentoQ: MentoQuote | undefined;
  if (uni && (!mento || uni.amountOut >= mento.amountOut)) {
    route = "Uniswap V3";
    amountOut = uni.amountOut;
    uniFee = uni.fee;
  } else if (mento) {
    route = "Mento";
    amountOut = mento.amountOut;
    mentoQ = mento;
  } else {
    return { error: `No swap route found for ${fromTok.symbol} → ${toTok.symbol} on Uniswap V3 or Mento.` };
  }

  const impact = await priceImpact(route, fromTok.address, toTok.address, amountIn, amountOut, fromTok.decimals, toTok.decimals, network, uniFee);
  if (impact > HARD_IMPACT) {
    return {
      error: `Refusing to quote ${fromTok.symbol} → ${toTok.symbol}: price impact ~${(impact * 100).toFixed(1)}% (limit ${(HARD_IMPACT * 100).toFixed(0)}%). Liquidity is too thin — you'd swap at a significant loss.`,
    };
  }

  const amountOutStr = formatUnits(amountOut, toTok.decimals);
  return {
    route,
    fromToken: fromTok.symbol,
    toToken: toTok.symbol,
    fromAddress: fromTok.address,
    toAddress: toTok.address,
    fromDecimals: fromTok.decimals,
    toDecimals: toTok.decimals,
    amountIn: amount,
    amountInRaw: amountIn.toString(),
    amountOut: amountOutStr,
    amountOutRaw: amountOut.toString(),
    rate: Number(amountOutStr) / Number(amount),
    priceImpact: impact,
    priceImpactPct: `${(impact * 100).toFixed(2)}%`,
    feeTier: uniFee,
    mentoProvider: mentoQ?.provider,
    mentoExchangeId: mentoQ?.exchangeId,
    warning: impact > WARN_IMPACT ? `High price impact (~${(impact * 100).toFixed(1)}%). You may receive notably less than market value — consider a smaller amount.` : undefined,
    dex: route,
    source: `${route} (Celo)`,
  };
}

/** Build unsigned approve (if needed) + swap txs for the chosen venue, for the user's wallet to sign. */
export async function prepareSwap(
  fromSym: string,
  toSym: string,
  amount: string,
  walletAddress: string,
  slippageBps = 50,
  network: Network = "celo"
): Promise<PreparedSwap | SwapError> {
  const quote = await getSwapQuote(fromSym, toSym, amount, network);
  if ("error" in quote) return quote;

  const amountInRaw = BigInt(quote.amountInRaw);
  const minOut = (BigInt(quote.amountOutRaw) * BigInt(10000 - slippageBps)) / 10000n;
  const spender = (quote.route === "Mento" ? MENTO_BROKER : UNISWAP_V3.swapRouter02) as Address;
  const transactions: PreparedTx[] = [];

  // Approval only if allowance is short.
  let needsApproval = true;
  try {
    const client = getPublicClient(network);
    const allowance = (await client.readContract({
      address: quote.fromAddress as Address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [walletAddress as Address, spender],
    })) as bigint;
    needsApproval = allowance < amountInRaw;
  } catch {
    needsApproval = true;
  }
  if (needsApproval) {
    transactions.push({
      type: "approve",
      to: quote.fromAddress,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amountInRaw] }),
      value: "0",
      description: `Approve ${quote.route} to spend ${amount} ${quote.fromToken}`,
    });
  }

  // Swap tx for the chosen venue.
  let swapTo: string;
  let swapData: string;
  if (quote.route === "Mento") {
    swapTo = MENTO_BROKER;
    swapData = encodeMentoSwap(
      { provider: quote.mentoProvider as Address, exchangeId: quote.mentoExchangeId as `0x${string}`, amountOut: BigInt(quote.amountOutRaw) },
      quote.fromAddress,
      quote.toAddress,
      amountInRaw,
      minOut
    );
  } else {
    swapTo = UNISWAP_V3.swapRouter02;
    swapData = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: quote.fromAddress as Address,
          tokenOut: quote.toAddress as Address,
          fee: quote.feeTier!,
          recipient: walletAddress as Address,
          amountIn: amountInRaw,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
  }
  transactions.push({
    type: "swap",
    to: swapTo,
    data: swapData,
    value: "0",
    description: `Swap ${amount} ${quote.fromToken} → ~${quote.amountOut} ${quote.toToken} via ${quote.route} (min ${formatUnits(minOut, quote.toDecimals)})`,
  });

  return {
    quote,
    slippageBps,
    minAmountOut: formatUnits(minOut, quote.toDecimals),
    transactions,
    status: "prepared_for_review",
    warning: quote.warning ?? "Review and sign these in your wallet. The backend never signs or executes — your wallet does.",
    source: `${quote.route} (Celo)`,
  };
}

/** Agent/MCP mode only: send the prepared txs with CELO_PRIVATE_KEY. Not used by the web dashboard. */
export async function executeSwap(
  fromSym: string,
  toSym: string,
  amount: string,
  slippageBps = 50,
  network: Network = "celo"
): Promise<{ hashes: string[]; quote: SwapQuote } | SwapError> {
  const wallet = getWalletClient(network);
  const account = wallet.account!;
  const prepared = await prepareSwap(fromSym, toSym, amount, account.address, slippageBps, network);
  if ("error" in prepared) return prepared;

  const public_ = getPublicClient(network);
  const hashes: string[] = [];
  for (const tx of prepared.transactions) {
    const hash = await wallet.sendTransaction({ account, to: tx.to as Address, data: tx.data as `0x${string}`, value: BigInt(tx.value), chain: null });
    await public_.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  return { hashes, quote: prepared.quote };
}

/** Parse "swap 3 usdt to celo" / "swap 0.5 CELO for cUSD" → { amount, fromToken, toToken }. */
export function parseSwapRequest(message: string): { amount: string; fromToken: string; toToken: string } | null {
  const m = message.match(/swap\s+([\d.]+)\s+([a-zA-Z$]+)\s+(?:to|for|into|->|=>)\s+([a-zA-Z$]+)/i);
  if (!m) return null;
  return { amount: m[1], fromToken: m[2], toToken: m[3] };
}
