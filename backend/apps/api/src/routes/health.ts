import type { FastifyInstance } from "fastify";
import { makeOk , resolveNetwork } from "@celomind/shared";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    return makeOk("health_check", NETWORK, {
      status: "ok",
      version: "1.0.0",
      network: NETWORK,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });
}
