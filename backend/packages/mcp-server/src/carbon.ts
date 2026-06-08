/**
 * Carbon DeFi read tools — programmable AMM on Celo by Bancor.
 * Uses the public Carbon DeFi API: https://api.carbondefi.xyz/v1
 * All tools here are read-only (no execution, no private key needed).
 */
import { cached } from "@celomind/shared";
import type { Network } from "@celomind/shared";

const CARBON_API = "https://api.carbondefi.xyz/v1";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Carbon API HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export async function getCarbonStrategies(network: Network) {
  return await cached("carbon:strategies", 120, async () => {
    try {
      const data = await fetchJson<{ strategies?: unknown[] }>(`${CARBON_API}/strategies?chainId=42220`);
      const strategies = data.strategies ?? (Array.isArray(data) ? data as unknown[] : []);
      return {
        strategies: (strategies as Record<string, unknown>[]).slice(0, 20),
        total: strategies.length,
        source: "Carbon DeFi API",
        docs: "https://docs.carbondefi.xyz",
      };
    } catch (e) {
      return { strategies: [], error: String(e), note: "Carbon DeFi API may be temporarily unavailable." };
    }
  });
}

export async function getCarbonTradeQuote(sourceToken: string, targetToken: string, amount: string, network: Network) {
  return await cached(`carbon:quote:${sourceToken}:${targetToken}:${amount}`, 30, async () => {
    try {
      const url = `${CARBON_API}/trade/quote?chainId=42220&sourceToken=${sourceToken}&targetToken=${targetToken}&amount=${amount}`;
      const data = await fetchJson<Record<string, unknown>>(url);
      return { sourceToken, targetToken, amount, ...data, source: "Carbon DeFi API" };
    } catch (e) {
      return { sourceToken, targetToken, amount, error: String(e) };
    }
  });
}

export async function exploreCarbonPair(token0: string, token1: string, network: Network) {
  return await cached(`carbon:pair:${token0}:${token1}`, 120, async () => {
    try {
      const url = `${CARBON_API}/strategies?chainId=42220&token0=${token0}&token1=${token1}`;
      const data = await fetchJson<{ strategies?: unknown[] }>(url);
      const strategies = data.strategies ?? (Array.isArray(data) ? data as unknown[] : []);
      return {
        token0,
        token1,
        strategies: (strategies as Record<string, unknown>[]).slice(0, 10),
        strategyCount: strategies.length,
        source: "Carbon DeFi API",
      };
    } catch (e) {
      return { token0, token1, error: String(e) };
    }
  });
}

export async function findCarbonOpportunities(network: Network) {
  return await cached("carbon:opportunities", 60, async () => {
    try {
      const data = await fetchJson<{ strategies?: unknown[] }>(`${CARBON_API}/strategies?chainId=42220`);
      const strategies = (data.strategies ?? (Array.isArray(data) ? data as unknown[] : [])) as Record<string, unknown>[];
      // Find strategies with meaningful liquidity
      const opportunities = strategies
        .filter((s) => s.liquidity || s.order0 || s.order1)
        .slice(0, 10)
        .map((s) => ({
          id: s.id,
          token0: s.token0,
          token1: s.token1,
          liquidity: s.liquidity,
          type: "Carbon AMM Strategy",
        }));
      return { opportunities, source: "Carbon DeFi API", docs: "https://docs.carbondefi.xyz/trading" };
    } catch (e) {
      return { opportunities: [], error: String(e) };
    }
  });
}

export async function simulateCarbonStrategy(token0: string, token1: string, amount: string, network: Network) {
  try {
    const url = `${CARBON_API}/trade/quote?chainId=42220&sourceToken=${token0}&targetToken=${token1}&amount=${amount}`;
    const data = await fetchJson<Record<string, unknown>>(url);
    return {
      simulation: { token0, token1, inputAmount: amount, ...data },
      note: "This is a simulation only — no funds are moved. Use Carbon DeFi app to execute: https://app.carbondefi.xyz",
      source: "Carbon DeFi API",
    };
  } catch (e) {
    return { token0, token1, amount, error: String(e) };
  }
}

export async function getCarbonProtocolStats(network: Network) {
  return await cached("carbon:stats", 180, async () => {
    try {
      const [strategies, activity] = await Promise.all([
        fetchJson<{ strategies?: unknown[] }>(`${CARBON_API}/strategies?chainId=42220`).catch(() => ({ strategies: [] })),
        fetchJson<Record<string, unknown>>(`${CARBON_API}/activity?chainId=42220&limit=100`).catch(() => ({})),
      ]);
      const strats = strategies.strategies ?? [];
      return {
        totalStrategies: (strats as unknown[]).length,
        chainId: 42220,
        chain: "Celo Mainnet",
        recentActivity: activity,
        source: "Carbon DeFi API",
        appUrl: "https://app.carbondefi.xyz",
        docs: "https://docs.carbondefi.xyz",
      };
    } catch (e) {
      return { error: String(e), appUrl: "https://app.carbondefi.xyz" };
    }
  });
}

export async function getCarbonPriceHistory(token0: string, token1: string, network: Network) {
  return await cached(`carbon:history:${token0}:${token1}`, 300, async () => {
    try {
      const url = `${CARBON_API}/history/prices?chainId=42220&token0=${token0}&token1=${token1}`;
      const data = await fetchJson<Record<string, unknown>>(url);
      return { token0, token1, ...data, source: "Carbon DeFi API" };
    } catch (e) {
      return { token0, token1, error: String(e) };
    }
  });
}
