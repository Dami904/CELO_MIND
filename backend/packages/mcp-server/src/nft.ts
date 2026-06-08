/**
 * NFT reads on Celo — ERC-721 balance/ownership and ERC-1155 balance.
 * All read-only; no private key needed.
 */
import { getPublicClient } from "./celo-client.js";
import type { Network } from "@celomind/shared";

const ERC721_ABI = [
  { name: "name",        type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol",      type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "balanceOf",   type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "ownerOf",     type: "function", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { name: "tokenURI",    type: "function", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
] as const;

const ERC1155_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "uri",       type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "string" }] },
] as const;

export async function getNftBalance(contractAddress: string, walletAddress: string, network: Network) {
  const client = getPublicClient(network);
  const addr = contractAddress as `0x${string}`;
  const wallet = walletAddress as `0x${string}`;

  const [name, symbol, balance, totalSupply] = await Promise.all([
    client.readContract({ address: addr, abi: ERC721_ABI, functionName: "name" }).catch(() => null),
    client.readContract({ address: addr, abi: ERC721_ABI, functionName: "symbol" }).catch(() => null),
    client.readContract({ address: addr, abi: ERC721_ABI, functionName: "balanceOf", args: [wallet] }).catch(() => null),
    client.readContract({ address: addr, abi: ERC721_ABI, functionName: "totalSupply" }).catch(() => null),
  ]);

  return {
    contractAddress,
    walletAddress,
    name: name as string | null,
    symbol: symbol as string | null,
    balance: balance !== null ? Number(balance as bigint) : null,
    totalSupply: totalSupply !== null ? Number(totalSupply as bigint) : null,
    explorerUrl: `https://celoscan.io/token/${contractAddress}`,
    standard: "ERC-721",
    source: "Celo on-chain",
  };
}

export async function getNftTokenInfo(contractAddress: string, tokenId: string, network: Network) {
  const client = getPublicClient(network);
  const addr = contractAddress as `0x${string}`;
  const id = BigInt(tokenId);

  const [name, symbol, owner, tokenUri] = await Promise.all([
    client.readContract({ address: addr, abi: ERC721_ABI, functionName: "name" }).catch(() => null),
    client.readContract({ address: addr, abi: ERC721_ABI, functionName: "symbol" }).catch(() => null),
    client.readContract({ address: addr, abi: ERC721_ABI, functionName: "ownerOf", args: [id] }).catch(() => null),
    client.readContract({ address: addr, abi: ERC721_ABI, functionName: "tokenURI", args: [id] }).catch(() => null),
  ]);

  return {
    contractAddress,
    tokenId,
    name: name as string | null,
    symbol: symbol as string | null,
    owner: owner as string | null,
    tokenUri: tokenUri as string | null,
    explorerUrl: `https://celoscan.io/token/${contractAddress}?a=${tokenId}`,
    standard: "ERC-721",
    source: "Celo on-chain",
  };
}

export async function getErc1155Balance(contractAddress: string, walletAddress: string, tokenId: string, network: Network) {
  const client = getPublicClient(network);
  const addr = contractAddress as `0x${string}`;
  const wallet = walletAddress as `0x${string}`;
  const id = BigInt(tokenId);

  const [balance, uri] = await Promise.all([
    client.readContract({ address: addr, abi: ERC1155_ABI, functionName: "balanceOf", args: [wallet, id] }).catch(() => null),
    client.readContract({ address: addr, abi: ERC1155_ABI, functionName: "uri", args: [id] }).catch(() => null),
  ]);

  return {
    contractAddress,
    walletAddress,
    tokenId,
    balance: balance !== null ? Number(balance as bigint) : null,
    uri: uri as string | null,
    explorerUrl: `https://celoscan.io/token/${contractAddress}`,
    standard: "ERC-1155",
    source: "Celo on-chain",
  };
}
