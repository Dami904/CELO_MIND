/**
 * HTTP MCP transport — exposes CeloMind's MCP server at GET|POST|DELETE /mcp
 * using the MCP Streamable HTTP transport (stateful sessions, SSE streaming).
 *
 * Users can paste https://celo-mind-nmk2.onrender.com/mcp directly into Claude Desktop
 * (Settings → Connectors → Add custom connector) or ~/.cursor/mcp.json.
 */
import type { FastifyInstance } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { createMcpServer } from "@celomind/mcp-server/tools";

type Session = { server: McpServer; transport: StreamableHTTPServerTransport };

// Session map — lives for the lifetime of this process.
const sessions = new Map<string, Session>();

function cleanupSession(sessionId: string) {
  sessions.delete(sessionId);
}

export async function mcpHttpRoutes(app: FastifyInstance) {
  // POST /mcp — initialize a new session OR dispatch a tool call on an existing session.
  app.post("/mcp", async (req, reply) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Existing session — delegate to its transport.
      reply.hijack();
      const { transport } = sessions.get(sessionId)!;
      await transport.handleRequest(req.raw, reply.raw, req.body);
      return;
    }

    // New session — create transport + server, connect, then handle the init request.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const server = createMcpServer();
    await server.connect(transport);

    transport.onclose = () => {
      if (transport.sessionId) cleanupSession(transport.sessionId);
    };

    reply.hijack();
    await transport.handleRequest(req.raw, reply.raw, req.body);

    // Store session after first request so the session ID is known.
    if (transport.sessionId) {
      sessions.set(transport.sessionId, { server, transport });
    }
  });

  // GET /mcp — open SSE event stream for an existing session.
  app.get("/mcp", async (req, reply) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      reply.code(400).send({ error: "Missing or invalid mcp-session-id header. POST /mcp first to initialize." });
      return;
    }
    reply.hijack();
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req.raw, reply.raw);
  });

  // DELETE /mcp — close and remove a session.
  app.delete("/mcp", async (req, reply) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId)!;
      await transport.close();
      cleanupSession(sessionId);
    }
    reply.code(200).send({ ok: true });
  });

  // Informational endpoint — returns connection instructions for this MCP server.
  app.get("/mcp/info", async (_req, reply) => {
    reply.send({
      name: "CeloMind MCP",
      version: "1.0.0",
      description: "Celo blockchain AI tools — balances, swaps, market data, risk analysis, DeFi, and more.",
      transport: "Streamable HTTP (MCP spec)",
      endpoint: "/mcp",
      connect: {
        claudeDesktop: {
          settings_ui: "Settings → Connectors → Add custom connector → paste the endpoint URL",
          config_file: {
            mcpServers: {
              celomind: {
                url: "RENDER_URL/mcp",
              },
            },
          },
        },
        cursor: {
          config_file: "~/.cursor/mcp.json",
          example: {
            celomind: {
              url: "RENDER_URL/mcp",
            },
          },
        },
        legacy_npx: {
          command: "npx",
          args: ["-y", "mcp-remote", "RENDER_URL/mcp"],
        },
      },
    });
  });
}
