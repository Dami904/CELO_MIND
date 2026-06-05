'use client'

import React, { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { apiGet } from "@/lib/api";
import { truncateAddress } from "@/lib/utils";
import CountUp from "@/components/motion/CountUp";

/** Shimmer placeholder bar for loading states. */
function Skel({ className = "" }: { className?: string }) {
  return <span className={`inline-block rounded animate-shimmer align-middle ${className}`} />;
}

type DashboardMetrics = {
  celoPrice?: { usd?: number; usd_24h_change?: number } | null;
  tvl?: { usd?: number; change1d?: number } | null;
  trendingTokens?: { name: string; symbol: string; priceUsd?: string }[];
};

type MetricsOverview = {
  totals: {
    chatRequests: number;
    toolCalls: number;
    modelCalls: number;
    fallbacks: number;
    errors: number;
  };
  uniqueUsers: number;
  uniqueSessions: number;
  fallbackRate: number;
  topTool: string | null;
  topIntent: string | null;
  topProvider: string | null;
};

type MetricsTools = {
  tools: { tool: string; count: number }[];
};

type WalletBalance = {
  symbol: string;
  name: string;
  balance: string;
  usdValue?: string | number | null;
};

type WalletBalances = {
  address: string;
  balances: WalletBalance[];
  source?: string;
};

type TransactionItem = {
  hash?: string;
  method?: string | null;
  status?: string | null;
  result?: string | null;
  timestamp?: string | null;
  from?: { hash?: string } | null;
  to?: { hash?: string } | null;
  value?: string | null;
};

type Transactions = {
  address: string;
  transactions: TransactionItem[];
  source?: string;
};

function fmtUsd(value?: number | string | null): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return "No data";
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

function txLabel(tx: TransactionItem): string {
  const method = tx.method ?? "transaction";
  return `${method} ${shortHash(tx.hash)}`;
}

const CARD = "bg-surface border border-border flex flex-col";

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [tools, setTools] = useState<MetricsTools | null>(null);
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
        apiGet<MetricsTools>("/api/metrics/tools"),
      ]).then(([nextMetrics, nextOverview, nextTools]) => {
        if (!active) return;
        setMetrics(nextMetrics);
        setOverview(nextOverview);
        setTools(nextTools);
        setLoading(false);
      });
    }

    fetchMetrics();
    // Refresh price/TVL/activity every 60 s while the dashboard is open.
    const id = setInterval(fetchMetrics, 60_000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!address) {
      setWallet(null);
      setTransactions(null);
      setWalletLoading(false);
      return () => {
        active = false;
      };
    }

    setWalletLoading(true);
    Promise.all([
      apiGet<WalletBalances>(`/api/wallet/${address}/balances`),
      apiGet<Transactions>(`/api/transactions?address=${address}`),
    ]).then(([nextWallet, nextTransactions]) => {
      if (!active) return;
      setWallet(nextWallet);
      setTransactions(nextTransactions);
      setWalletLoading(false);
    });

    return () => {
      active = false;
    };
  }, [address]);

  const topBalances = useMemo(() => {
    const balances = wallet?.balances ?? [];
    return balances
      .filter((item) => Number(item.balance) > 0 || item.symbol === "CELO")
      .slice(0, 3);
  }, [wallet]);

  const activeTools = tools?.tools.slice(0, 8) ?? [];
  const txs = transactions?.transactions.slice(0, 6) ?? [];
  const celoPrice = metrics?.celoPrice?.usd;
  const celoChange = metrics?.celoPrice?.usd_24h_change;
  const tvlUsd = metrics?.tvl?.usd;

  const whaleAlerts = [
    { asset: "Live trend", desc: metrics?.trendingTokens?.[0]?.name ?? "waiting for GeckoTerminal", type: "MARKET", time: loading ? "loading" : "now" },
    { asset: "TVL", desc: typeof tvlUsd === "number" ? `${fmtUsd(tvlUsd)} tracked by DefiLlama` : "not available", type: "CELO", time: "live" },
  ];

  const riskAlerts = [
    { title: "Backend errors", desc: `${overview?.totals.errors ?? 0} recorded tool/chat errors`, level: overview?.totals.errors ? "MED" : "LOW", time: "live" },
    { title: "Fallback rate", desc: `${(((overview?.fallbackRate ?? 0) * 100)).toFixed(1)}% AI fallback usage`, level: (overview?.fallbackRate ?? 0) > 0.2 ? "MED" : "LOW", time: "live" },
  ];

  return (
    <div className="flex-1 flex flex-col bg-dark text-text p-4 md:p-6 overflow-y-auto custom-scroll">
      <div className="flex justify-between items-center gap-3 flex-wrap mb-6 border-b border-border pb-4">
        <div>
          <span className="text-2xs font-mono uppercase tracking-widest text-muted">Management Console</span>
          <h2 className="text-xl md:text-2xl font-syne font-extrabold uppercase tracking-tight text-text">Command Center</h2>
        </div>
        <div className="flex items-center gap-2 border border-cg/20 bg-cg/5 text-cg px-3 py-1 font-mono text-2xs uppercase font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-cg animate-pulse"></span>
          Celo Mainnet
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">CELO Price</span>
            <span className="block text-xl font-mono font-bold text-text mt-1">
              {loading ? <Skel className="h-5 w-20" /> : typeof celoPrice === "number" ? <CountUp value={celoPrice} prefix="$" decimals={2} /> : "No data"}
            </span>
          </div>
          <div className={`mt-2 text-2xs font-mono ${(celoChange ?? 0) >= 0 ? "text-cg" : "text-error"}`}>
            {typeof celoChange === "number" ? `${celoChange >= 0 ? "+" : ""}${celoChange.toFixed(2)}%` : "No change"} <span className="text-muted">(24h)</span>
          </div>
        </div>

        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">Celo TVL</span>
            <span className="block text-xl font-mono font-bold text-text mt-1">
              {loading ? <Skel className="h-5 w-24" /> : typeof tvlUsd === "number" ? <CountUp value={tvlUsd} prefix="$" /> : "No data"}
            </span>
          </div>
          <div className={`mt-2 text-2xs font-mono ${(metrics?.tvl?.change1d ?? 0) >= 0 ? "text-cg" : "text-error"}`}>
            {typeof metrics?.tvl?.change1d === "number" ? `${metrics.tvl.change1d >= 0 ? "+" : ""}${metrics.tvl.change1d.toFixed(2)}%` : "No change"} <span className="text-muted">(1d)</span>
          </div>
        </div>

        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">MCP Tool Calls</span>
            <span className="block text-xl font-mono font-bold text-cy mt-1">
              {loading ? <Skel className="h-5 w-16" /> : <CountUp value={overview?.totals.toolCalls ?? 0} />}
            </span>
          </div>
          <div className="mt-2 text-2xs font-mono text-muted">
            Top: {overview?.topTool ?? "none yet"}
          </div>
        </div>

        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">Chat Requests</span>
            <span className="block text-xl font-mono font-bold text-text mt-1">
              {loading ? <Skel className="h-5 w-16" /> : <CountUp value={overview?.totals.chatRequests ?? 0} />}
            </span>
          </div>
          <div className="mt-2 text-2xs font-mono text-cy">
            Sessions: <CountUp value={overview?.uniqueSessions ?? 0} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3 flex justify-between items-center">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Wallet Summary</span>
              <span className="text-2xs font-mono text-muted">
                {isConnected ? truncateAddress(address) : "No wallet connected"}
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {!isConnected && (
                <div className="md:col-span-3 border border-border2 bg-dark/20 p-3.5 text-xs text-muted font-mono">
                  Connect a wallet to load balances from the backend.
                </div>
              )}
              {isConnected && walletLoading &&
                [0, 1, 2].map((i) => <div key={i} className="h-16 border border-border2 bg-dark/20 animate-shimmer" />)}
              {isConnected && !walletLoading && !topBalances.length && (
                <div className="md:col-span-3 border border-border2 bg-dark/20 p-3.5 text-xs text-muted font-mono">
                  No wallet balances returned yet.
                </div>
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

          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Activity Feed</span>
            </div>
            <div className="divide-y divide-border2">
              {!isConnected && (
                <div className="px-4 py-3.5 text-xs text-muted font-mono">Connect a wallet to load recent transactions.</div>
              )}
              {isConnected && walletLoading &&
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className="px-4 py-3.5">
                    <Skel className="h-4 w-2/3" />
                  </div>
                ))}
              {isConnected && !walletLoading && !txs.length && (
                <div className="px-4 py-3.5 text-xs text-muted font-mono">No recent transactions returned.</div>
              )}
              {!walletLoading && txs.map((item) => {
                const status = txStatus(item);
                return (
                  <div key={item.hash ?? Math.random().toString()} className="px-4 py-3.5 flex items-center justify-between gap-4 text-xs font-mono">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-6 h-6 flex items-center justify-center border font-bold ${
                        status === "pending" ? "border-cy/30 bg-cy/5 text-cy" : "border-border2 bg-dark text-muted"
                      }`}>
                        {status === "pending" ? "..." : "OK"}
                      </span>
                      <span className="text-text truncate">{txLabel(item)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-2xs text-muted shrink-0">
                      <span>{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : "recent"}</span>
                      <span className={`px-1.5 py-0.5 border uppercase ${
                        status === "pending"
                          ? "border-cy/25 bg-cy/5 text-cy"
                          : "border-border2 bg-dark/40 text-muted"
                      }`}>
                        {status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Market Watch</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {whaleAlerts.map((item) => (
                <div key={`${item.type}-${item.asset}`} className="border border-border2 bg-dark/20 p-3 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="px-1.5 py-0.5 bg-cy/10 border border-cy/20 text-cy text-[9px] font-mono font-bold tracking-wide">
                      [{item.type}]
                    </span>
                    <span className="text-[9px] text-muted font-mono">{item.time}</span>
                  </div>
                  <p className="text-xs font-mono">
                    <span className="text-text font-bold">{item.asset}</span> <span className="text-muted">{item.desc}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-error font-bold">Risk Monitor</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {riskAlerts.map((item) => (
                <div key={item.title} className="border border-error/15 bg-dark/20 p-3 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="px-1.5 py-0.5 bg-error/10 border border-error/20 text-error text-[9px] font-mono font-bold tracking-wide">
                      [{item.level} RISK]
                    </span>
                    <span className="text-[9px] text-muted font-mono">{item.time}</span>
                  </div>
                  <p className="text-xs font-mono">
                    <span className="text-text font-bold">{item.title}:</span> <span className="text-muted">{item.desc}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className={CARD}>
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Loaded MCP Tools</span>
            </div>
            <div className="p-4 flex flex-wrap gap-1.5">
              {!activeTools.length && <span className="text-muted font-mono text-[10px]">No tool calls recorded yet.</span>}
              {activeTools.map((tool) => (
                <span key={tool.tool} className="bg-dark border border-border2 text-muted px-2 py-1 font-mono text-[10px]">
                  {tool.tool} ({tool.count})
                </span>
              ))}
            </div>
          </div>

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
                <span className="text-muted">TOP INTENT</span>
                <span className="text-cg font-bold">{overview?.topIntent ?? "NONE"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">AI PROVIDER</span>
                <span className="text-cg font-bold">{overview?.topProvider ?? "NONE"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">UNIQUE USERS</span>
                <span className="text-text"><CountUp value={overview?.uniqueUsers ?? 0} /></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
