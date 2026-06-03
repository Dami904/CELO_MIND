import type { Network } from "./network.js";

export type TokenInfo = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  coingeckoId?: string;
};

// CeloMind is MAINNET-ONLY — only Celo mainnet token addresses.
export const CELO_TOKENS: Record<string, TokenInfo> = {
  CELO: {
    symbol: "CELO",
    name: "Celo",
    address: "0x471EcE3750Da237f93B8E339c536989b8978a438",
    decimals: 18,
    coingeckoId: "celo",
  },
  cUSD: {
    symbol: "cUSD",
    name: "Celo Dollar",
    address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    decimals: 18,
    coingeckoId: "celo-dollar",
  },
  cEUR: {
    symbol: "cEUR",
    name: "Celo Euro",
    address: "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73",
    decimals: 18,
    coingeckoId: "celo-euro",
  },
  cREAL: {
    symbol: "cREAL",
    name: "Celo Brazilian Real",
    address: "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787",
    decimals: 18,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xef4229c8c3250C675F21BCefa42f58EfbfF6002a",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
};

export function getTokenList(_network: Network = "celo") {
  return CELO_TOKENS;
}

export function findToken(symbolOrAddress: string, _network: Network = "celo"): TokenInfo | undefined {
  const list = CELO_TOKENS;
  const lower = symbolOrAddress.toLowerCase();
  // Try exact key match first
  const exactKey = Object.keys(list).find((k) => k.toLowerCase() === lower);
  if (exactKey) return list[exactKey];
  // Then try address match
  return Object.values(list).find((t) => t.address.toLowerCase() === lower);
}
