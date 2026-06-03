import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { allTools } from './tools/index.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name:    'celo-mcp',
    version: '0.1.0',
  });

  for (const tool of allTools) {
    server.tool(tool.name, tool.description, tool.schema, tool.handler);
  }

  return server;
}
