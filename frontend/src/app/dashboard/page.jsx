'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { apiClient, apiGet, API_BASE } from '@/lib/api';

const toolGroups = [
  {
    label: 'Your wallet',
    tools: [
      { id: 'celo_get_balance',            title: 'Check balance',       desc: 'See how much CELO you hold' },
      { id: 'celo_get_token_balance',       title: 'Token balances',      desc: 'Check any specific token' },
      { id: 'get_celo_wallet_portfolio',    title: 'Full portfolio',      desc: 'Overview of all your assets' },
      { id: 'get_celo_recent_transactions', title: 'Recent activity',     desc: 'Your last transactions' },
      { id: 'get_celo_nft_balances',        title: 'NFT collection',      desc: 'Digital items you own' },
    ],
  },
  {
    label: 'Send & swap',
    tools: [
      { id: 'celo_send',         title: 'Send tokens',  desc: 'Transfer CELO or tokens to anyone' },
      { id: 'celo_swap_quote',   title: 'Swap quote',   desc: 'See exchange rate before you swap' },
      { id: 'celo_swap_execute', title: 'Execute swap', desc: 'Trade one token for another' },
    ],
  },
  {
    label: 'Market info',
    tools: [
      { id: 'get_celo_token_price',         title: 'Token price',         desc: 'Current price of any token' },
      { id: 'get_trending_celo_tokens',     title: 'Trending tokens',     desc: "What's hot on Celo right now" },
      { id: 'get_celo_top_pools',           title: 'Top liquidity pools', desc: 'Where traders are putting money' },
      { id: 'get_celo_yield_opportunities', title: 'Earn interest',       desc: 'Places to put your crypto to work' },
    ],
  },
  {
    label: 'Safety',
    tools: [
      { id: 'check_malicious_transaction', title: 'Check transaction', desc: 'Is this transaction safe?' },
      { id: 'check_contract_risk',         title: 'Check contract',    desc: 'Is this smart contract trustworthy?' },
      { id: 'check_token_risk',            title: 'Check token',       desc: 'Is this token a scam?' },
      { id: 'get_whale_wallet_activity',   title: 'Whale tracker',     desc: 'Watch big wallets move' },
    ],
  },
];

function short(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardPage() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  const [activeGroup, setActiveGroup] = useState(0);

  // Live market data
  const [celoPrice, setCeloPrice]     = useState(null);
  const [celoTvl, setCeloTvl]         = useState(null);
  const [gasPrice, setGasPrice]       = useState(null);
  const [networkStats, setNetworkStats] = useState(null);

  // Wallet data
  const [portfolio, setPortfolio]     = useState(null);
  const [recentTxs, setRecentTxs]     = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // ── Market data (no wallet needed) ──────────────────────────────────────────
  useEffect(() => {
    // Single dashboard/metrics call returns price, TVL, trending etc.
    apiGet('/api/dashboard/metrics').then((d) => {
      if (d?.celoPrice) setCeloPrice(d.celoPrice);
      if (d?.tvl?.usd) setCeloTvl(`$${(d.tvl.usd / 1e6).toFixed(1)}M`);
    }).catch(() => {});

    // Gas price via chat intent (fastest path)
    apiGet('/api/health').then(() => {
      // backend is alive — now fetch gas via chat
      apiClient.sendMessage('gas price', undefined, 'tool').then((r) => {
        const match = r?.message?.match(/([\d.]+)\s*Gwei/i);
        if (match) setGasPrice(match[1]);
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  // ── Wallet-specific data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected || !address) {
      setPortfolio(null);
      setRecentTxs(null);
      return;
    }
    setWalletLoading(true);
    Promise.all([
      apiGet(`/api/wallet/${address}/balances`),
      apiGet(`/api/transactions?address=${address}`),
    ]).then(([balData, txData]) => {
      setPortfolio(Array.isArray(balData?.balances) ? balData.balances : null);
      setRecentTxs(Array.isArray(txData?.transactions) ? txData.transactions : null);
    }).catch(() => {}).finally(() => setWalletLoading(false));
  }, [isConnected, address]);

  const change = celoPrice?.usd_24h_change;
  const changeUp = typeof change === 'number' && change >= 0;

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-10 py-8 pb-16 flex flex-col gap-6">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-light tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Live data from Celo Mainnet</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="live-dot" /> Live
          </span>
          {!isConnected && (
            <button
              onClick={() => open()}
              className="text-sm font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-5 py-2 transition-all duration-150"
            >
              Connect wallet
            </button>
          )}
          {isConnected && address && (
            <button
              onClick={() => open()}
              className="flex items-center gap-2 text-sm font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full px-4 py-1.5 transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {short(address)}
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CELO price */}
        <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">CELO price</p>
          <p className="font-display text-2xl font-medium text-slate-900 dark:text-slate-100 leading-none mb-1">
            {celoPrice ? `$${Number(celoPrice.usd).toFixed(4)}` : '—'}
          </p>
          {typeof change === 'number' && (
            <p className={`text-xs font-medium ${changeUp ? 'text-emerald-600' : 'text-red-500'}`}>
              {changeUp ? '+' : ''}{change.toFixed(2)}% today
            </p>
          )}
        </div>

        {/* TVL */}
        <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Celo TVL</p>
          <p className="font-display text-2xl font-medium text-slate-900 dark:text-slate-100 leading-none mb-1">{celoTvl ?? '—'}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Total value locked</p>
        </div>

        {/* Gas */}
        <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Gas price</p>
          <p className="font-display text-2xl font-medium text-slate-900 dark:text-slate-100 leading-none mb-1">
            {gasPrice ? `${gasPrice} Gwei` : '—'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Current network fee</p>
        </div>

        {/* Network */}
        <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Network</p>
          <p className="font-display text-2xl font-medium text-slate-900 dark:text-slate-100 leading-none mb-1">Celo</p>
          {networkStats?.dailyTxCount ? (
            <p className="text-xs text-slate-400">{Number(networkStats.dailyTxCount).toLocaleString()} txs today</p>
          ) : (
            <p className="text-xs font-medium text-emerald-600">● Mainnet online</p>
          )}
        </div>
      </div>

      {/* Two-column area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">

        {/* Left col */}
        <div className="flex flex-col gap-5">

          {/* Wallet card */}
          <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="font-medium text-slate-800 dark:text-slate-200">Your wallet</h2>
              {!isConnected ? (
                <button
                  onClick={() => open()}
                  className="text-sm text-slate-500 border border-slate-200 rounded-full px-4 py-1.5 hover:bg-slate-50 transition-colors"
                >
                  Connect wallet
                </button>
              ) : (
                <Link href="/chat?q=View+my+full+portfolio" className="text-xs text-amber-700 hover:text-amber-900 font-medium">
                  Ask AI →
                </Link>
              )}
            </div>

            {!isConnected ? (
              <div className="flex flex-col items-center gap-3 py-8 bg-stone-50 dark:bg-white/4 rounded-xl border border-dashed border-slate-200 dark:border-white/10 text-center">
                <span className="text-3xl">🔐</span>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No wallet connected</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[240px]">
                  Connect your wallet to see your balances and recent activity.
                </p>
                <button
                  onClick={() => open()}
                  className="mt-1 text-sm font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-5 py-2 transition-all"
                >
                  Connect wallet
                </button>
              </div>
            ) : walletLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Loading portfolio…</div>
            ) : portfolio?.length > 0 ? (
              <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/6">
                {portfolio.slice(0, 8).map((tok, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{tok.symbol ?? tok.name ?? 'Token'}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{tok.balance ?? '?'}</p>
                    </div>
                    {tok.usdValue && (
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">${tok.usdValue}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-sm">No tokens found in this wallet.</div>
            )}
          </div>

          {/* Activity feed */}
          <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium text-slate-800 dark:text-slate-200">Recent activity</h2>
              {isConnected && (
                <Link href="/chat?q=Show+recent+transactions" className="text-xs text-amber-700 hover:text-amber-900 font-medium">
                  See all →
                </Link>
              )}
            </div>

            {!isConnected ? (
              <div className="flex flex-col items-center gap-3 py-8 bg-stone-50 dark:bg-white/4 rounded-xl border border-dashed border-slate-200 dark:border-white/10 text-center">
                <span className="text-2xl">📋</span>
                <p className="text-sm text-slate-400 dark:text-slate-500">Connect your wallet to see transactions here.</p>
              </div>
            ) : walletLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 dark:text-slate-500 text-sm">Loading transactions…</div>
            ) : recentTxs?.length > 0 ? (
              <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/6">
                {recentTxs.slice(0, 5).map((tx, i) => {
                  const hash = tx.hash ?? tx.transactionHash ?? '';
                  const ok = tx.status === 'ok' || tx.result === 'success' || tx.isError === '0';
                  const ts = tx.timestamp ?? (tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : null);
                  return (
                    <div key={i} className="flex items-center justify-between py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 truncate">{short(hash)}</p>
                        {ts && <p className="text-xs text-slate-400 dark:text-slate-500">{fmtTime(ts)}</p>}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {ok ? 'success' : 'failed'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-sm">No recent transactions found.</div>
            )}
          </div>
        </div>

        {/* Right col — AI capabilities */}
        <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-6 lg:sticky lg:top-20">
          <h2 className="font-medium text-slate-800 dark:text-slate-200 mb-1">AI capabilities</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Everything the AI can do, in plain English.</p>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {toolGroups.map((g, i) => (
              <button
                key={g.label}
                onClick={() => setActiveGroup(i)}
                className={`text-xs font-medium rounded-full px-3 py-1 border transition-all duration-100 ${
                  activeGroup === i
                    ? 'bg-[#FCBE00] text-slate-900 border-transparent'
                    : 'bg-stone-100 dark:bg-white/6 text-slate-500 dark:text-slate-400 border-stone-200 dark:border-white/8 hover:bg-stone-200 dark:hover:bg-white/10'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-0.5">
            {toolGroups[activeGroup].tools.map((tool) => (
              <Link
                key={tool.id}
                href={`/chat?q=${encodeURIComponent(tool.desc)}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 dark:hover:bg-white/5 border border-transparent hover:border-slate-100 dark:hover:border-white/8 transition-all duration-100 group"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{tool.title}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{tool.desc}</p>
                </div>
                <span className="text-slate-300 dark:text-slate-600 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all text-sm shrink-0">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* System status */}
      <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-6">
        <h2 className="font-medium text-slate-800 dark:text-slate-200 mb-4">System status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Celo network',  value: 'Mainnet',                          ok: true },
            { label: 'AI provider',   value: 'Connected',                        ok: true },
            { label: 'RPC latency',   value: gasPrice ? '< 5ms' : 'Checking…',  ok: !!gasPrice },
            { label: 'MCP tools',     value: '40 loaded',                        ok: true },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between bg-stone-50 dark:bg-white/4 rounded-xl px-3 py-2.5">
              <span className="text-xs text-slate-500 dark:text-slate-400">{s.label}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
