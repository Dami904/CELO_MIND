// CeloMind is MAINNET-ONLY. Testnets (Alfajores/Sepolia) are intentionally not supported.
export type Network = "celo";

export const NETWORKS = {
  celo: {
    name: "Celo Mainnet",
    chainId: 42220,
    rpcUrl: "https://forno.celo.org",
    // Blockscout REST host (no trailing path). Etherscan-V1-compatible API lives at `${host}/api`.
    blockscoutHost: "https://celo.blockscout.com",
    blockscoutUrl: "https://celo.blockscout.com/api",
    explorerUrl: "https://celo.blockscout.com",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    isTestnet: false,
  },
} as const;

export function getNetwork(_network: Network = "celo") {
  return NETWORKS.celo;
}

/** Mainnet-only: always resolves to "celo" regardless of input. */
export function resolveNetwork(_raw?: string | undefined): Network {
  return "celo";
}

/** Market / analytics reads (kept for call-site compatibility) — always mainnet. */
export function marketNetwork(): Network {
  return "celo";
}

/**
 * Resolve the mainnet RPC URL. Honors CELO_MAINNET_RPC_URL, then legacy CELO_RPC_URL,
 * then the built-in default.
 */
export function resolveRpcUrl(_network: Network = "celo"): string {
  return process.env.CELO_MAINNET_RPC_URL || process.env.CELO_RPC_URL || NETWORKS.celo.rpcUrl;
}
