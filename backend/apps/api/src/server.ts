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

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  await initDb();
  const app = Fastify({ logger: { level: "info" } });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // Global error handler
  app.setErrorHandler((error, req, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 500).send({
      success: false,
      action: "error",
      network: process.env.CELO_NETWORK ?? "alfajores",
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

  await app.listen({ port: PORT, host: HOST });
  console.log(`[CeloMind API] Listening on http://${HOST}:${PORT}`);
  console.log(`[CeloMind API] Network: ${process.env.CELO_NETWORK ?? "alfajores"}`);
}

main().catch((e) => {
  console.error("[CeloMind API] Fatal startup error:", e);
  process.exit(1);
});
