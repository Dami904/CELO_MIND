import type { FastifyInstance } from "fastify";
import { makeOk, makeErr, WhaleWatchRequestSchema , resolveNetwork } from "@celomind/shared";
import { getWhaleWalletActivity, analyzeCopyWallet } from "@celomind/mcp-server/whale";
import { addWatchedWallet } from "../db/sqlite.js";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);

export async function whaleRoutes(app: FastifyInstance) {
  app.post("/api/whales/watch", async (req, reply) => {
    const parsed = WhaleWatchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(makeErr("whale_watch", NETWORK, "VALIDATION_ERROR", parsed.error.message));
    }
    const { walletAddress, label, network } = parsed.data;
    const net = network ?? NETWORK;

    try {
      const profile = await getWhaleWalletActivity(walletAddress, net, label);
      void addWatchedWallet(walletAddress, label, net);
      return makeOk("whale_watch", net, profile, { type: "result_card" });
    } catch (e: unknown) {
      return reply.code(500).send(makeErr("whale_watch", net, "FETCH_ERROR", String(e)));
    }
  });

  app.get<{ Params: { address: string }; Querystring: { compare?: string; network?: string } }>(
    "/api/whales/:address/analyze",
    async (req, reply) => {
      const { address } = req.params;
      const { compare } = req.query;
      const net = NETWORK; // mainnet-only

      if (!compare) {
        return reply.code(400).send(makeErr("copy_wallet", net, "MISSING_PARAM", "Provide ?compare=<your_wallet_address>"));
      }

      try {
        const analysis = await analyzeCopyWallet(address, compare, net);
        return makeOk("copy_wallet_analyze", net, analysis, { type: "result_card" });
      } catch (e: unknown) {
        return reply.code(500).send(makeErr("copy_wallet_analyze", net, "ANALYSIS_ERROR", String(e)));
      }
    }
  );
}
