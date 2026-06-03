import { getNetwork, type Network } from "./network.js";
import { cached } from "./cache.js";

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
    // Native Circle USDC on Celo (the widely-held one). NOT the old bridged 0xef42…6002a.
    symbol: "USDC",
    name: "USD Coin",
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    coingeckoId: "tether",
  },
  WBTC: {
    // Bridged WBTC on Celo uses 18 decimals (verified on Blockscout).
    symbol: "WBTC",
    name: "Wrapped BTC",
    address: "0xD629eb00dEced2a080B7EC630eF6aC117e614f1b",
    decimals: 18,
    coingeckoId: "wrapped-bitcoin",
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

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type RawBsToken = {
  symbol?: string | null;
  name?: string | null;
  address?: string | null;
  address_hash?: string | null;
  decimals?: string | null;
  holders_count?: string | null;
  holders?: string | null;
};

function bsKeyParam(): string {
  const key = process.env.BLOCKSCOUT_API_KEY;
  return key ? `&apikey=${key}` : "";
}

function toTokenInfo(t: RawBsToken, fallbackAddr?: string): TokenInfo | undefined {
  const address = t.address_hash ?? t.address ?? fallbackAddr;
  if (!t.symbol || t.decimals == null || !address) return undefined;
  return { symbol: t.symbol, name: t.name ?? t.symbol, address, decimals: Number(t.decimals) };
}

/**
 * Resolve a token by symbol or address. Tries the curated CELO_TOKENS list first (sync, no network);
 * if not found, falls back to Blockscout's token search. For a symbol it picks the legit match —
 * exact symbol (case-insensitive) with the most holders — to avoid scam/airdrop look-alikes. Results
 * are cached for an hour. Returns undefined if nothing credible is found.
 */
export async function findTokenAsync(symbolOrAddress: string, network: Network = "celo"): Promise<TokenInfo | undefined> {
  const curated = findToken(symbolOrAddress, network);
  if (curated) return curated;

  const host = getNetwork(network).blockscoutHost;
  const input = symbolOrAddress.trim();

  // Direct address lookup
  if (ADDRESS_RE.test(input)) {
    return cached(`token:addr:${network}:${input.toLowerCase()}`, 3600, async () => {
      try {
        const res = await fetch(`${host}/api/v2/tokens/${input}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return undefined;
        return toTokenInfo((await res.json()) as RawBsToken, input);
      } catch {
        return undefined;
      }
    });
  }

  // Symbol search — exact symbol match, most holders wins (filters out scam look-alikes)
  return cached(`token:sym:${network}:${input.toLowerCase()}`, 3600, async () => {
    try {
      const res = await fetch(`${host}/api/v2/tokens?q=${encodeURIComponent(input)}${bsKeyParam()}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { items?: RawBsToken[] };
      const wanted = input.toLowerCase();
      const best = (data.items ?? [])
        .filter((t) => t.symbol && t.decimals != null && t.symbol.toLowerCase() === wanted)
        .sort((a, b) => Number(b.holders_count ?? b.holders ?? 0) - Number(a.holders_count ?? a.holders ?? 0))[0];
      return best ? toTokenInfo(best) : undefined;
    } catch {
      return undefined;
    }
  });
}
