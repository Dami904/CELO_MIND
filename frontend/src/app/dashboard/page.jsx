'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const toolGroups = [
  {
    label: 'Your wallet',
    tools: [
      { id: 'celo_get_balance',           title: 'Check balance',      desc: 'See how much CELO you hold' },
      { id: 'celo_get_token_balance',      title: 'Token balances',     desc: 'Check any specific token' },
      { id: 'get_celo_wallet_portfolio',   title: 'Full portfolio',     desc: 'Overview of all your assets' },
      { id: 'get_celo_recent_transactions',title: 'Recent activity',    desc: 'Your last transactions' },
      { id: 'get_celo_nft_balances',       title: 'NFT collection',     desc: 'Digital items you own' },
    ],
  },
  {
    label: 'Send & swap',
    tools: [
      { id: 'celo_send',          title: 'Send tokens',   desc: 'Transfer CELO or tokens to anyone' },
      { id: 'celo_swap_quote',    title: 'Swap quote',    desc: 'See exchange rate before you swap' },
      { id: 'celo_swap_execute',  title: 'Execute swap',  desc: 'Trade one token for another' },
    ],
  },
  {
    label: 'Market info',
    tools: [
      { id: 'get_celo_token_price',        title: 'Token price',        desc: 'Current price of any token' },
      { id: 'get_trending_celo_tokens',    title: 'Trending tokens',    desc: "What's hot on Celo right now" },
      { id: 'get_celo_top_pools',          title: 'Top liquidity pools',desc: "Where traders are putting money" },
      { id: 'get_celo_yield_opportunities',title: 'Earn interest',      desc: 'Places to put your crypto to work' },
    ],
  },
  {
    label: 'Safety',
    tools: [
      { id: 'check_malicious_transaction', title: 'Check transaction',  desc: 'Is this transaction safe?' },
      { id: 'check_contract_risk',         title: 'Check contract',     desc: 'Is this smart contract trustworthy?' },
      { id: 'check_token_risk',            title: 'Check token',        desc: 'Is this token a scam?' },
      { id: 'get_whale_wallet_activity',   title: 'Whale tracker',      desc: 'Watch big wallets move' },
    ],
  },
];

const statusItems = [
  { label: 'Celo network',  value: 'Mainnet',   ok: true },
  { label: 'AI provider',   value: 'Connected', ok: true },
  { label: 'RPC latency',   value: '3ms',       ok: true },
  { label: 'MCP tools',     value: '38 loaded', ok: true },
];

export default function DashboardPage() {
  const [celoPrice, setCeloPrice] = useState(null);
  const [activeGroup, setActiveGroup] = useState(0);

  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=celo&vs_currencies=usd&include_24hr_change=true')
      .then((r) => r.json())
      .then((d) => { if (d?.celo) setCeloPrice(d.celo); })
      .catch(() => {});
  }, []);

  const change = celoPrice?.usd_24h_change;
  const changeUp = change >= 0;

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-10 py-8 pb-16 flex flex-col gap-6">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-light tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Live data from Celo Mainnet</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-xs text-slate-400">Updates every 60s</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CELO price */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">CELO price</p>
          <p className="font-display text-2xl font-medium text-slate-900 leading-none mb-1">
            {celoPrice ? `$${Number(celoPrice.usd).toFixed(2)}` : '—'}
          </p>
          {change != null && (
            <p className={`text-xs font-medium ${changeUp ? 'text-emerald-600' : 'text-red-500'}`}>
              {changeUp ? '+' : ''}{change.toFixed(2)}% today
            </p>
          )}
        </div>

        {/* TVL */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Celo TVL</p>
          <p className="font-display text-2xl font-medium text-slate-900 leading-none mb-1">—</p>
          <p className="text-xs text-slate-400">Total value locked</p>
        </div>

        {/* Tools */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">AI tools</p>
          <p className="font-display text-2xl font-medium text-slate-900 leading-none mb-1">38</p>
          <p className="text-xs text-slate-400">All connected</p>
        </div>

        {/* Network */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Network</p>
          <p className="font-display text-2xl font-medium text-slate-900 leading-none mb-1">Celo</p>
          <p className="text-xs font-medium text-emerald-600">● Mainnet online</p>
        </div>
      </div>

      {/* Two-column area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">

        {/* Left col */}
        <div className="flex flex-col gap-5">

          {/* Wallet card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="font-medium text-slate-800">Your wallet</h2>
              <button className="text-sm text-slate-500 border border-slate-200 rounded-full px-4 py-1.5 hover:bg-slate-50 transition-colors">
                Connect wallet
              </button>
            </div>
            <div className="flex flex-col items-center gap-3 py-8 bg-stone-50 rounded-xl border border-dashed border-slate-200 text-center">
              <span className="text-3xl">🔐</span>
              <p className="text-sm font-medium text-slate-700">No wallet connected</p>
              <p className="text-xs text-slate-400 max-w-[240px]">
                Connect your wallet above to see your balances and recent activity.
              </p>
            </div>
          </div>

          {/* Activity feed */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-medium text-slate-800 mb-4">Recent activity</h2>
            <div className="flex flex-col items-center gap-3 py-8 bg-stone-50 rounded-xl border border-dashed border-slate-200 text-center">
              <span className="text-2xl">📋</span>
              <p className="text-sm text-slate-400">Connect your wallet to see transactions here.</p>
            </div>
          </div>
        </div>

        {/* Right col — tools */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:sticky lg:top-20">
          <h2 className="font-medium text-slate-800 mb-1">AI capabilities</h2>
          <p className="text-xs text-slate-400 mb-4">Everything the AI can do, in plain English.</p>

          {/* Group tabs */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {toolGroups.map((g, i) => (
              <button
                key={g.label}
                onClick={() => setActiveGroup(i)}
                className={`text-xs font-medium rounded-full px-3 py-1 border transition-all duration-100 ${
                  activeGroup === i
                    ? 'bg-[#FCBE00] text-slate-900 border-transparent'
                    : 'bg-stone-100 text-slate-500 border-stone-200 hover:bg-stone-200'
                }`}
              >
                {toolGroups[i].label}
              </button>
            ))}
          </div>

          {/* Tool list */}
          <div className="flex flex-col gap-0.5">
            {toolGroups[activeGroup].tools.map((tool) => (
              <Link
                key={tool.id}
                href={`/chat?q=${encodeURIComponent(tool.desc)}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 border border-transparent hover:border-slate-100 transition-all duration-100 group"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{tool.title}</p>
                  <p className="text-xs text-slate-400">{tool.desc}</p>
                </div>
                <span className="text-slate-300 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all text-sm shrink-0">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* System status */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-medium text-slate-800 mb-4">System status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statusItems.map((s) => (
            <div key={s.label} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2.5">
              <span className="text-xs text-slate-500">{s.label}</span>
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
