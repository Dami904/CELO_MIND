/**
 * Self Agent-ID — real on-chain identity check.
 *
 * Self's Agent-ID is built on EIP-8004 ("Trustless Agents"): an agent's identity is an
 * ERC-721 minted by the Identity Registry on Celo mainnet. So "does this address have a
 * Self/agent identity?" is answered by reading the registry on-chain — `balanceOf(owner)`,
 * then (if the registry is enumerable) the agent id + its agent-card URI.
 *
 * Registry (Celo mainnet, chainId 42220): 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 * Override with ERC8004_IDENTITY_REGISTRY if a different registry is used.
 */
import { marketNetwork, type Network } from "@celomind/shared";
import { getPublicClient } from "./celo-client.js";

const IDENTITY_REGISTRY = (process.env.ERC8004_IDENTITY_REGISTRY
  ?? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432") as `0x${string}`;
const SCAN_URL = "https://8004scan.io";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const REGISTRY_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenURI", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
] as const;

export async function checkSelfAgentId(address: string, _network: Network = marketNetwork()) {
  if (!ADDRESS_RE.test(address)) {
    return { error: "Provide a valid 0x wallet address to check for a Self Agent-ID." };
  }

  // Agent identities live on Celo mainnet (the ERC-8004 registry chain).
  const client = getPublicClient(marketNetwork());
  const owner = address as `0x${string}`;
  const base = {
    address,
    registry: IDENTITY_REGISTRY,
    standard: "ERC-8004 (Self Agent-ID)",
    source: "Celo RPC (on-chain)",
  };

  try {
    const balance = await client.readContract({
      address: IDENTITY_REGISTRY, abi: REGISTRY_ABI, functionName: "balanceOf", args: [owner],
    });
    const agentCount = Number(balance);

    if (agentCount === 0) {
      return {
        ...base,
        registered: false,
        message: "This address does not own an ERC-8004 / Self Agent-ID identity on Celo.",
      };
    }

    // Resolve the agent id + card if the registry is ERC-721 Enumerable (degrade gracefully otherwise).
    let agentId: string | undefined;
    let agentURI: string | undefined;
    try {
      const id = await client.readContract({
        address: IDENTITY_REGISTRY, abi: REGISTRY_ABI, functionName: "tokenOfOwnerByIndex", args: [owner, 0n],
      });
      agentId = id.toString();
      try {
        agentURI = await client.readContract({
          address: IDENTITY_REGISTRY, abi: REGISTRY_ABI, functionName: "tokenURI", args: [id],
        });
      } catch { /* tokenURI is optional */ }
    } catch { /* not enumerable — agentCount is still authoritative */ }

    return {
      ...base,
      registered: true,
      agentCount,
      agentId,
      agentURI,
      explorer: agentId ? `${SCAN_URL}/agents/celo/${agentId}` : `${SCAN_URL}/agents`,
      message: `This address owns ${agentCount} registered agent identit${agentCount === 1 ? "y" : "ies"} on Celo.`,
    };
  } catch (e) {
    return {
      ...base,
      error: `On-chain registry lookup failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
