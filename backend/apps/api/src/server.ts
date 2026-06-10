import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { initDb } from "./db/sqlite.js";
import { healthRoutes } from "./routes/health.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { walletRoutes } from "./routes/wallet.js";
import { chatRoutes } from "./routes/chat.js";
import { riskRoutes } from "./routes/risk.js";
import { whaleRoutes } from "./routes/whales.js";
import { toolRoutes } from "./routes/tools.js";
import { mcpHttpRoutes } from "./routes/mcp-http.js";
import { metricsRoutes } from "../../../dashboard/src/index.js";
import { getTopCeloWhales } from "@celomind/mcp-server/whale";
import { getTrendingCeloTokens } from "@celomind/mcp-server/market";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  await initDb();
  const app = Fastify({ logger: { level: "info" } });

  const ALLOWED_ORIGINS = [
    "https://celomind.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
    ...(process.env.EXTRA_CORS_ORIGINS ? process.env.EXTRA_CORS_ORIGINS.split(",") : []),
  ];
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, MCP clients)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // Global error handler
  app.setErrorHandler((error, req, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 500).send({
      success: false,
      action: "error",
      network: "celo",
      data: null,
      error: { code: "INTERNAL_ERROR", message: error.message },
      timestamp: new Date().toISOString(),
      uiHints: { type: "error_card" },
    });
  });

  // Register all routes
  await app.register(healthRoutes);
  await app.register(dashboardRoutes);
  await app.register(walletRoutes);
  await app.register(chatRoutes);
  await app.register(riskRoutes);
  await app.register(whaleRoutes);
  await app.register(toolRoutes);
  await app.register(mcpHttpRoutes);
  await app.register(metricsRoutes);

  await app.listen({ port: PORT, host: HOST });
  console.log(`[CeloMind API] Listening on http://${HOST}:${PORT}`);
  console.log(`[CeloMind API] Network: celo (mainnet-only)`);

  // Pre-warm the slow Dune-backed caches (whale leaderboard + trending tokens) so the first
  // MCP/web call returns from cache instead of hitting a cold-cache timeout. Fire-and-forget.
  void Promise.allSettled([getTopCeloWhales(), getTrendingCeloTokens()])
    .then(() => console.log("[CeloMind API] Pre-warmed whale + trending caches"));
}

main().catch((e) => {
  console.error("[CeloMind API] Fatal startup error:", e);
  process.exit(1);
});
