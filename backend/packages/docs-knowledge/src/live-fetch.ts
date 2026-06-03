/**
 * Live Celo documentation fetcher.
 * Fetches from official sources: docs.celo.org, GitHub, DefiLlama, GeckoTerminal.
 * Results are cached for 30 minutes (Upstash Redis when configured, in-memory otherwise) to
 * avoid hammering the sources.
 */

import { cached } from "@celomind/shared";

const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes

// Strip HTML tags from content
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "CeloMind-Bot/1.0 (docs research)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ─── Individual source fetchers ───────────────────────────────────────────────

async function fetchCeloDocs(path: string): Promise<string> {
  return cached(`celodocs:${path}`, CACHE_TTL_SECONDS, async () => {
    const url = `https://docs.celo.org${path}`;
    const html = await fetchText(url);
    // Extract main content between <main> tags
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    return stripHtml(mainMatch?.[1] ?? html).slice(0, 3000);
  });
}

async function fetchGitHubMarkdown(repo: string, filePath: string): Promise<string> {
  return cached(`github:${repo}:${filePath}`, CACHE_TTL_SECONDS, async () => {
    const url = `https://raw.githubusercontent.com/${repo}/main/${filePath}`;
    const text = await fetchText(url);
    return text.slice(0, 3000);
  });
}

async function fetchCeloTVLData(): Promise<string> {
  return cached("defillama:celo:tvl", CACHE_TTL_SECONDS, async () => {
    const res = await fetch("https://api.llama.fi/v2/chains");
    if (!res.ok) throw new Error("DefiLlama fetch failed");
    const chains = (await res.json()) as { name: string; tvl: number; change_1d: number; change_7d: number }[];
    const celo = chains.find((c) => c.name === "Celo");
    if (!celo) return "Celo TVL data not available";
    return `Celo TVL: $${(celo.tvl / 1e6).toFixed(2)}M | 24h change: ${celo.change_1d?.toFixed(2) ?? "N/A"}% | 7d change: ${celo.change_7d?.toFixed(2) ?? "N/A"}%`;
  });
}

async function fetchCeloProtocols(): Promise<string> {
  return cached("defillama:celo:protocols", CACHE_TTL_SECONDS, async () => {
    const res = await fetch("https://api.llama.fi/protocols");
    if (!res.ok) throw new Error("DefiLlama protocols fetch failed");
    const protocols = (await res.json()) as { name: string; chain: string; tvl: number; category: string }[];
    const celoProtocols = protocols
      .filter((p) => p.chain === "Celo" || (p as { chains?: string[] }).chains?.includes("Celo"))
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 10)
      .map((p) => `${p.name} (${p.category}): $${(p.tvl / 1e6).toFixed(2)}M TVL`);
    return `Top Celo DeFi Protocols by TVL:\n${celoProtocols.join("\n")}`;
  });
}

// ─── Topic-based live fetch router ───────────────────────────────────────────

export type LiveDoc = {
  topic: string;
  content: string;
  source: string;
  fetchedAt: string;
};

const TOPIC_SOURCES: {
  keywords: RegExp[];
  fetch: () => Promise<{ content: string; source: string }>;
}[] = [
  {
    keywords: [/tvl/i, /total value locked/i, /defi ecosystem/i],
    fetch: async () => ({ content: await fetchCeloTVLData(), source: "DefiLlama" }),
  },
  {
    keywords: [/protocol/i, /dapp/i, /defi protocol/i, /top protocol/i],
    fetch: async () => ({ content: await fetchCeloProtocols(), source: "DefiLlama" }),
  },
  {
    keywords: [/what is celo/i, /overview/i, /introduction/i],
    fetch: async () => ({ content: await fetchCeloDocs("/"), source: "docs.celo.org" }),
  },
  {
    keywords: [/mento/i, /stablecoin/i, /cusd/i, /ceur/i, /creal/i],
    fetch: async () => ({ content: await fetchCeloDocs("/protocol/stability"), source: "docs.celo.org" }),
  },
  {
    keywords: [/governance/i, /cgp/i, /voting/i, /proposal/i],
    fetch: async () => ({ content: await fetchCeloDocs("/protocol/governance"), source: "docs.celo.org" }),
  },
  {
    keywords: [/validator/i, /staking/i, /pos/i, /proof.of.stake/i],
    fetch: async () => ({ content: await fetchCeloDocs("/protocol/pos"), source: "docs.celo.org" }),
  },
  {
    keywords: [/wallet/i, /valora/i, /minipay/i],
    fetch: async () => ({ content: await fetchCeloDocs("/wallet"), source: "docs.celo.org" }),
  },
  {
    keywords: [/self/i, /identity/i, /kyc/i, /selfxyz/i],
    fetch: async () => ({
      content: await fetchGitHubMarkdown("selfxyz/self-docs", "README.md").catch(
        () => "Self Protocol: privacy-preserving identity on Celo using ZK proofs. Visit https://selfxyz.com"
      ),
      source: "github.com/selfxyz",
    }),
  },
  {
    keywords: [/x402/i, /http 402/i, /micropayment/i, /api payment/i],
    fetch: async () => ({
      content: "x402 enables HTTP 402-based micropayments for API access. Built by Coinbase. Uses USDC/cUSD on Celo. See https://x402.org",
      source: "x402.org",
    }),
  },
];

export async function fetchLiveDocs(query: string): Promise<LiveDoc[]> {
  const results: LiveDoc[] = [];

  for (const source of TOPIC_SOURCES) {
    if (source.keywords.some((re) => re.test(query))) {
      try {
        const { content, source: src } = await source.fetch();
        results.push({ topic: query, content, source: src, fetchedAt: new Date().toISOString() });
      } catch {
        // skip failed sources silently
      }
    }
  }

  return results;
}
