import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  formatUnits,
  parseUnits,
  getContract,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getNetwork, resolveRpcUrl, type Network } from "@celomind/shared";

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export function getPublicClient(network: Network): PublicClient {
  const config = getNetwork(network);
  const rpcUrl = resolveRpcUrl(network);
  return createPublicClient({
    transport: http(rpcUrl),
    chain: {
      id: config.chainId,
      name: config.name,
      nativeCurrency: config.nativeCurrency,
      rpcUrls: { default: { http: [rpcUrl] } },
    },
  }) as PublicClient;
}

export function getWalletClient(network: Network): WalletClient {
  const pk = process.env.CELO_PRIVATE_KEY;
  if (!pk) throw new Error("CELO_PRIVATE_KEY not set — write tools require a signer");
  const account = privateKeyToAccount(pk as `0x${string}`);
  const config = getNetwork(network);
  const rpcUrl = resolveRpcUrl(network);
  return createWalletClient({
    account,
    transport: http(rpcUrl),
    chain: {
      id: config.chainId,
      name: config.name,
      nativeCurrency: config.nativeCurrency,
      rpcUrls: { default: { http: [rpcUrl] } },
    },
  });
}

export async function getNativeBalance(address: string, network: Network): Promise<{ balance: string; balanceRaw: string }> {
  const client = getPublicClient(network);
  const raw = await client.getBalance({ address: address as Address });
  return { balance: formatEther(raw), balanceRaw: raw.toString() };
}

export async function getTokenBalance(
  walletAddress: string,
  tokenAddress: string,
  network: Network
): Promise<{ balance: string; balanceRaw: string; decimals: number; symbol: string; name: string }> {
  const client = getPublicClient(network);
  const contract = getContract({ address: tokenAddress as Address, abi: ERC20_ABI, client });
  const [raw, decimals, symbol, name] = await Promise.all([
    contract.read.balanceOf([walletAddress as Address]),
    contract.read.decimals(),
    contract.read.symbol(),
    contract.read.name(),
  ]);
  return {
    balance: formatUnits(raw, decimals),
    balanceRaw: raw.toString(),
    decimals,
    symbol,
    name,
  };
}

export async function sendNative(
  to: string,
  amount: string,
  network: Network
): Promise<{ hash: Hash; from: string; to: string; amount: string }> {
  const wallet = getWalletClient(network);
  const account = wallet.account!;
  const hash = await wallet.sendTransaction({
    account,
    to: to as Address,
    value: parseEther(amount),
    chain: null,
  });
  return { hash, from: account.address, to, amount };
}

export async function sendToken(
  tokenAddress: string,
  to: string,
  amount: string,
  network: Network
): Promise<{ hash: Hash; from: string; to: string; amount: string; tokenAddress: string }> {
  const wallet = getWalletClient(network);
  const public_ = getPublicClient(network);
  const account = wallet.account!;
  const contract = getContract({ address: tokenAddress as Address, abi: ERC20_ABI, client: public_ });
  const decimals = await contract.read.decimals();
  const raw = parseUnits(amount, decimals);
  const hash = await wallet.writeContract({
    account,
    address: tokenAddress as Address,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to as Address, raw],
    chain: null,
  });
  return { hash, from: account.address, to, amount, tokenAddress };
}

export { formatEther, formatUnits, parseEther, parseUnits };
