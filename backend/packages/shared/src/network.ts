export type Network = "alfajores" | "celo" | "sepolia";

export const NETWORKS = {
  alfajores: {
    name: "Celo Alfajores Testnet",
    chainId: 44787,
    rpcUrl: "https://alfajores-forno.celo-testnet.org",
    // Blockscout REST host (no trailing path). Etherscan-V1-compatible API lives at `${host}/api`.
    blockscoutHost: "https://celo-alfajores.blockscout.com",
    blockscoutUrl: "https://celo-alfajores.blockscout.com/api",
    explorerUrl: "https://celo-alfajores.blockscout.com",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    isTestnet: true,
  },
  sepolia: {
    name: "Celo Sepolia Testnet",
    chainId: 11142220,
    rpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
    blockscoutHost: "https://celo-sepolia.blockscout.com",
    blockscoutUrl: "https://celo-sepolia.blockscout.com/api",
    explorerUrl: "https://celo-sepolia.blockscout.com",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    isTestnet: true,
  },
  celo: {
    name: "Celo Mainnet",
    chainId: 42220,
    rpcUrl: "https://forno.celo.org",
    blockscoutHost: "https://celo.blockscout.com",
    blockscoutUrl: "https://celo.blockscout.com/api",
    explorerUrl: "https://celo.blockscout.com",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    isTestnet: false,
  },
} as const;

export function getNetwork(network: Network) {
  return NETWORKS[network];
}

/**
 * Parse whatever string is in CELO_NETWORK env to a valid Network key.
 * Handles "Celo Sepolia Testnet", "sepolia", "alfajores", "celo", etc.
 */
export function resolveNetwork(raw: string | undefined): Network {
  if (!raw) return "alfajores";
  const lower = raw.toLowerCase();
  if (lower.includes("sepolia")) return "sepolia";
  if (lower.includes("mainnet") || lower === "celo") return "celo";
  return "alfajores"; // default testnet
}

/**
 * Hybrid routing: market / price / whale / analytics reads always resolve on a network that
 * actually has data. Testnets have almost no market data, so these default to mainnet ("celo")
 * unless MARKET_NETWORK explicitly overrides it.
 */
export function marketNetwork(): Network {
  const override = process.env.MARKET_NETWORK;
  if (override) return resolveNetwork(override);
  return "celo";
}

/**
 * Resolve the RPC URL for a network, honoring the env vars that actually exist in .env
 * (CELO_MAINNET_RPC_URL / CELO_TESTNET_RPC_URL). Falls back to legacy CELO_RPC_URL, then the
 * built-in default. Fixes the prior mismatch where code only read CELO_RPC_URL.
 */
export function resolveRpcUrl(network: Network): string {
  const isMainnet = network === "celo";
  const fromEnv = isMainnet
    ? process.env.CELO_MAINNET_RPC_URL
    : process.env.CELO_TESTNET_RPC_URL;
  return fromEnv || process.env.CELO_RPC_URL || NETWORKS[network].rpcUrl;
}
