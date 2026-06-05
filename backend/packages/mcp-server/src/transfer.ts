/**
 * Native CELO + ERC-20 transfers — prepared (unsigned) txs for the user's wallet to sign.
 * "send 5 cUSD to 0x…" → a signable transaction. The backend never holds the key (dashboard mode).
 */
import { encodeFunctionData, parseEther, parseUnits, type Address } from "viem";
import { CeloTransferParamsSchema, findTokenAsync, type Network } from "@celomind/shared";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const ERC20_TRANSFER_ABI = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export type PreparedTransfer = {
  type: "transfer";
  token: string;
  tokenAddress: string;
  to: string;
  amount: string;
  isNative: boolean;
  transaction: { to: string; data: string; value: string };
  status: "prepared_for_review";
  warning: string;
  source: string;
};

export type TransferError = { error: string };

export async function prepareTransfer(
  toAddress: string,
  amount: string,
  tokenSymbolOrAddress: string,
  network: Network = "celo"
): Promise<PreparedTransfer | TransferError> {
  const parsed = CeloTransferParamsSchema.safeParse({ to: toAddress, amount, tokenSymbolOrAddress, network });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid transfer request." };
  const transfer = parsed.data;
  if (!ADDRESS_RE.test(transfer.to)) return { error: "Invalid recipient address (must be 0x + 40 hex)." };

  const base = {
    to: transfer.to,
    amount: transfer.amount,
    status: "prepared_for_review" as const,
    warning: "Review and sign this in your wallet. The backend does not move funds.",
    source: "Celo RPC",
  };

  // Native CELO transfer
  if (transfer.tokenSymbolOrAddress === "CELO") {
    let value: bigint;
    try { value = parseEther(transfer.amount); } catch { return { error: `Invalid amount "${transfer.amount}".` }; }
    if (value <= 0n) return { error: "Amount must be greater than 0." };
    return { type: "transfer", token: "CELO", tokenAddress: "native", isNative: true, transaction: { to: transfer.to, data: "0x", value: value.toString() }, ...base };
  }

  // ERC-20 transfer
  const token = await findTokenAsync(transfer.tokenSymbolOrAddress, transfer.network);
  if (!token) return { error: `Unknown token "${transfer.tokenSymbolOrAddress}".` };
  let raw: bigint;
  try { raw = parseUnits(transfer.amount, token.decimals); } catch { return { error: `Invalid amount "${transfer.amount}".` }; }
  if (raw <= 0n) return { error: "Amount must be greater than 0." };
  const data = encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: "transfer", args: [transfer.to as Address, raw] });
  return { type: "transfer", token: token.symbol, tokenAddress: token.address, isNative: false, transaction: { to: token.address, data, value: "0" }, ...base };
}

/** Parse "send 5 cUSD to 0x…" / "transfer 0.2 CELO to 0x…" → { amount, token, to }. */
export function parseSendRequest(message: string): { amount: string; token: string; to: string } | null {
  const m = message.match(/(?:send|transfer)\s+([\d.]+)\s+([a-zA-Z$]+)\s+(?:to|->)\s+(0x[0-9a-fA-F]{40})/i);
  if (!m) return null;
  return { amount: m[1], token: m[2], to: m[3] };
}
