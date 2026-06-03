export type TokenInfo = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  coingeckoId?: string;
};

export const ALFAJORES_TOKENS: Record<string, TokenInfo> = {
  CELO: {
    symbol: "CELO",
    name: "Celo",
    address: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
    decimals: 18,
    coingeckoId: "celo",
  },
  cUSD: {
    symbol: "cUSD",
    name: "Celo Dollar",
    address: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
    decimals: 18,
    coingeckoId: "celo-dollar",
  },
  cEUR: {
    symbol: "cEUR",
    name: "Celo Euro",
    address: "0x10c892A6EC43a53E45D0B916B4b7D383B1b78d0F",
    decimals: 18,
    coingeckoId: "celo-euro",
  },
  cREAL: {
    symbol: "cREAL",
    name: "Celo Brazilian Real",
    address: "0xE4D517785D091D3c54818832dB6094bcc2744545",
    decimals: 18,
  },
};

export const MAINNET_TOKENS: Record<string, TokenInfo> = {
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

export function getTokenList(network: "alfajores" | "celo" | "sepolia") {
  return network === "celo" ? MAINNET_TOKENS : ALFAJORES_TOKENS;
}

export function findToken(symbolOrAddress: string, network: "alfajores" | "celo" | "sepolia"): TokenInfo | undefined {
  const net = network === "sepolia" ? "alfajores" : network;
  const list = getTokenList(net);
  const lower = symbolOrAddress.toLowerCase();
  // Try exact key match first
  const exactKey = Object.keys(list).find((k) => k.toLowerCase() === lower);
  if (exactKey) return list[exactKey];
  // Then try address match
  return Object.values(list).find((t) => t.address.toLowerCase() === lower);
}
