/**
 * x402 — prepare a real, signable payment transaction.
 *
 * x402 is "HTTP 402 + on-chain payment": a server answers a request with HTTP 402 and a JSON
 * body describing how to pay (recipient, asset, amount, network). The client then signs a
 * stablecoin transfer and retries with proof.
 *
 * This builds the on-chain leg — an ERC-20 `transfer(payTo, amount)` the user's wallet signs.
 * The recipient/amount come from either explicit args (payTo + amount + currency) or by probing
 * the endpoint for its 402 payment requirements. Nothing is broadcast here; it's returned for review.
 */
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { findToken, marketNetwork, type Network } from "@celomind/shared";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ERC20_TRANSFER_ABI = [
  { type: "function", name: "transfer", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export type X402Args = { endpoint?: string; amount?: string; currency?: string; payTo?: string };

type X402Accept = { network?: string; payTo?: string; asset?: string; maxAmountRequired?: string };

export async function prepareX402Payment(args: X402Args, network: Network = marketNetwork()) {
  const endpoint = args.endpoint;
  let payTo = args.payTo;
  let currency = args.currency ?? "cUSD";
  let humanAmount = args.amount;
  let atomicAmount: bigint | undefined;
  let assetAddr: string | undefined;
  let discoveredVia = "args";

  // 1. If the recipient/amount weren't given, probe the endpoint for an HTTP 402.
  if ((!payTo || !humanAmount) && endpoint && /^https?:\/\//i.test(endpoint)) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (res.status === 402) {
        const body = (await res.json().catch(() => null)) as { accepts?: X402Accept[] } | null;
        const accepts = body?.accepts ?? [];
        const pick = accepts.find((a) => /celo/i.test(a.network ?? "")) ?? accepts[0];
        if (pick?.payTo) {
          payTo = pick.payTo;
          assetAddr = pick.asset;
          if (pick.maxAmountRequired) atomicAmount = BigInt(pick.maxAmountRequired);
          discoveredVia = "endpoint-402";
        }
      }
    } catch { /* unreachable or not x402 — fall through to explicit args */ }
  }

  if (!payTo || !ADDRESS_RE.test(payTo)) {
    return {
      protocol: "x402",
      endpoint: endpoint ?? null,
      note: "To prepare an x402 payment I need the recipient. Pass `payTo` (0x address) with `amount` + `currency`, or give an x402-enabled endpoint that returns HTTP 402 with payment requirements.",
      docs: "https://x402.org",
    };
  }

  // 2. Resolve the asset (curated token, or a raw address from the 402 response) + atomic amount.
  const token = findToken(assetAddr ?? currency, network);
  const tokenAddress = token?.address ?? assetAddr;
  if (token) currency = token.symbol;
  if (!tokenAddress) {
    return { protocol: "x402", endpoint: endpoint ?? null, error: `Could not resolve the payment asset (${assetAddr ?? currency}).` };
  }

  if (atomicAmount == null) {
    if (!humanAmount) return { protocol: "x402", endpoint: endpoint ?? null, note: "Specify the payment `amount`." };
    if (!token) return { protocol: "x402", endpoint: endpoint ?? null, error: `Unknown currency "${currency}" — pass a known token or the asset address.` };
    try { atomicAmount = parseUnits(humanAmount, token.decimals); } catch { return { protocol: "x402", error: `Invalid amount "${humanAmount}".` }; }
  } else if (token && !humanAmount) {
    humanAmount = formatUnits(atomicAmount, token.decimals); // pretty-print the discovered atomic amount
  }
  if (atomicAmount <= 0n) return { protocol: "x402", error: "Payment amount must be greater than 0." };

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI, functionName: "transfer", args: [payTo as `0x${string}`, atomicAmount],
  });

  return {
    protocol: "x402",
    endpoint: endpoint ?? null,
    discoveredVia,
    network,
    payTo,
    currency,
    asset: tokenAddress,
    amount: humanAmount ?? atomicAmount.toString(),
    amountAtomic: atomicAmount.toString(),
    transaction: { to: tokenAddress, data, value: "0" },
    status: "prepared_for_review" as const,
    requires_confirmation: true,
    warning: "Review the recipient and amount carefully before signing — x402 payments are irreversible.",
    source: "x402 (on-chain ERC-20 transfer)",
  };
}
