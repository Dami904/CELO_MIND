import { marketNetwork, cached, type Network } from "@celomind/shared";
import {
  getTokenBalancesV2, getAddressTxsV2, getTokenInfoV2,
  getTokenHoldersV2, getAddressNFTsV2, getNetworkStatsV2,
  getAddressStatsV2, searchTokensV2,
} from "./blockscout.js";
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

/** Top Celo ERC-20 tokens ranked by on-chain holder count (Blockscout). */
export async function getCeloTopTokensByHolders(): Promise<Sourced<unknown[]>> {
  try {
    const BLOCKSCOUT = "https://celo.blockscout.com/api/v2";
    // Blockscout doesn't support server-side holder sort; fetch first 50 and rank client-side.
    const data = await cached("blockscout:tokens:holders", 180, () =>
      fetchJson<{ items: { name: string; symbol: string; address_hash: string; holders_count: string; circulating_market_cap: string; exchange_rate: string }[] }>(
        `${BLOCKSCOUT}/tokens?type=ERC-20`
      )
    );
    const tokens = (data.items ?? [])
      .map((t) => ({
        name: t.name,
        symbol: t.symbol,
        address: t.address_hash,
        holders: Number(t.holders_count ?? 0),
        priceUsd: t.exchange_rate,
        circulatingMarketCapUsd: t.circulating_market_cap,
      }))
      .sort((a, b) => b.holders - a.holders)
      .slice(0, 20);
    return { data: tokens, source: "Blockscout" };
  } catch {
    return { data: [], source: "unavailable" };
  }
}

/** Top Celo ecosystem tokens ranked by market cap (CoinGecko). */
export async function getCeloTopTokensByMarketCap(): Promise<Sourced<unknown[]>> {
  try {
    const data = await cached("coingecko:celo:marketcap", 300, () =>
      fetchJson<{ id: string; symbol: string; name: string; market_cap: number; current_price: number; price_change_percentage_24h: number; total_volume: number }[]>(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&category=celo-ecosystem&order=market_cap_desc&per_page=20&page=1`
      )
    );
    const tokens = (Array.isArray(data) ? data : []).map((t) => ({
      name: t.name,
      symbol: t.symbol.toUpperCase(),
      marketCapUsd: t.market_cap,
      priceUsd: t.current_price,
      priceChange24h: t.price_change_percentage_24h,
      volume24h: t.total_volume,
    }));
    return { data: tokens, source: "CoinGecko" };
  } catch {
    return { data: [], source: "unavailable" };
  }
}

// ─── 10 new live-data functions ───────────────────────────────────────────────

const CELO_RPC_URL = process.env.CELO_MAINNET_RPC_URL ?? process.env.CELO_RPC_URL ?? "https://forno.celo.org";

/** Current Celo network gas price via JSON-RPC eth_gasPrice. */
export async function getCeloGasPrice(): Promise<{ gasPriceGwei: string; gasPriceWei: string } | null> {
  try {
    const res = await fetch(CELO_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { result?: string };
    const weiHex = data.result;
    if (!weiHex) return null;
    const wei = BigInt(weiHex);
    return { gasPriceGwei: (Number(wei) / 1e9).toFixed(6), gasPriceWei: wei.toString() };
  } catch { return null; }
}

/** Top DeFi protocols deployed on Celo ranked by TVL (DefiLlama). */
export async function getCeloDefiProtocols(): Promise<Sourced<unknown[]>> {
  try {
    const data = await cached("llama:celo:protocols", 600, () =>
      fetchJson<{ name: string; tvl: number; chains: string[]; category: string; url: string }[]>(
        `${DEFILLAMA_BASE}/protocols`
      )
    );
    const protocols = (Array.isArray(data) ? data : [])
      .filter((p) => Array.isArray(p.chains) && p.chains.some((c) => c.toLowerCase() === "celo") && p.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 20)
      .map((p) => ({ name: p.name, tvlUsd: p.tvl, category: p.category, url: p.url }));
    return { data: protocols, source: "DefiLlama" };
  } catch { return { data: [], source: "unavailable" }; }
}

/** Celo network-level stats: block count, address count, daily txs, avg block time (Blockscout). */
export async function getCeloNetworkStats(): Promise<Sourced<unknown | null>> {
  try {
    const stats = await getNetworkStatsV2(marketNetwork());
    return { data: stats, source: "Blockscout" };
  } catch { return { data: null, source: "unavailable" }; }
}

/** Historical price data for a CoinGecko token (sampled to ~10 data points). */
export async function getCeloPriceHistory(coingeckoId: string, days: number): Promise<Sourced<unknown[]>> {
  try {
    const keyParam = (() => {
      const k = process.env.COINGECKO_API_KEY;
      return k && k.startsWith("CG-") ? `&x_cg_demo_api_key=${k}` : "";
    })();
    const data = await cached(`cg:history:${coingeckoId}:${days}`, 1800, () =>
      fetchJson<{ prices: [number, number][] }>(
        `${COINGECKO_BASE}/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}${keyParam}`
      )
    );
    const prices = data.prices ?? [];
    const step = Math.max(1, Math.floor(prices.length / 10));
    const sampled = prices
      .filter((_, i) => i % step === 0)
      .map(([ts, price]) => ({ date: new Date(ts).toISOString().split("T")[0], priceUsd: price.toFixed(4) }));
    return { data: sampled, source: "CoinGecko" };
  } catch { return { data: [], source: "unavailable" }; }
}

/** Top DEX liquidity pools on Celo by reserve (GeckoTerminal). */
export async function getCeloTopPools(): Promise<Sourced<unknown[]>> {
  try {
    const data = await cached("gt:pools:celo", 180, () =>
      fetchJson<{
        data: {
          attributes: {
            name: string;
            reserve_in_usd: string;
            volume_usd: { h24: string };
            fee_tier: string | null;
            base_token_price_usd: string;
          };
        }[];
      }>(`${GECKOTERMINAL_BASE}/networks/celo/pools?page=1`)
    );
    const pools = (data.data ?? []).slice(0, 15).map((p) => ({
      name: p.attributes.name,
      reserveUsd: p.attributes.reserve_in_usd,
      volume24hUsd: p.attributes.volume_usd?.h24,
      feeTier: p.attributes.fee_tier,
    }));
    return { data: pools, source: "GeckoTerminal" };
  } catch { return { data: [], source: "unavailable" }; }
}

/** Search Celo ERC-20 tokens by name or symbol (Blockscout). */
export async function searchCeloTokens(query: string): Promise<Sourced<unknown[]>> {
  try {
    const results = await searchTokensV2(query, marketNetwork(), 10);
    return { data: results, source: "Blockscout" };
  } catch { return { data: [], source: "unavailable" }; }
}

/** Top holders of a specific ERC-20 token by on-chain balance (Blockscout). */
export async function getCeloTokenHolders(tokenAddress: string): Promise<Sourced<unknown[]>> {
  try {
    const holders = await getTokenHoldersV2(tokenAddress, marketNetwork(), 20);
    return { data: holders, source: "Blockscout" };
  } catch { return { data: [], source: "unavailable" }; }
}

/** Wallet stats: transaction count, token transfer count, native balance (Blockscout). */
export async function getCeloWalletStats(address: string): Promise<Sourced<unknown | null>> {
  try {
    const stats = await getAddressStatsV2(address, marketNetwork());
    return { data: stats, source: "Blockscout" };
  } catch { return { data: null, source: "unavailable" }; }
}

/** ERC-721 and ERC-1155 NFT balances for a wallet (Blockscout). */
export async function getCeloNFTBalances(address: string): Promise<Sourced<unknown[]>> {
  try {
    const nfts = await getAddressNFTsV2(address, marketNetwork(), 20);
    return { data: nfts, source: "Blockscout" };
  } catch { return { data: [], source: "unavailable" }; }
}

/** Yield / APY opportunities on Celo across DeFi protocols (DefiLlama Yields). */
export async function getCeloYieldOpportunities(): Promise<Sourced<unknown[]>> {
  try {
    const data = await cached("llama:celo:yields", 900, () =>
      fetchJson<{
        data: {
          pool: string; project: string; chain: string; symbol: string;
          apy: number; tvlUsd: number; apyBase: number | null; apyReward: number | null;
        }[];
      }>("https://yields.llama.fi/pools")
    );
    const yields = (data.data ?? [])
      .filter((p) => p.chain?.toLowerCase() === "celo" && p.apy > 0 && p.tvlUsd > 1000)
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 15)
      .map((p) => ({
        project: p.project,
        symbol: p.symbol,
        apy: `${p.apy.toFixed(2)}%`,
        apyBase: p.apyBase != null ? `${p.apyBase.toFixed(2)}%` : null,
        apyReward: p.apyReward != null ? `${p.apyReward.toFixed(2)}%` : null,
        tvlUsd: p.tvlUsd,
      }));
    return { data: yields, source: "DefiLlama Yields" };
  } catch { return { data: [], source: "unavailable" }; }
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
