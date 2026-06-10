#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./tools.js";
import { getTopCeloWhales } from "./whale.js";
import { getTrendingCeloTokens } from "./market.js";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[CeloMind MCP] Server running on stdio — network:", process.env.CELO_NETWORK ?? "celo");

  // Pre-warm the slow Dune-backed caches so the first tool call returns fast instead of
  // hitting a cold-cache timeout that the MCP client reports as a tool-execution error.
  void Promise.allSettled([getTopCeloWhales(), getTrendingCeloTokens()]);
}

main().catch((e) => {
  console.error("[CeloMind MCP] Fatal:", e);
  process.exit(1);
});
