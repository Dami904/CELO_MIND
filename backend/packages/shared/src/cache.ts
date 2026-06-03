/**
 * Lightweight cache with an Upstash Redis (REST) backend and an in-memory fallback.
 *
 * - If UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN are set, values are cached in Upstash via its REST API
 *   (no extra dependency — plain fetch).
 * - Otherwise (tests / offline / missing env) it transparently falls back to an in-process Map so
 *   callers never have to care whether Redis is configured.
 *
 * Values are JSON-serialized. Use `cached(key, ttlSeconds, fn)` to wrap any async producer.
 */

type MemEntry = { value: string; expiresAt: number };
const memStore = new Map<string, MemEntry>();

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (url && token) return { url: url.replace(/\/$/, ""), token };
  return null;
}

async function redisGet(key: string): Promise<string | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result: string | null };
    return body.result ?? null;
  } catch {
    return null;
  }
}

async function redisSetex(key: string, ttlSeconds: number, value: string): Promise<void> {
  const cfg = redisConfig();
  if (!cfg) return;
  try {
    await fetch(`${cfg.url}/setex/${encodeURIComponent(key)}/${ttlSeconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "text/plain" },
      body: value,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* non-fatal — cache write failures must never break a request */
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  // Redis first (shared across instances), then in-memory.
  const fromRedis = await redisGet(key);
  if (fromRedis !== null) {
    try {
      return JSON.parse(fromRedis) as T;
    } catch {
      return null;
    }
  }
  const entry = memStore.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }
  if (entry) memStore.delete(key);
  return null;
}

export async function cacheSet<T>(key: string, ttlSeconds: number, value: T): Promise<void> {
  const serialized = JSON.stringify(value);
  memStore.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
  await redisSetex(key, ttlSeconds, serialized);
}

/**
 * Wrap an async producer with read-through caching.
 * Returns the cached value if present; otherwise runs `fn`, caches the result, and returns it.
 * If `fn` throws, the error propagates (nothing is cached).
 */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  // Don't cache null/undefined — lets a failed upstream retry next time.
  if (value !== null && value !== undefined) {
    await cacheSet(key, ttlSeconds, value);
  }
  return value;
}

export function isRedisConfigured(): boolean {
  return redisConfig() !== null;
}
