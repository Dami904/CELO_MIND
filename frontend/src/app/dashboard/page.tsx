'use client'

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { apiGet } from "@/lib/api";
import { truncateAddress } from "@/lib/utils";
import CountUp from "@/components/motion/CountUp";

function Skel({ className = "" }: { className?: string }) {
  return <span className={`inline-block rounded animate-shimmer align-middle ${className}`} />;
}

type MarketItem = { type: string; tag: string; name: string; desc: string; time: string; change?: string; isPositive?: boolean };
type RiskItem = { level: "HIGH" | "MED" | "LOW"; title: string; desc: string; time: string };

type DashboardMetrics = {
  celoPrice?: { usd?: number; usd_24h_change?: number } | null;
  tvl?: { usd?: number; change1d?: number } | null;
  trendingTokens?: { name: string; priceUsd?: string; change24h?: string; volume24h?: string }[];
  marketFeed?: MarketItem[];
  riskFeed?: RiskItem[];
};

type MetricsOverview = {
  totals: { chatRequests: number; toolCalls: number; modelCalls: number; fallbacks: number; errors: number };
  uniqueUsers: number; uniqueSessions: number; fallbackRate: number;
  topTool: string | null; topIntent: string | null; topProvider: string | null;
};

type WalletBalance = { symbol: string; name: string; balance: string; usdValue?: string | number | null };
type WalletBalances = { address: string; balances: WalletBalance[]; source?: string };
type TransactionItem = {
  hash?: string; method?: string | null; status?: string | null; result?: string | null;
  timestamp?: string | null; from?: { hash?: string } | null; to?: { hash?: string } | null; value?: string | null;
};
type Transactions = { address: string; transactions: TransactionItem[]; source?: string };

// All 35 CeloMind MCP tools — shown in the "Available MCP Tools" panel.
const ALL_MCP_TOOLS = [
  "celo_get_balance", "celo_get_token_balance", "celo_send", "celo_swap_quote",
  "celo_swap_execute", "prepare_celo_swap", "celo_aave_position", "celo_aave_supply",
  "self_verify", "self_agent_id_check", "x402_pay", "celo_docs_explain",
  "get_celo_gas_price", "get_celo_network_stats", "get_celo_defi_protocols",
  "get_celo_yield_opportunities", "get_trending_celo_tokens", "get_celo_top_pools",
  "get_celo_top_tokens_by_holders", "get_celo_top_tokens_by_market_cap",
  "get_recently_launched_celo_tokens", "search_celo_tokens", "get_celo_token_price",
  "get_celo_price_history", "get_celo_token_info", "get_celo_token_holders",
  "get_celo_wallet_portfolio", "get_celo_wallet_stats", "get_celo_nft_balances",
  "get_celo_recent_transactions", "check_malicious_transaction", "check_contract_risk",
  "check_token_risk", "explain_transaction_risk", "get_whale_wallet_activity",
  "compare_wallets", "analyze_copy_wallet_strategy", "get_portfolio_risk_score",
];

function fmtUsd(value?: number | string | null): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtBalance(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1 ? 4 : 8 });
}

function shortHash(hash?: string): string {
  if (!hash) return "unknown";
  return hash.length > 18 ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : hash;
}

function txStatus(tx: TransactionItem): string {
  const raw = tx.status ?? tx.result ?? "pending";
  return raw === "ok" || raw === "success" ? "confirmed" : raw;
}

const CARD = "bg-surface border border-border flex flex-col";

const RISK_COLOR: Record<string, string> = {
  HIGH: "text-error border-error/20 bg-error/10",
  MED: "text-yellow-400 border-yellow-400/20 bg-yellow-400/10",
  LOW: "text-muted border-border2 bg-dark/20",
};

const TAG_COLOR: Record<string, string> = {
  TRENDING: "text-cg border-cg/25 bg-cg/10",
  NEW: "text-cy border-cy/25 bg-cy/10",
  WHALE: "text-purple-400 border-purple-400/25 bg-purple-400/10",
  LAUNCH: "text-cy border-cy/25 bg-cy/10",
  ALERT: "text-error border-error/25 bg-error/10",
  PUMP: "text-cg border-cg/25 bg-cg/10",
  TVL: "text-text border-border2 bg-dark/20",
  MARKET: "text-cy border-cy/25 bg-cy/10",
  LIQUIDITY: "text-purple-400 border-purple-400/25 bg-purple-400/10",
};

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [wallet, setWallet] = useState<WalletBalances | null>(null);
  const [transactions, setTransactions] = useState<Transactions | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);

  useEffect(() => {
    let active = true;
    function fetchMetrics() {
      setLoading(true);
      Promise.all([
        apiGet<DashboardMetrics>("/api/dashboard/metrics"),
        apiGet<MetricsOverview>("/api/metrics/overview"),
      ]).then(([nextMetrics, nextOverview]) => {
        if (!active) return;
        setMetrics(nextMetrics);
        setOverview(nextOverview);
        setLoading(false);
      });
    }
    fetchMetrics();
    const id = setInterval(fetchMetrics, 60_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let active = true;
    if (!address) {
      setWallet(null); setTransactions(null); setWalletLoading(false);
      return () => { active = false; };
    }
    setWalletLoading(true);
    Promise.all([
      apiGet<WalletBalances>(`/api/wallet/${address}/balances`),
      apiGet<Transactions>(`/api/transactions?address=${address}`),
    ]).then(([nextWallet, nextTxs]) => {
      if (!active) return;
      setWallet(nextWallet); setTransactions(nextTxs); setWalletLoading(false);
    });
    return () => { active = false; };
  }, [address]);

  const topBalances = useMemo(() => {
    const b = wallet?.balances ?? [];
    return b.filter((item) => Number(item.balance) > 0 || item.symbol === "CELO").slice(0, 3);
  }, [wallet]);

  const txs = transactions?.transactions.slice(0, 6) ?? [];
  const celoPrice = metrics?.celoPrice?.usd;
  const celoChange = metrics?.celoPrice?.usd_24h_change;
  const tvlUsd = metrics?.tvl?.usd;
  const marketFeed = metrics?.marketFeed ?? [];
  const riskFeed = metrics?.riskFeed ?? [];

  return (
    <div className="flex-1 flex flex-col bg-dark text-text p-4 md:p-6 overflow-y-auto custom-scroll">
      {/* Header */}
      <div className="flex justify-between items-center gap-3 flex-wrap mb-6 border-b border-border pb-4">
        <div>
          <span className="text-2xs font-mono uppercase tracking-widest text-muted">Management Console</span>
          <h2 className="text-xl md:text-2xl font-syne font-extrabold uppercase tracking-tight text-text">Command Center</h2>
        </div>
        <div className="flex items-center gap-2 border border-cg/20 bg-cg/5 text-cg px-3 py-1 font-mono text-2xs uppercase font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-cg animate-pulse" />
          Celo Mainnet · refreshes every 60s
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">CELO Price</span>
          <span className="block text-xl font-mono font-bold text-text mt-1">
            {loading ? <Skel className="h-5 w-20" /> : typeof celoPrice === "number" ? <CountUp value={celoPrice} prefix="$" decimals={4} /> : "—"}
          </span>
          <div className={`mt-2 text-2xs font-mono ${(celoChange ?? 0) >= 0 ? "text-cg" : "text-error"}`}>
            {typeof celoChange === "number" ? `${celoChange >= 0 ? "+" : ""}${celoChange.toFixed(2)}%` : "—"} <span className="text-muted">(24h)</span>
          </div>
        </div>

        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">Celo TVL</span>
          <span className="block text-xl font-mono font-bold text-text mt-1">
            {loading ? <Skel className="h-5 w-24" /> : typeof tvlUsd === "number" ? <CountUp value={tvlUsd} prefix="$" /> : "—"}
          </span>
          <div className={`mt-2 text-2xs font-mono ${(metrics?.tvl?.change1d ?? 0) >= 0 ? "text-cg" : "text-error"}`}>
            {typeof metrics?.tvl?.change1d === "number" ? `${metrics.tvl.change1d >= 0 ? "+" : ""}${metrics.tvl.change1d.toFixed(2)}%` : "—"} <span className="text-muted">(1d)</span>
          </div>
        </div>

        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">Chat Messages</span>
          <span className="block text-xl font-mono font-bold text-cy mt-1">
            {loading ? <Skel className="h-5 w-16" /> : <CountUp value={overview?.totals.chatRequests ?? 0} />}
          </span>
          <div className="mt-2 text-2xs font-mono text-muted">
            Sessions: {loading ? "—" : (overview?.uniqueSessions ?? 0)}
          </div>
        </div>

        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">Unique Users</span>
          <span className="block text-xl font-mono font-bold text-text mt-1">
            {loading ? <Skel className="h-5 w-16" /> : <CountUp value={overview?.uniqueUsers ?? 0} />}
          </span>
          <div className="mt-2 text-2xs font-mono text-muted">
            AI: <span className="text-cg font-bold">{overview?.topProvider ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Wallet Summary */}
          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3 flex justify-between items-center">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Wallet Summary</span>
              <span className="text-2xs font-mono text-muted">{isConnected ? truncateAddress(address) : "No wallet connected"}</span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {!isConnected && (
                <div className="md:col-span-3 border border-border2 bg-dark/20 p-3.5 text-xs text-muted font-mono">
                  Connect a wallet to load live balances.
                </div>
              )}
              {isConnected && walletLoading && [0, 1, 2].map((i) => <div key={i} className="h-16 border border-border2 bg-dark/20 animate-shimmer" />)}
              {isConnected && !walletLoading && !topBalances.length && (
                <div className="md:col-span-3 border border-border2 bg-dark/20 p-3.5 text-xs text-muted font-mono">No balances returned yet.</div>
              )}
              {!walletLoading && topBalances.map((item) => (
                <div key={`${item.symbol}-${item.name}`} className="border border-border2 bg-dark/20 p-3.5 flex flex-col">
                  <span className="text-2xs text-muted font-mono uppercase">{item.symbol}</span>
                  <span className="text-lg font-mono font-bold text-text mt-1">{fmtBalance(item.balance)}</span>
                  <span className="text-[10px] text-muted font-mono mt-0.5">{fmtUsd(item.usdValue)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Activity Feed</span>
            </div>
            <div className="divide-y divide-border2">
              {!isConnected && <div className="px-4 py-3.5 text-xs text-muted font-mono">Connect a wallet to load recent transactions.</div>}
              {isConnected && walletLoading && [0, 1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3.5"><Skel className="h-4 w-2/3" /></div>
              ))}
              {isConnected && !walletLoading && !txs.length && (
                <div className="px-4 py-3.5 text-xs text-muted font-mono">No recent transactions found.</div>
              )}
              {!walletLoading && txs.map((item) => {
                const status = txStatus(item);
                return (
                  <div key={item.hash ?? Math.random().toString()} className="px-4 py-3.5 flex items-center justify-between gap-4 text-xs font-mono">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-6 h-6 flex items-center justify-center border font-bold text-[10px] ${status === "pending" ? "border-cy/30 bg-cy/5 text-cy" : "border-border2 bg-dark text-muted"}`}>
                        {status === "pending" ? "···" : "OK"}
                      </span>
                      <span className="text-text truncate">{item.method ?? "tx"} {shortHash(item.hash)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-2xs text-muted shrink-0">
                      <span>{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : "recent"}</span>
                      <span className={`px-1.5 py-0.5 border uppercase ${status === "pending" ? "border-cy/25 bg-cy/5 text-cy" : "border-border2 bg-dark/40 text-muted"}`}>{status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Available MCP Tools */}
          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3 flex justify-between items-center">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Available MCP Tools</span>
              <span className="text-2xs font-mono text-muted">{ALL_MCP_TOOLS.length} tools</span>
            </div>
            <div className="p-4 flex flex-wrap gap-1.5">
              {ALL_MCP_TOOLS.map((tool) => (
                <span key={tool} className="bg-dark border border-border2 text-muted hover:border-cy hover:text-text px-2 py-1 font-mono text-[10px] transition-colors">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1/3 */}
        <div className="flex flex-col gap-6">
          {/* Market Watch */}
          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3 flex justify-between items-center">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Market Watch</span>
              <span className="text-[9px] font-mono text-muted uppercase">live · GeckoTerminal</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {loading && [0, 1, 2].map((i) => <div key={i} className="h-14 border border-border2 bg-dark/20 animate-shimmer" />)}
              {!loading && marketFeed.length === 0 && (
                <div className="text-muted font-mono text-[10px] p-2">No market data yet — check back shortly.</div>
              )}
              {!loading && marketFeed.map((item, i) => {
                const tagClass = TAG_COLOR[item.tag] ?? TAG_COLOR[item.type] ?? "text-muted border-border2 bg-dark/20";
                return (
                  <div key={i} className="border border-border2 bg-dark/20 p-3 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center gap-2">
                      <span className={`px-1.5 py-0.5 border text-[9px] font-mono font-bold tracking-wide ${tagClass}`}>
                        [{item.type}]
                      </span>
                      <div className="flex items-center gap-2">
                        {item.change && (
                          <span className={`text-[10px] font-mono font-bold ${item.isPositive ? "text-cg" : "text-error"}`}>
                            {item.change}
                          </span>
                        )}
                        <span className="text-[9px] text-muted font-mono">{item.time}</span>
                      </div>
                    </div>
                    <p className="text-xs font-mono leading-snug">
                      <span className="text-text font-bold">{item.name}</span>{" "}
                      <span className="text-muted">{item.desc}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Risk Monitor */}
          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3 flex justify-between items-center">
              <span className="text-2xs font-mono uppercase tracking-widest text-error font-bold">Risk Monitor</span>
              <span className="text-[9px] font-mono text-muted uppercase">DefiLlama Hacks</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {loading && [0, 1].map((i) => <div key={i} className="h-14 border border-border2 bg-dark/20 animate-shimmer" />)}
              {!loading && riskFeed.length === 0 && (
                <div className="text-muted font-mono text-[10px] p-2">No risk alerts detected.</div>
              )}
              {!loading && riskFeed.map((item, i) => {
                const cls = RISK_COLOR[item.level] ?? RISK_COLOR.LOW;
                return (
                  <div key={i} className={`border p-3 flex flex-col gap-1.5 ${cls}`}>
                    <div className="flex justify-between items-center">
                      <span className={`px-1.5 py-0.5 border text-[9px] font-mono font-bold tracking-wide ${cls}`}>
                        [{item.level} RISK]
                      </span>
                      <span className="text-[9px] font-mono opacity-70">{item.time}</span>
                    </div>
                    <p className="text-xs font-mono leading-snug">
                      <span className="font-bold">{item.title}:</span>{" "}
                      <span className="opacity-80">{item.desc}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Server Diagnostic */}
          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Server Diagnostic</span>
            </div>
            <div className="p-4 font-mono text-2xs flex flex-col gap-2.5">
              <div className="flex justify-between gap-3">
                <span className="text-muted">NETWORK</span>
                <span className="text-text font-bold">CELO MAINNET</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">AI PROVIDER</span>
                <span className="text-cg font-bold">{loading ? "—" : (overview?.topProvider?.toUpperCase() ?? "NONE")}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">FALLBACK RATE</span>
                <span className={`font-bold ${(overview?.fallbackRate ?? 0) > 0.2 ? "text-yellow-400" : "text-cg"}`}>
                  {loading ? "—" : `${((overview?.fallbackRate ?? 0) * 100).toFixed(1)}%`}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">ERRORS</span>
                <span className={`font-bold ${(overview?.totals.errors ?? 0) > 0 ? "text-error" : "text-cg"}`}>
                  {loading ? "—" : (overview?.totals.errors ?? 0)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">MCP TOOLS</span>
                <span className="text-text font-bold">{ALL_MCP_TOOLS.length} loaded</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
