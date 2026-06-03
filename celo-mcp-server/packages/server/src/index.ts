#!/usr/bin/env node
import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[celo-mcp] Server running on stdio');
}

main().catch((err) => {
  console.error('[celo-mcp] Fatal error:', err);
  process.exit(1);
});
