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
  app.get<{ Params: { address: string }; Querystring: { refresh?: string } }>("/api/wallet/:address/balances", async (req, reply) => {
    const { address } = req.params;
    const force = String(req.query?.refresh ?? "").toLowerCase() === "true";
    if (!ADDRESS_RE.test(address)) {
      return reply.code(400).send(makeErr("wallet_balances", NETWORK, "INVALID_ADDRESS", "Address must be a valid 0x EVM address"));
    }

    const rpcUrl = resolveRpcUrl(NETWORK);

    try {
      // Native CELO from RPC (always reliable); ERC-20 holdings + USD values from Blockscout v2.
      const [native, tokens] = await Promise.allSettled([
        fetchNativeBalance(address, rpcUrl),
        // allow callers to force-refresh Blockscout cache via ?refresh=true
        getTokenBalancesV2(address, NETWORK, force),
      ]);

      const rpcNativeEntry =
        native.status === "fulfilled"
          ? { symbol: "CELO", name: "Celo", address: "native", decimals: 18, ...native.value, usdValue: null }
          : { symbol: "CELO", name: "Celo", address: "native", decimals: 18, balance: "0", balanceRaw: "0", usdValue: null };

      // Put the RPC native entry first so deduplication keeps the RPC value as authoritative.
      const raw = [rpcNativeEntry, ...(tokens.status === "fulfilled" ? tokens.value : [])];
      // Blockscout also returns a CELO entry — deduplicate by symbol, keeping the first occurrence (RPC native has accurate balance).
      const seen = new Set<string>();
      const balances = raw.filter((b) => {
        const key = b.symbol.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      void logPortfolioSnapshot(address, NETWORK, balances);

      // If Blockscout returned a CELO entry, compare it to RPC native balance and log discrepancies.
      let blockscoutCelo: { balance: string; balanceRaw: string } | null = null;
      if (tokens.status === "fulfilled" && Array.isArray(tokens.value)) {
        const found = tokens.value.find((t: any) => String(t.symbol).toLowerCase() === "celo");
        if (found) blockscoutCelo = { balance: found.balance, balanceRaw: found.balanceRaw };
      }

      try {
        if (blockscoutCelo) {
          const rpcVal = Number(rpcNativeEntry.balance);
          const bsVal = Number(blockscoutCelo.balance);
          if (!Number.isNaN(rpcVal) && !Number.isNaN(bsVal) && Math.abs(rpcVal - bsVal) > 0.0001) {
            app.log.warn({ address, rpc: rpcNativeEntry.balance, blockscout: blockscoutCelo.balance }, "RPC vs Blockscout CELO mismatch");
          }
        }
      } catch (e) {
        app.log.error({ err: e }, "Failed comparing RPC vs Blockscout balances");
      }

      // Expose the RPC native balance and sources so UI/chat can show authoritative info.
      return makeOk(
        "wallet_balances",
        NETWORK,
        {
          address,
          balances,
          rpcNativeBalance: { balance: rpcNativeEntry.balance, balanceRaw: rpcNativeEntry.balanceRaw },
          blockscoutCelo: blockscoutCelo,
          sources: { rpc: true, blockscout: tokens.status === "fulfilled", cacheBypassed: force },
        },
        { type: "portfolio_card" }
      );
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
