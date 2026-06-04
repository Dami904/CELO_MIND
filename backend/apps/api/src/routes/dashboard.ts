import type { FastifyInstance } from "fastify";
import { makeOk, makeErr, resolveNetwork, cached } from "@celomind/shared";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/metrics", async (req, reply) => {
    try {
      const [celoRes, tvlRes, trendingRes] = await Promise.allSettled([
        cached("dash:celo:price", 60, () =>
          fetch("https://api.coingecko.com/api/v3/simple/price?ids=celo&vs_currencies=usd&include_24hr_change=true", { signal: AbortSignal.timeout(10000) }).then((r) => r.json())
        ),
        cached("dash:llama:chains", 300, () =>
          fetch("https://api.llama.fi/v2/chains", { signal: AbortSignal.timeout(10000) }).then((r) => r.json())
        ),
        cached("dash:gt:trending:celo", 120, () =>
          fetch("https://api.geckoterminal.com/api/v2/networks/celo/trending_pools?page=1", { signal: AbortSignal.timeout(10000) }).then((r) => r.json())
        ),
      ]);

      const celoPrice = celoRes.status === "fulfilled" ? (celoRes.value as Record<string, unknown>)?.["celo"] : null;

      const tvl = tvlRes.status === "fulfilled"
        ? (Array.isArray(tvlRes.value) ? (tvlRes.value as { name: string; tvl: number; change_1d: number }[]).find((c) => c.name === "Celo") : null)
        : null;

      const trendingTokens = trendingRes.status === "fulfilled"
        ? ((trendingRes.value as { data?: { attributes: { name: string; symbol: string; price_usd: string } }[] })?.data ?? []).slice(0, 5).map((p) => ({
            name: p.attributes.name,
            symbol: p.attributes.symbol,
            priceUsd: p.attributes.price_usd,
          }))
        : [];

      return makeOk("dashboard_metrics", NETWORK, {
        celoPrice,
        tvl: tvl ? { usd: tvl.tvl, change1d: tvl.change_1d } : null,
        trendingTokens,
        network: NETWORK,
      }, { type: "result_card" });
    } catch (e: unknown) {
      return reply.code(500).send(makeErr("dashboard_metrics", NETWORK, "FETCH_ERROR", String(e)));
    }
  });
}
