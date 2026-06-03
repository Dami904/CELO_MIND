/**
 * Dune Analytics Query API client (https://docs.dune.com/api-reference).
 *
 * Authenticated with DUNE_API_KEY (a Dune Analytics / SQL key — NOT a Sim key).
 * Two modes:
 *   - runDuneQueryLatest(id): GET /api/v1/query/{id}/results — returns the latest cached execution
 *     of a saved query. Cheap, no new credits consumed. Preferred for periodically-refreshed dashboards.
 *   - runDuneQueryFresh(id, params): POST /api/v1/query/{id}/execute → poll status → fetch results.
 *     Consumes credits; use only when fresh / parameterized data is required.
 *
 * Results are cached in Redis/in-memory (Dune executions are slow + cost credits). Query IDs come from
 * env (DUNE_QUERY_TRENDING_TOKENS, DUNE_QUERY_TOP_WHALES, ...). If a key/ID is missing, callers should
 * fall back to a non-Dune source — see usage in market.ts / whale.ts.
 */
import { cached } from "@celomind/shared";

const DUNE_BASE = "https://api.dune.com/api/v1";

export function duneEnabled(): boolean {
  return Boolean(process.env.DUNE_API_KEY);
}

function headers(): Record<string, string> {
  return { "X-Dune-Api-Key": process.env.DUNE_API_KEY ?? "", Accept: "application/json" };
}

export type DuneResult<Row = Record<string, unknown>> = {
  rows: Row[];
  source: "Dune Analytics";
  queryId: number;
  executedAt: string | null;
};

type DuneResultsResponse<Row> = {
  execution_id?: string;
  state?: string;
  result?: { rows: Row[] };
  execution_ended_at?: string;
  error?: string | { type?: string; message?: string };
};

/**
 * Fetch the latest cached results for a saved Dune query. No new execution is triggered.
 * Cached locally for `ttlSeconds` to avoid repeated API hits.
 */
export async function runDuneQueryLatest<Row = Record<string, unknown>>(
  queryId: number,
  ttlSeconds = 900
): Promise<DuneResult<Row> | null> {
  if (!duneEnabled() || !queryId) return null;
  return cached(`dune:latest:${queryId}`, ttlSeconds, async () => {
    const res = await fetch(`${DUNE_BASE}/query/${queryId}/results?limit=100`, {
      headers: headers(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      // 404 here usually means "no execution exists yet" — caller falls back.
      return null;
    }
    const body = (await res.json()) as DuneResultsResponse<Row>;
    return {
      rows: body.result?.rows ?? [],
      source: "Dune Analytics" as const,
      queryId,
      executedAt: body.execution_ended_at ?? null,
    };
  });
}

/**
 * Trigger a fresh execution of a saved query (optionally with parameters), poll until complete,
 * and return the results. Consumes Dune credits. Polls up to ~30s.
 */
export async function runDuneQueryFresh<Row = Record<string, unknown>>(
  queryId: number,
  params?: Record<string, string | number>,
  opts: { ttlSeconds?: number; maxWaitMs?: number } = {}
): Promise<DuneResult<Row> | null> {
  if (!duneEnabled() || !queryId) return null;
  const { ttlSeconds = 900, maxWaitMs = 30000 } = opts;
  const cacheKey = `dune:fresh:${queryId}:${JSON.stringify(params ?? {})}`;

  return cached(cacheKey, ttlSeconds, async () => {
    // 1. Execute
    const execRes = await fetch(`${DUNE_BASE}/query/${queryId}/execute`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(params ? { query_parameters: params } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!execRes.ok) return null;
    const { execution_id } = (await execRes.json()) as { execution_id?: string };
    if (!execution_id) return null;

    // 2. Poll status
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(`${DUNE_BASE}/execution/${execution_id}/status`, {
        headers: headers(),
        signal: AbortSignal.timeout(15000),
      });
      if (!statusRes.ok) continue;
      const status = (await statusRes.json()) as { state?: string };
      if (status.state === "QUERY_STATE_COMPLETED") break;
      if (status.state === "QUERY_STATE_FAILED" || status.state === "QUERY_STATE_CANCELLED") return null;
    }

    // 3. Fetch results
    const resultsRes = await fetch(`${DUNE_BASE}/execution/${execution_id}/results?limit=100`, {
      headers: headers(),
      signal: AbortSignal.timeout(15000),
    });
    if (!resultsRes.ok) return null;
    const body = (await resultsRes.json()) as DuneResultsResponse<Row>;
    return {
      rows: body.result?.rows ?? [],
      source: "Dune Analytics" as const,
      queryId,
      executedAt: body.execution_ended_at ?? null,
    };
  });
}

// ─── Convenience wrappers keyed off env query IDs ─────────────────────────────
function queryId(envVar: string): number {
  const raw = process.env[envVar];
  const id = raw ? Number(raw) : 0;
  return Number.isFinite(id) ? id : 0;
}

/**
 * The Dune queries are scheduled to refresh DAILY on dune.com, so there's no value re-reading the
 * latest results more often than a few times a day. Cache them for 6h (env-overridable). This only
 * reads Dune's cheap `/results` endpoint — it never triggers a (credit-costing) execution.
 */
const DAILY_QUERY_TTL = Number(process.env.DUNE_CACHE_TTL_SECONDS) || 6 * 60 * 60; // 6 hours

export async function getDuneTrendingTokens(): Promise<DuneResult | null> {
  return runDuneQueryLatest(queryId("DUNE_QUERY_TRENDING_TOKENS"), DAILY_QUERY_TTL);
}

export async function getDuneTopWhales(): Promise<DuneResult | null> {
  return runDuneQueryLatest(queryId("DUNE_QUERY_TOP_WHALES"), DAILY_QUERY_TTL);
}
