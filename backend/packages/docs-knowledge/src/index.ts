export * from "./celo-docs.js";
export * from "./live-fetch.js";

import { fetchLiveDocs } from "./live-fetch.js";
import { searchDocs } from "./celo-docs.js";

/**
 * Build docs context for a query.
 * Tries live online sources first; falls back to hardcoded summaries if offline or nothing found.
 */
export async function buildDocsContextAsync(query: string, maxEntries = 3): Promise<string> {
  const liveDocs = await fetchLiveDocs(query).catch(() => []);

  if (liveDocs.length > 0) {
    return liveDocs
      .slice(0, maxEntries)
      .map((d) => `### ${d.topic} (source: ${d.source}, fetched: ${d.fetchedAt})\n${d.content}`)
      .join("\n\n");
  }

  // Fallback to curated static docs
  const staticResults = searchDocs(query).slice(0, maxEntries);
  if (staticResults.length === 0) {
    return "No specific Celo documentation found for this query. Answer based on general Celo knowledge.";
  }
  return staticResults.map((r) => `### ${r.topic}\n${r.content}`).join("\n\n");
}

// Sync fallback for MCP server (which can't await at module level easily)
export { buildDocsContext } from "./celo-docs.js";
