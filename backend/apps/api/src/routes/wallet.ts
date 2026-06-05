import type { FastifyInstance } from "fastify";
import { makeOk, makeErr, resolveNetwork, resolveRpcUrl } from "@celomind/shared";
import { getTokenBalancesV2, getAddressTxsV2 } from "@celomind/mcp-server/blockscout";
import { logPortfolioSnapshot } from "../db/sqlite.js";

const NETWORK = resolveNetwork(process.env.CELO_NETWORK);
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

async function fetchNativeBalance(address: string, rpcUrl: string) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 }),
  });
  const data = (await res.json()) as { result: string };
  const raw = BigInt(data.result ?? "0x0");
  return { balance: (Number(raw) / 1e18).toFixed(6), balanceRaw: raw.toString() };
}

export async function walletRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>("/api/wallet/:address/balances", async (req, reply) => {
    const { address } = req.params;
    if (!ADDRESS_RE.test(address)) {
      return reply.code(400).send(makeErr("wallet_balances", NETWORK, "INVALID_ADDRESS", "Address must be a valid 0x EVM address"));
    }

    const rpcUrl = resolveRpcUrl(NETWORK);

    try {
      // Native CELO from RPC (always reliable); ERC-20 holdings + USD values from Blockscout v2.
      const [native, tokens] = await Promise.allSettled([
        fetchNativeBalance(address, rpcUrl),
        getTokenBalancesV2(address, NETWORK),
      ]);

      const nativeEntry =
        native.status === "fulfilled"
          ? { symbol: "CELO", name: "Celo", address: "native", decimals: 18, ...native.value, usdValue: null }
          : { symbol: "CELO", name: "Celo", address: "native", decimals: 18, balance: "0", balanceRaw: "0", usdValue: null };

      const raw = [nativeEntry, ...(tokens.status === "fulfilled" ? tokens.value : [])];
      // Blockscout also returns a CELO entry — deduplicate by symbol, keeping the first occurrence (RPC native has accurate balance).
      const seen = new Set<string>();
      const balances = raw.filter((b) => {
        const key = b.symbol.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      void logPortfolioSnapshot(address, NETWORK, balances);

      return makeOk("wallet_balances", NETWORK, { address, balances, source: "Celo RPC + Blockscout" }, { type: "portfolio_card" });
    } catch (e: unknown) {
      return reply.code(500).send(makeErr("wallet_balances", NETWORK, "RPC_ERROR", String(e)));
    }
  });

  app.get<{ Querystring: { address: string; page?: string } }>("/api/transactions", async (req, reply) => {
    const { address } = req.query;
    if (!address || !ADDRESS_RE.test(address)) {
      return reply.code(400).send(makeErr("transactions", NETWORK, "INVALID_ADDRESS", "Provide a valid address query param"));
    }
    try {
      const txs = await getAddressTxsV2(address, NETWORK, 10);
      return makeOk("transactions", NETWORK, { address, transactions: txs, source: "Blockscout" }, { type: "transaction_card" });
    } catch (e: unknown) {
      return reply.code(500).send(makeErr("transactions", NETWORK, "FETCH_ERROR", String(e)));
    }
  });
}
