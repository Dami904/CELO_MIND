import type { FastifyInstance } from "fastify";
import { makeOk, makeErr, resolveNetwork, cached } from "@celomind/shared";
import { getCeloGasPrice } from "@celomind/mcp-server/market";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);

type GTPool = {
  attributes: {
    name: string; symbol?: string; price_usd: string;
    base_token_price_usd: string; reserve_in_usd: string;
    volume_usd: { h24: string; h1?: string };
    price_change_percentage: { h24?: string; h1?: string };
    pool_created_at: string;
  };
};

async function fetchJson<T>(url: string, ttl: number, key: string): Promise<T> {
  return cached(key, ttl, () =>
    fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<T>;
    })
  );
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/metrics", async (_req, reply) => {
    try {
      const [celoRes, tvlRes, trendingRes, newPoolsRes, allPoolsRes, hacksRes, gasRes] = await Promise.allSettled([
        fetchJson<Record<string, { usd: number; usd_24h_change: number }>>(
          "https://api.coingecko.com/api/v3/simple/price?ids=celo&vs_currencies=usd&include_24hr_change=true",
          60, "dash:celo:price"
        ),
        fetchJson<{ name: string; tvl: number; change_1d: number }[]>(
          "https://api.llama.fi/v2/chains", 300, "dash:llama:chains"
        ),
        fetchJson<{ data: GTPool[] }>(
          "https://api.geckoterminal.com/api/v2/networks/celo/trending_pools?page=1", 120, "dash:gt:trending"
        ),
        fetchJson<{ data: GTPool[] }>(
          "https://api.geckoterminal.com/api/v2/networks/celo/new_pools?page=1", 120, "dash:gt:new"
        ),
        fetchJson<{ data: GTPool[] }>(
          "https://api.geckoterminal.com/api/v2/networks/celo/pools?page=1", 180, "dash:gt:pools"
        ),
        fetchJson<{ name: string; date: number; amount: number; chains: string[]; protocol: string }[]>(
          "https://api.llama.fi/hacks", 1800, "dash:llama:hacks"
        ),
        getCeloGasPrice(),
      ]);

      // ─── CELO price ───────────────────────────────────────────────────────────
      const celoPrice = celoRes.status === "fulfilled" ? celoRes.value?.["celo"] ?? null : null;
      const gasPrice = gasRes.status === "fulfilled" && gasRes.value ? gasRes.value.gasPriceGwei : null;

      // ─── TVL ─────────────────────────────────────────────────────────────────
      const celoChain = tvlRes.status === "fulfilled" && Array.isArray(tvlRes.value)
        ? tvlRes.value.find((c) => c.name === "Celo") ?? null
        : null;
      const tvl = celoChain ? { usd: celoChain.tvl, change1d: celoChain.change_1d } : null;

      // ─── Market feed (trending + new pools) ───────────────────────────────────
      const trendingPools = trendingRes.status === "fulfilled" ? (trendingRes.value?.data ?? []) : [];
      const newPools = newPoolsRes.status === "fulfilled" ? (newPoolsRes.value?.data ?? []) : [];
      const allPools = allPoolsRes.status === "fulfilled" ? (allPoolsRes.value?.data ?? []) : [];

      type MarketItem = { type: string; tag: string; name: string; desc: string; time: string; change?: string; isPositive?: boolean };
      const marketFeed: MarketItem[] = [];

      // Trending pools
      for (const p of trendingPools.slice(0, 3)) {
        const change = p.attributes.price_change_percentage?.h24 ?? null;
        const changeNum = change ? Number.parseFloat(change) : null;
        const vol = p.attributes.volume_usd?.h24 ? `$${Number(p.attributes.volume_usd.h24).toLocaleString(undefined, { maximumFractionDigits: 0 })} vol` : "";
        marketFeed.push({
          type: "TRENDING",
          tag: "MARKET",
          name: p.attributes.name,
          desc: `${vol}${changeNum != null ? ` · ${changeNum >= 0 ? "+" : ""}${changeNum.toFixed(1)}% 24h` : ""}`,
          time: "now",
          change: changeNum != null ? `${changeNum >= 0 ? "+" : ""}${changeNum.toFixed(1)}%` : undefined,
          isPositive: changeNum != null ? changeNum >= 0 : undefined,
        });
      }

      // New pool launches
      for (const p of newPools.slice(0, 2)) {
        const created = p.attributes.pool_created_at ? new Date(p.attributes.pool_created_at).toLocaleDateString() : "recent";
        marketFeed.push({
          type: "NEW",
          tag: "LAUNCH",
          name: p.attributes.name,
          desc: `New pool launched ${created}`,
          time: created,
        });
      }

      // Largest pool by reserve (whale-level liquidity)
      const topPool = allPools[0];
      if (topPool) {
        const reserve = topPool.attributes.reserve_in_usd
          ? `$${Number(topPool.attributes.reserve_in_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })} TVL`
          : "";
        marketFeed.push({
          type: "WHALE",
          tag: "LIQUIDITY",
          name: topPool.attributes.name,
          desc: `Largest pool on Celo · ${reserve}`,
          time: "live",
        });
      }

      // TVL change alert
      if (tvl) {
        const isDown = (tvl.change1d ?? 0) < -2;
        const isUp = (tvl.change1d ?? 0) > 2;
        if (isDown || isUp) {
          marketFeed.push({
            type: isDown ? "ALERT" : "PUMP",
            tag: "TVL",
            name: "Celo Ecosystem TVL",
            desc: `${tvl.change1d >= 0 ? "+" : ""}${tvl.change1d.toFixed(2)}% in 24h · $${tvl.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })} total`,
            time: "live",
            change: `${tvl.change1d >= 0 ? "+" : ""}${tvl.change1d.toFixed(2)}%`,
            isPositive: tvl.change1d >= 0,
          });
        }
      }

      // ─── Risk feed ────────────────────────────────────────────────────────────
      type RiskItem = { level: "HIGH" | "MED" | "LOW"; title: string; desc: string; time: string };
      const riskFeed: RiskItem[] = [];

      // Protocol hacks on Celo or major cross-chain
      if (hacksRes.status === "fulfilled" && Array.isArray(hacksRes.value)) {
        const recent = hacksRes.value
          .filter((h) =>
            Array.isArray(h.chains) && h.chains.some((c: string) => c.toLowerCase() === "celo")
          )
          .sort((a, b) => b.date - a.date)
          .slice(0, 2);

        for (const hack of recent) {
          const date = new Date(hack.date * 1000).toLocaleDateString();
          const amt = hack.amount ? `$${(hack.amount / 1e6).toFixed(1)}M lost` : "amount unknown";
          riskFeed.push({
            level: "HIGH",
            title: `Hack: ${hack.protocol ?? "Unknown protocol"}`,
            desc: `${amt} on ${date}`,
            time: date,
          });
        }

        // Also show most recent major non-Celo hack as general awareness
        const bigHack = hacksRes.value
          .filter((h) => !Array.isArray(h.chains) || !h.chains.some((c: string) => c.toLowerCase() === "celo"))
          .sort((a, b) => b.date - a.date)[0];
        if (bigHack && bigHack.amount > 1_000_000) {
          const date = new Date(bigHack.date * 1000).toLocaleDateString();
          riskFeed.push({
            level: "MED",
            title: `DeFi Incident: ${bigHack.protocol ?? "Unknown"}`,
            desc: `$${(bigHack.amount / 1e6).toFixed(1)}M hack on ${date} — stay vigilant`,
            time: date,
          });
        }
      }

      // TVL drop = possible exploit/exit
      if (tvl && typeof tvl.change1d === "number" && tvl.change1d < -5) {
        riskFeed.push({
          level: "HIGH",
          title: "Sharp TVL Drop",
          desc: `Celo ecosystem TVL dropped ${tvl.change1d.toFixed(1)}% in 24h — potential exploit or mass exit`,
          time: "live",
        });
      } else if (tvl && typeof tvl.change1d === "number" && tvl.change1d < -2) {
        riskFeed.push({
          level: "MED",
          title: "TVL Declining",
          desc: `Celo TVL down ${tvl.change1d.toFixed(1)}% today — monitor for unusual activity`,
          time: "live",
        });
      }

      // Always add swap slippage awareness
      riskFeed.push({
        level: "LOW",
        title: "Swap Safety",
        desc: "Always review swap quotes before signing. Large price impact = potential manipulation.",
        time: "always",
      });

      if (!riskFeed.length) {
        riskFeed.push({ level: "LOW", title: "No active alerts", desc: "No known hacks or major risk events on Celo right now.", time: "now" });
      }

      return makeOk("dashboard_metrics", NETWORK, {
        celoPrice,
        gasPrice,
        tvl,
        trendingTokens: trendingPools.slice(0, 5).map((p) => ({
          name: p.attributes.name,
          priceUsd: p.attributes.price_usd,
          change24h: p.attributes.price_change_percentage?.h24,
          volume24h: p.attributes.volume_usd?.h24,
        })),
        marketFeed,
        riskFeed,
        network: NETWORK,
      }, { type: "result_card" });
    } catch (e: unknown) {
      return reply.code(500).send(makeErr("dashboard_metrics", NETWORK, "FETCH_ERROR", String(e)));
    }
  });
}
