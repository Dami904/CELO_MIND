#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./tools.js";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[CeloMind MCP] Server running on stdio — network:", process.env.CELO_NETWORK ?? "celo");
}

main().catch((e) => {
  console.error("[CeloMind MCP] Fatal:", e);
  process.exit(1);
});
