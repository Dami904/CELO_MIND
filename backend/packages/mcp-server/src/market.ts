import { marketNetwork, cached, type Network } from "@celomind/shared";
import { getTokenBalancesV2, getAddressTxsV2, getTokenInfoV2 } from "./blockscout.js";
import { getDuneTrendingTokens } from "./dune.js";

// Public/free CoinGecko + GeckoTerminal APIs (no paid key). Base URLs may be supplied via env.
// Honors the user's existing var names: COINGECKO_API_KEY here holds the v3 BASE URL (public API),
// and COINGECKO_ONCHAIN_DATA holds the GeckoTerminal base URL.
function urlOrUndefined(v: string | undefined): string | undefined {
  return v && /^https?:\/\//.test(v) ? v.replace(/\/$/, "") : undefined;
}
const COINGECKO_BASE =
  urlOrUndefined(process.env.COINGECKO_BASE) ||
  urlOrUndefined(process.env.COINGECKO_API_KEY) ||
  "https://api.coingecko.com/api/v3";
const GECKOTERMINAL_BASE =
  urlOrUndefined(process.env.GECKOTERMINAL_BASE) ||
  urlOrUndefined(process.env.COINGECKO_ONCHAIN_DATA) ||
  "https://api.geckoterminal.com/api/v2";
const DEFILLAMA_BASE = "https://api.llama.fi";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export type Sourced<T> = { data: T; source: string };

export async function getCeloTokenPrice(coingeckoId: string): Promise<{ usd: number; usd_24h_change: number } | null> {
  try {
    return await cached(`cg:price:${coingeckoId}`, 60, async () => {
      const key = process.env.COINGECKO_API_KEY;
      const keyParam = key && key.startsWith("CG-") ? `&x_cg_demo_api_key=${key}` : "";
      const data = await fetchJson<Record<string, { usd: number; usd_24h_change: number }>>(
        `${COINGECKO_BASE}/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true${keyParam}`
      );
      return data[coingeckoId] ?? null;
    });
  } catch {
    return null;
  }
}

/**
 * Trending Celo tokens. Dune Analytics is the primary source when DUNE_QUERY_TRENDING_TOKENS is set;
 * otherwise falls back to GeckoTerminal trending pools. Always returns a source label.
 */
export async function getTrendingCeloTokens(): Promise<Sourced<unknown[]>> {
  // 1. Try Dune (aggregate DEX-volume leaderboard)
  try {
    const dune = await getDuneTrendingTokens();
    if (dune && dune.rows.length > 0) {
      return { data: dune.rows, source: "Dune Analytics" };
    }
  } catch {
    /* fall through to GeckoTerminal */
  }

  // 2. Fallback: GeckoTerminal trending pools
  try {
    const data = await cached("gt:trending:celo", 120, () =>
      fetchJson<{ data: { attributes: { name: string; symbol: string; price_usd: string; volume_usd: { h24: string }; pool_created_at: string } }[] }>(
        `${GECKOTERMINAL_BASE}/networks/celo/trending_pools?page=1`
      )
    );
    const tokens = data.data.map((p) => ({
      name: p.attributes.name,
      symbol: p.attributes.symbol,
      priceUsd: p.attributes.price_usd,
      volume24h: p.attributes.volume_usd?.h24,
      poolCreatedAt: p.attributes.pool_created_at,
    }));
    return { data: tokens, source: "GeckoTerminal" };
  } catch {
    return { data: [], source: "unavailable" };
  }
}

export async function getRecentlyLaunchedCeloTokens(): Promise<Sourced<unknown[]>> {
  try {
    const data = await cached("gt:new:celo", 120, () =>
      fetchJson<{ data: { attributes: { name: string; symbol: string; price_usd: string; pool_created_at: string } }[] }>(
        `${GECKOTERMINAL_BASE}/networks/celo/new_pools?page=1`
      )
    );
    const tokens = data.data.slice(0, 20).map((p) => ({
      name: p.attributes.name,
      symbol: p.attributes.symbol,
      priceUsd: p.attributes.price_usd,
      poolCreatedAt: p.attributes.pool_created_at,
    }));
    return { data: tokens, source: "GeckoTerminal" };
  } catch {
    return { data: [], source: "unavailable" };
  }
}

/**
 * Token info. Blockscout v2 is primary (USD price, holders, market cap); GeckoTerminal is the
 * fallback for DEX-only tokens. Defaults to mainnet (hybrid) unless a network is given.
 */
export async function getCeloTokenInfo(address: string, network: Network = marketNetwork()): Promise<Sourced<unknown> | null> {
  const v2 = await getTokenInfoV2(address, network);
  if (v2) return { data: v2, source: "Blockscout" };
  try {
    const data = await fetchJson<{ data: { attributes: unknown } }>(
      `${GECKOTERMINAL_BASE}/networks/celo/tokens/${address}`
    );
    return data.data?.attributes ? { data: data.data.attributes, source: "GeckoTerminal" } : null;
  } catch {
    return null;
  }
}

/**
 * Wallet token portfolio with real balances + USD values, via Blockscout REST v2.
 * Replaces the previous tx-history approximation that relied on the deprecated Celoscan V1 API.
 */
export async function getCeloWalletPortfolio(address: string, network: Network = marketNetwork()): Promise<Sourced<unknown[]>> {
  try {
    const balances = await getTokenBalancesV2(address, network);
    return { data: balances, source: "Blockscout" };
  } catch {
    return { data: [], source: "unavailable" };
  }
}

export async function getCeloRecentTransactions(address: string, network: Network): Promise<Sourced<unknown[]>> {
  try {
    const txs = await getAddressTxsV2(address, network, 10);
    return { data: txs, source: "Blockscout" };
  } catch {
    return { data: [], source: "unavailable" };
  }
}

export async function getCeloTVL(): Promise<{ tvl: number; change_1d: number } | null> {
  try {
    return await cached("llama:celo:tvl", 300, async () => {
      const data = await fetchJson<{ name: string; tvl: number; change_1d: number }[]>(`${DEFILLAMA_BASE}/v2/chains`);
      if (Array.isArray(data)) {
        const celo = data.find((c) => c.name === "Celo");
        return celo ? { tvl: celo.tvl, change_1d: celo.change_1d } : null;
      }
      return null;
    });
  } catch {
    return null;
  }
}
