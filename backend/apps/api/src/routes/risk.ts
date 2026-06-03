import type { FastifyInstance } from "fastify";
import { makeOk, makeErr, RiskCheckRequestSchema , resolveNetwork } from "@celomind/shared";
import { checkContractRisk, checkTokenRisk, checkMaliciousTransaction } from "@celomind/mcp-server/risk";
import { logRiskCheck } from "../db/sqlite.js";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);

export async function riskRoutes(app: FastifyInstance) {
  app.post("/api/risk/check", async (req, reply) => {
    const parsed = RiskCheckRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(makeErr("risk_check", NETWORK, "VALIDATION_ERROR", parsed.error.message));
    }
    const { type, target, network } = parsed.data;
    const net = network ?? NETWORK;

    try {
      let report;
      if (type === "contract") report = await checkContractRisk(target, net);
      else if (type === "token") report = await checkTokenRisk(target, net);
      else report = await checkMaliciousTransaction(target, net);

      void logRiskCheck({ ...report, network: net });

      return makeOk("risk_check", net, report, { type: "risk_card" });
    } catch (e: unknown) {
      return reply.code(500).send(makeErr("risk_check", net, "ANALYSIS_ERROR", String(e)));
    }
  });
}
