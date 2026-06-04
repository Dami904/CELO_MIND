/**
 * Durable SQL mirror of the Redis metrics (libsql — local file or hosted Turso).
 *
 * Redis stays the fast primary. Every metric increment is ALSO written here, and
 * the read path falls back to this store when Redis is empty or unreachable — so
 * the metric counts survive a Redis wipe/outage. It becomes truly durable across
 * Render restarts when DATABASE_URL points at a Turso (libsql://) DB with
 * DATABASE_AUTH_TOKEN; with a local file it mirrors but is only as durable as the disk.
 *
 * Every op is best-effort and self-contained: a mirror failure must never break a
 * user-facing request.
 */
import { createClient, type Client } from "@libsql/client";

let _client: Client | null | undefined; // undefined = not yet resolved, null = disabled
let _ready: Promise<void> | null = null;

function resolveConfig(): { url: string; authToken?: string } | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  // libsql://, https://, http://, ws://, wss://, file: → use verbatim; bare path → file:
  const url = /^(libsql|https?|wss?|file):/.test(raw) ? raw : `file:${raw}`;
  return authToken ? { url, authToken } : { url };
}

function client(): Client | null {
  if (_client !== undefined) return _client;
  const cfg = resolveConfig();
  if (!cfg) {
    _client = null;
    return null;
  }
  try {
    _client = createClient(cfg);
  } catch {
    _client = null;
  }
  return _client;
}

async function ready(): Promise<Client | null> {
  const c = client();
  if (!c) return null;
  if (!_ready) {
    _ready = c
      .executeMultiple(
        `CREATE TABLE IF NOT EXISTS metric_counters (
           hkey TEXT NOT NULL,
           field TEXT NOT NULL,
           value INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (hkey, field)
         );
         CREATE TABLE IF NOT EXISTS metric_uniques (
           skey TEXT NOT NULL,
           member TEXT NOT NULL,
           PRIMARY KEY (skey, member)
         );`
      )
      .catch(() => {
        /* leave _ready resolved; individual ops will no-op on failure */
      });
  }
  await _ready;
  return c;
}

export type CounterOp = { hkey: string; field: string; amount: number };
export type UniqueOp = { skey: string; member: string };

/** Mirror of HINCRBY across many (hash, field) counters in one transaction. */
export async function sqlHincrbyBatch(ops: CounterOp[]): Promise<void> {
  if (!ops.length) return;
  try {
    const c = await ready();
    if (!c) return;
    await c.batch(
      ops.map((o) => ({
        sql: `INSERT INTO metric_counters (hkey, field, value) VALUES (?, ?, ?)
              ON CONFLICT(hkey, field) DO UPDATE SET value = value + excluded.value`,
        args: [o.hkey, o.field, o.amount],
      })),
      "write"
    );
  } catch {
    /* mirror must never break the request */
  }
}

/** Mirror of PFADD (exact set membership in SQL) for unique users/sessions. */
export async function sqlPfaddBatch(ops: UniqueOp[]): Promise<void> {
  if (!ops.length) return;
  try {
    const c = await ready();
    if (!c) return;
    await c.batch(
      ops.map((o) => ({
        sql: `INSERT OR IGNORE INTO metric_uniques (skey, member) VALUES (?, ?)`,
        args: [o.skey, o.member],
      })),
      "write"
    );
  } catch {
    /* non-fatal */
  }
}

/** Mirror of HGETALL → field/value map (empty when disabled or on error). */
export async function sqlHgetall(hkey: string): Promise<Record<string, string>> {
  try {
    const c = await ready();
    if (!c) return {};
    const rs = await c.execute({ sql: `SELECT field, value FROM metric_counters WHERE hkey = ?`, args: [hkey] });
    const out: Record<string, string> = {};
    for (const row of rs.rows) out[String(row.field)] = String(row.value ?? "0");
    return out;
  } catch {
    return {};
  }
}

/** Mirror of PFCOUNT → exact distinct-member count (0 when disabled or on error). */
export async function sqlPfcount(skey: string): Promise<number> {
  try {
    const c = await ready();
    if (!c) return 0;
    const rs = await c.execute({ sql: `SELECT COUNT(*) AS c FROM metric_uniques WHERE skey = ?`, args: [skey] });
    const n = Number(rs.rows[0]?.c ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function metricsMirrorEnabled(): boolean {
  return client() !== null;
}
