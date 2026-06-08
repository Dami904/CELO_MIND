/**
 * ENS name resolution for Celo wallets.
 * ENS lives on Ethereum mainnet — we query it with a lightweight ETH client,
 * preferring the Celo coin type (42220) and falling back to ETH (60).
 */
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const CELO_COIN_TYPE = 42220n;

function getEthClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http("https://ethereum.publicnode.com"),
  });
}

export async function resolveEnsName(name: string) {
  if (!name.includes(".")) return { name, resolved: false, error: "Not a valid ENS name (must contain a dot)" };
  const client = getEthClient();

  try {
    const celoAddress = await client.getEnsAddress({ name, coinType: CELO_COIN_TYPE });
    if (celoAddress) {
      return { name, address: celoAddress, coinType: "Celo (42220)", resolved: true };
    }
  } catch {}

  try {
    const ethAddress = await client.getEnsAddress({ name });
    if (ethAddress) {
      return {
        name,
        address: ethAddress,
        coinType: "Ethereum (60)",
        resolved: true,
        note: "No Celo address set for this name — showing Ethereum address",
      };
    }
  } catch {}

  return { name, resolved: false, error: "Name not found or no address registered" };
}

export async function reverseEnsLookup(address: string) {
  const client = getEthClient();
  try {
    const name = await client.getEnsName({ address: address as `0x${string}` });
    if (name) return { address, name, resolved: true };
    return { address, resolved: false, error: "No ENS name associated with this address" };
  } catch (e) {
    return { address, resolved: false, error: String(e) };
  }
}
