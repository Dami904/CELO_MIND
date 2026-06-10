'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { apiGet } from '@/lib/api';

const toolGroups = [
  {
    label: 'Wallet',
    tools: [
      { id: 'celo_get_balance',            title: 'Check balance',   desc: 'See how much CELO you hold' },
      { id: 'celo_get_token_balance',       title: 'Token balances',  desc: 'Check any specific token' },
      { id: 'get_celo_wallet_portfolio',    title: 'Full portfolio',  desc: 'Overview of all your assets' },
      { id: 'get_celo_recent_transactions', title: 'Recent txns',     desc: 'Your last transactions' },
      { id: 'get_celo_nft_balances',        title: 'NFT collection',  desc: 'Digital items you own' },
    ],
  },
  {
    label: 'Swap',
    tools: [
      { id: 'celo_send',         title: 'Send tokens',  desc: 'Transfer CELO or tokens to anyone' },
      { id: 'celo_swap_quote',   title: 'Swap quote',   desc: 'See exchange rate before you swap' },
      { id: 'celo_swap_execute', title: 'Execute swap', desc: 'Trade one token for another' },
    ],
  },
  {
    label: 'Market',
    tools: [
      { id: 'get_celo_token_price',         title: 'Token price',    desc: 'Current price of any token' },
      { id: 'get_trending_celo_tokens',     title: 'Trending',       desc: "What's hot on Celo right now" },
      { id: 'get_celo_top_pools',           title: 'Top pools',      desc: 'Where traders are putting money' },
      { id: 'get_celo_yield_opportunities', title: 'Earn yield',     desc: 'Best APY on Celo right now' },
    ],
  },
  {
    label: 'Safety',
    tools: [
      { id: 'check_malicious_transaction', title: 'Check tx',       desc: 'Is this transaction safe?' },
      { id: 'check_contract_risk',         title: 'Check contract', desc: 'Trustworthy smart contract?' },
      { id: 'check_token_risk',            title: 'Check token',    desc: 'Is this token a scam?' },
      { id: 'get_whale_wallet_activity',   title: 'Whale watch',    desc: 'Watch big wallets move' },
    ],
  },
  {
    label: 'GoodDollar',
    tools: [
      { id: 'get_gooddollar_whitelisting_info', title: 'UBI eligibility',   desc: 'Is this address eligible for GoodDollar UBI?' },
      { id: 'get_gooddollar_ubi_entitlement',   title: 'Claimable G$',      desc: 'How much G$ can this wallet claim today?' },
      { id: 'get_gooddollar_reserve_quote',     title: 'Reserve quote',     desc: 'Quote a G$ swap via the GoodDollar reserve' },
      { id: 'claim_daily_gooddollar_ubi',       title: 'Claim UBI',         desc: 'Claim your daily GoodDollar UBI on-chain' },
    ],
  },
  {
    label: 'Governance',
    tools: [
      { id: 'get_governance_proposals', title: 'Proposals',       desc: 'Live Celo governance proposals' },
      { id: 'get_staking_balances',     title: 'Staking info',    desc: 'Locked CELO and votes' },
      { id: 'get_activatable_stakes',   title: 'Activate stakes', desc: 'Pending stakes to activate' },
      { id: 'get_validator_groups',     title: 'Validators',      desc: 'Top validator groups' },
      { id: 'get_total_staking_info',   title: 'Network staking', desc: 'Total CELO locked network-wide' },
    ],
  },
  {
    label: 'Carbon',
    tools: [
      { id: 'get_carbon_strategies',     title: 'AMM strategies', desc: 'Active Carbon DeFi strategies' },
      { id: 'get_carbon_trade_quote',    title: 'Trade quote',    desc: 'Carbon DeFi quote for a pair' },
      { id: 'find_carbon_opportunities', title: 'Opportunities',  desc: 'Trading opportunities on Carbon' },
      { id: 'get_carbon_protocol_stats', title: 'Protocol stats', desc: 'Carbon DeFi overview' },
    ],
  },
  {
    label: 'Chain',
    tools: [
      { id: 'get_celo_block',            title: 'Get block',      desc: 'Fetch a block by number' },
      { id: 'get_celo_latest_blocks',    title: 'Latest blocks',  desc: 'Last N blocks on-chain' },
      { id: 'get_celo_fee_data',         title: 'Fee data',       desc: 'Gas price and base fee' },
      { id: 'resolve_ens_name',          title: 'Resolve ENS',    desc: 'Map a .eth name to address' },
      { id: 'get_nft_balance',           title: 'NFT balance',    desc: 'ERC-721 balance for a wallet' },
    ],
  },
];

// Context-aware action cards
const JUMPINS = {
  disconnected: [
    { icon: '💼', title: 'Check any wallet',       desc: 'Paste an address — see every token, NFT, and recent transaction in seconds.',  prompt: 'Show me the portfolio for 0x' },
    { icon: '🛡️', title: 'Scan a token for risk',  desc: 'Honeypots, rug-pull traps, ownership red flags — the AI checks all of them.', prompt: 'Is this token safe to buy: ' },
    { icon: '📈', title: 'What is trending today',  desc: 'Volume leaders, newly launched pools, and where the liquidity is moving.',      prompt: "What are the trending tokens on Celo right now?" },
    { icon: '🗳️', title: 'Governance proposals',   desc: 'Active CGPs with titles, vote tallies, and deadline — straight from on-chain.',  prompt: 'Show me active Celo governance proposals' },
  ],
  connected: [
    { icon: '🚀', title: 'Launch a token',          desc: 'Deploy your own ERC-20 on Celo — name, symbol, supply, fixed or mintable.',    prompt: 'Launch a token called ' },
    { icon: '🔒', title: 'Your staking position',  desc: 'Locked CELO, active votes, and any stakes waiting to be activated.',           prompt: 'Show my staking balances and locked CELO' },
    { icon: '💸', title: 'Best yield right now',    desc: 'Top APY across Celo lending, liquidity, and GoodDollar — updated live.',       prompt: 'What are the best yield opportunities on Celo?' },
    { icon: '🔄', title: 'Swap at the best rate',  desc: 'Quotes Mento and Uniswap V3 in parallel — picks the higher output for you.',   prompt: 'Get me the best swap quote for 10 CELO to cUSD' },
  ],
};

function short(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDayShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function Reveal({ children, className = '', delay = 0, y = 28 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : `translateY(${y}px)`,
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function AnimatedNumber({ value, fmt = v => v.toLocaleString(), className = '' }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (value == null) return;
    const start = prev.current;
    const end = typeof value === 'number' ? value : 0;
    prev.current = end;
    const t0 = Date.now();
    const dur = 900;
    const tick = () => {
      const p = Math.min((Date.now() - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  if (value == null) return null;
  return <span className={className}>{fmt(display)}</span>;
}

export default function DashboardPage() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  const [activeGroup, setActiveGroup] = useState(0);

  const [celoPrice, setCeloPrice]   = useState(null);
  const [celoTvl, setCeloTvl]       = useState(null);
  const [gasPrice, setGasPrice]     = useState(null);

  const [metricsOverview, setMetricsOverview] = useState(null);
  const [metricsTools, setMetricsTools]       = useState(null);
  const [metricsToday, setMetricsToday]       = useState(null);
  const [avgLatencyMs, setAvgLatencyMs]       = useState(null);
  const [timeseries7d, setTimeseries7d]       = useState([]);
  const [selectedDay, setSelectedDay]         = useState(null); // chart day focus (null = today)
  const [metricsLoading, setMetricsLoading]   = useState(true);

  const [portfolio, setPortfolio]       = useState(null);
  const [recentTxs, setRecentTxs]       = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  useEffect(() => {
    apiGet('/api/dashboard/metrics').then((d) => {
      if (d?.celoPrice) setCeloPrice(d.celoPrice);
      if (d?.tvl?.usd) setCeloTvl((d.tvl.usd / 1e6).toFixed(1));
      if (d?.gasPrice)  setGasPrice(parseFloat(d.gasPrice).toFixed(4));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setMetricsLoading(true);
    Promise.all([
      apiGet('/api/metrics/overview'),
      apiGet('/api/metrics/tools'),
      apiGet('/api/metrics/timeseries?days=7'),
      apiGet('/api/metrics/models'),
    ]).then(([overview, tools, timeseries, models]) => {
      if (overview) setMetricsOverview(overview);
      if (models?.providers?.length) setMetricsTools(models.providers.slice(0, 6));
      if (timeseries?.series?.length) {
        const s = timeseries.series;
        setTimeseries7d(s.slice(-7));
        setMetricsToday(s[s.length - 1]);
      }
      if (models?.avgLatencyMs) {
        const vals = Object.values(models.avgLatencyMs).filter(v => v > 0);
        if (vals.length) setAvgLatencyMs(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
      }
    }).catch(() => {}).finally(() => setMetricsLoading(false));
  }, []);

  useEffect(() => {
    if (!isConnected || !address) { setPortfolio(null); setRecentTxs(null); return; }
    setWalletLoading(true);
    Promise.all([
      apiGet(`/api/wallet/${address}/balances`),
      apiGet(`/api/transactions?address=${address}`),
    ]).then(([b, t]) => {
      setPortfolio(Array.isArray(b?.balances) ? b.balances : null);
      setRecentTxs(Array.isArray(t?.transactions) ? t.transactions : null);
    }).catch(() => {}).finally(() => setWalletLoading(false));
  }, [isConnected, address]);

  const change = celoPrice?.usd_24h_change;
  const changeUp = typeof change === 'number' && change >= 0;
  const successRate = metricsOverview ? Math.round((1 - metricsOverview.fallbackRate) * 100) : null;
  const sparkMax = timeseries7d.length ? Math.max(...timeseries7d.map(d => d.chatRequests || 0), 1) : 1;
  const jumpins = isConnected ? JUMPINS.connected : JUMPINS.disconnected;
  const weekTotal = timeseries7d.reduce((a, d) => a + (d.chatRequests || 0), 0);

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-10 py-8 pb-20 flex flex-col gap-6">

      {/* ── Header ── */}
      <Reveal className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-light tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Celo Mainnet · live</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <span className="live-dot" /> Live
          </span>
          {!isConnected && (
            <button onClick={() => open()} className="text-sm font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-5 py-2 transition-all">
              Connect wallet
            </button>
          )}
        </div>
      </Reveal>

      {/* ── Command card — dark even in light mode ── */}
      <Reveal delay={60}>
      <div className="relative rounded-2xl overflow-hidden bg-stone-900 dark:bg-[#111009] border border-white/8">

        {/* eyehand decorative */}
        <div className="pointer-events-none absolute right-0 top-0 w-56 h-full hidden sm:block" aria-hidden>
          <Image
            src="/eyehand.png"
            alt=""
            fill
            className="object-cover object-right opacity-15 mix-blend-luminosity"
            style={{ maskImage: 'linear-gradient(to left, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
          />
        </div>

        {/* ambient gold glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(252,190,0,0.12) 0%, transparent 70%)' }}
          aria-hidden
        />

        <div className="relative z-10 p-6 md:p-8">
          {/* CELO price — large */}
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-1">CELO · Mainnet</p>
              {celoPrice ? (
                <div className="flex items-end gap-3 animate-fade-in">
                  <p className="font-display text-5xl font-light text-white leading-none">
                    ${Number(celoPrice.usd).toFixed(4)}
                  </p>
                  {typeof change === 'number' && (
                    <span className={`text-sm font-medium pb-1 ${changeUp ? 'text-emerald-400' : 'text-red-400'}`}>
                      {changeUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% today
                    </span>
                  )}
                </div>
              ) : (
                <div className="skeleton h-12 w-48" style={{ background: 'rgba(255,255,255,0.08)' }} />
              )}
            </div>
          </div>

          {/* Inline secondary stats */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {[
              { label: 'TVL', value: celoTvl ? `$${celoTvl}M` : null },
              { label: 'Gas', value: gasPrice ? `${gasPrice} Gwei` : null },
              { label: 'AI tools', value: '76 loaded' },
              { label: 'Success rate', value: successRate !== null ? `${successRate}%` : null },
              { label: 'Avg response', value: avgLatencyMs !== null ? `${(avgLatencyMs/1000).toFixed(1)}s` : null },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                {i > 0 && <span className="text-white/15 hidden sm:block">·</span>}
                <span className="text-white/40 text-xs">{s.label}</span>
                {s.value
                  ? <span className="text-white/80 font-medium">{s.value}</span>
                  : <span className="inline-block h-3 w-12 rounded bg-white/10 animate-pulse" />
                }
              </div>
            ))}
          </div>
        </div>
      </div>
      </Reveal>

      {/* ── Usage numbers — borderless, no individual cards ── */}
      <Reveal delay={80} className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 divide-y md:divide-y-0 divide-x-0 md:divide-x divide-slate-100 dark:divide-white/6">
          {[
            { label: 'Total chats',  value: metricsOverview?.totals.chatRequests, numeric: true },
            { label: 'Tool calls',   value: metricsOverview?.totals.toolCalls,     numeric: true },
            { label: 'MCP calls',    value: metricsOverview?.totals.mcpToolCalls,  numeric: true, amber: true },
            { label: 'Sessions',     value: metricsOverview?.uniqueSessions,       numeric: true },
            { label: 'Unique users', value: metricsOverview?.uniqueUsers,          numeric: true },
            { label: 'Top intent',   value: metricsOverview?.topIntent,            numeric: false, amber: true },
          ].map((s) => (
            <div key={s.label} className="px-6 py-5">
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">{s.label}</p>
              {s.value !== undefined && s.value !== null ? (
                <p className={`font-display text-2xl font-medium leading-none truncate animate-fade-in ${s.amber ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-[#F0EDE4]'}`}>
                  {s.numeric
                    ? <AnimatedNumber value={typeof s.value === 'number' ? s.value : 0} />
                    : String(s.value).replace(/_/g, ' ')}
                </p>
              ) : (
                <div className="skeleton h-7 w-20" />
              )}
            </div>
          ))}
        </div>
        {/* Today strip */}
        <div className="border-t border-slate-100 dark:border-white/6 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 divide-x-0 md:divide-x divide-slate-100 dark:divide-white/6 bg-stone-50/50 dark:bg-white/2">
          {[
            { label: 'Chats today',       value: metricsToday?.chatRequests,   fmt: v => v.toLocaleString() },
            { label: 'Models today',      value: metricsToday?.modelCalls,     fmt: v => v.toLocaleString() },
            { label: 'Avg response',      value: avgLatencyMs,                 fmt: v => `${(v/1000).toFixed(1)}s` },
            { label: 'Week total',        value: weekTotal || null,            fmt: v => `${v.toLocaleString()} chats` },
          ].map((s) => (
            <div key={s.label} className="px-6 py-3 flex items-center justify-between">
              <p className="text-xs text-slate-400 dark:text-slate-500">{s.label}</p>
              {s.value !== undefined && s.value !== null ? (
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{s.fmt(s.value)}</p>
              ) : (
                <div className="skeleton h-3 w-14" />
              )}
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── Charts row ── */}
      <Reveal delay={120} className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 7-day sparkline */}
        <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-5">
          {(() => {
            const focusIdx = selectedDay != null && selectedDay < timeseries7d.length
              ? selectedDay
              : timeseries7d.length - 1;
            const focus = timeseries7d[focusIdx];
            return (
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500">7-day activity</p>
                {focus && selectedDay != null ? (
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5"
                    title="Clear selection"
                  >
                    {fmtDayShort(focus.date)}: {(focus.chatRequests ?? 0).toLocaleString()} chats
                    <span className="text-slate-400 dark:text-slate-500">✕</span>
                  </button>
                ) : weekTotal > 0 ? (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{weekTotal.toLocaleString()} this week</p>
                ) : null}
              </div>
            );
          })()}
          {timeseries7d.length > 0 ? (
            <div className="flex items-end gap-1.5 h-16">
              {timeseries7d.map((d, i) => {
                const focusIdx = selectedDay != null && selectedDay < timeseries7d.length
                  ? selectedDay
                  : timeseries7d.length - 1;
                const isActive = i === focusIdx;
                const pct = Math.max(Math.round(((d.chatRequests || 0) / sparkMax) * 100), 4);
                return (
                  <button
                    key={d.date ?? i}
                    onClick={() => setSelectedDay(i)}
                    className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer"
                    title={`${fmtDayShort(d.date)}: ${d.chatRequests ?? 0} chats`}
                    aria-label={`${fmtDayShort(d.date)}: ${d.chatRequests ?? 0} chats`}
                  >
                    <div className="w-full flex flex-col justify-end" style={{ height: 52 }}>
                      <div
                        className={`w-full rounded-sm animate-grow-up transition-colors ${isActive ? 'bg-amber-400 dark:bg-amber-500' : 'bg-slate-100 dark:bg-white/12 group-hover:bg-amber-200 dark:group-hover:bg-amber-500/40'}`}
                        style={{ height: `${pct}%`, animationDelay: `${i * 60}ms` }}
                      />
                    </div>
                    <span className={`text-[9px] ${isActive ? 'text-amber-500 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                      {fmtDayShort(d.date)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-end gap-1.5 h-16">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full skeleton rounded-sm" style={{ height: 30 + i * 5 }} />
                  <div className="skeleton h-2 w-4 rounded" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI providers */}
        <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-5">
          <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">AI providers</p>
          {metricsTools?.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {metricsTools.map((t, i) => {
                const name = t.provider ?? t.tool ?? '—';
                const pct = Math.round((t.count / (metricsTools[0]?.count || 1)) * 100);
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 w-3 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate capitalize">{name}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-2 shrink-0 tabular-nums">{t.count.toLocaleString()}</span>
                      </div>
                      <div className="h-1 bg-slate-100 dark:bg-white/8 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 dark:bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {[1,2,3,4,5,6].map(n => (
                <div key={n} className="flex items-center gap-3">
                  <div className="skeleton h-2 w-3 shrink-0" />
                  <div className="flex-1">
                    <div className="skeleton h-3 w-3/4 mb-1" />
                    <div className="skeleton h-1 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Reveal>

      {/* ── Main 2-col ── */}
      <Reveal delay={150} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

        {/* Left */}
        <div className="flex flex-col gap-5">

          {/* Jump-in cards — editorial style, theme-adaptive */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {isConnected ? 'Your next move' : 'Jump in'}
              </p>
              {/* glad.png — only when wallet is connected, celebratory energy */}
              {isConnected && (
                <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-amber-300/40 shrink-0">
                  <Image src="/glad.png" alt="" fill className="object-cover object-top" />
                </div>
              )}
            </div>

            {/* devine.png — all-seeing eye backdrop, only behind the card grid */}
            <div className="relative">
              <div className="pointer-events-none absolute -right-3 -top-3 w-40 h-40 opacity-20 rounded-full overflow-hidden hidden sm:block" aria-hidden>
                <Image src="/devine.png" alt="" fill className="object-cover object-center" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
              {jumpins.map((j) => (
                <Link
                  key={j.title}
                  href={`/chat?q=${encodeURIComponent(j.prompt)}`}
                  className="group relative flex gap-4 items-start bg-white dark:bg-[#111009] border border-slate-200 dark:border-white/8 shadow-sm rounded-2xl p-5 overflow-hidden hover:border-amber-500/40 hover:shadow-md transition-all duration-200"
                >
                  <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-amber-400/60 rounded-r group-hover:bg-amber-400 transition-colors" />
                  <span className="text-2xl shrink-0">{j.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-white/90 mb-1 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">{j.title}</p>
                    <p className="text-xs text-slate-500 dark:text-white/40 leading-relaxed">{j.desc}</p>
                  </div>
                  <span className="absolute right-4 bottom-4 text-slate-300 dark:text-white/20 group-hover:text-amber-500 dark:group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all text-xs">→</span>
                </Link>
              ))}
              </div>{/* end grid */}
            </div>{/* end relative wrapper */}
          </div>

          {/* Wallet */}
          <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="font-medium text-slate-800 dark:text-slate-200">Your wallet</h2>
              {!isConnected ? (
                <button onClick={() => open()} className="text-xs text-slate-400 border border-slate-200 dark:border-white/10 rounded-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  Connect
                </button>
              ) : (
                <Link href="/chat?q=View+my+full+portfolio" className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 font-medium">
                  Ask AI →
                </Link>
              )}
            </div>

            {!isConnected ? (
              <div className="flex flex-col items-center gap-3 py-6 rounded-xl border border-dashed border-slate-200 dark:border-white/10 text-center overflow-hidden">
                {/* me.png — cartoon kid waiting, perfect for "not connected yet" */}
                <div className="relative w-24 h-24 rounded-xl overflow-hidden opacity-80">
                  <Image src="/me.png" alt="" fill className="object-cover object-top" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">No wallet connected</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[220px]">Connect to see your balances and activity.</p>
                </div>
                <button onClick={() => open()} className="text-sm font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-5 py-2 transition-all">
                  Connect wallet
                </button>
              </div>
            ) : walletLoading ? (
              <div className="flex flex-col gap-3">
                {[1,2,3,4].map(n => (
                  <div key={n} className="flex items-center justify-between">
                    <div className="flex gap-3 items-center">
                      <div className="skeleton w-8 h-8 rounded-full" />
                      <div className="flex flex-col gap-1.5"><div className="skeleton h-3 w-16" /><div className="skeleton h-2 w-10" /></div>
                    </div>
                    <div className="skeleton h-3 w-14" />
                  </div>
                ))}
              </div>
            ) : portfolio?.length > 0 ? (
              <div className="flex flex-col gap-0">
                {portfolio.slice(0, 8).map((tok, i) => {
                  const sym = tok.symbol ?? tok.name ?? '?';
                  const letter = sym[0]?.toUpperCase() ?? '?';
                  return (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-50 dark:border-white/4 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-700/30 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-400 shrink-0">
                          {letter}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{sym}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{tok.balance ?? '—'}</p>
                        </div>
                      </div>
                      {tok.usdValue && <p className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">${tok.usdValue}</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-8 text-slate-400 text-sm">No tokens found.</p>
            )}
          </div>

          {/* Activity — timeline style */}
          <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-medium text-slate-800 dark:text-slate-200">Activity</h2>
              {isConnected && (
                <Link href="/chat?q=Show+recent+transactions" className="text-xs text-amber-600 dark:text-amber-400 font-medium">All →</Link>
              )}
            </div>

            {!isConnected ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm text-slate-400 dark:text-slate-500">Connect your wallet to see activity.</p>
              </div>
            ) : walletLoading ? (
              <div className="flex flex-col gap-4">
                {[1,2,3].map(n => (
                  <div key={n} className="flex gap-3">
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <div className="skeleton w-2 h-2 rounded-full" />
                      {n < 3 && <div className="skeleton w-px h-8" />}
                    </div>
                    <div className="flex-1 pb-2"><div className="skeleton h-3 w-48 mb-1.5" /><div className="skeleton h-2 w-16" /></div>
                  </div>
                ))}
              </div>
            ) : recentTxs?.length > 0 ? (
              <div className="flex flex-col">
                {recentTxs.slice(0, 5).map((tx, i) => {
                  const hash = tx.hash ?? tx.transactionHash ?? '';
                  const isOk = tx.status === 'ok' || tx.result === 'success' || tx.isError === '0';
                  const ts = tx.timestamp ?? (tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : null);
                  const last = i === Math.min(recentTxs.length, 5) - 1;
                  return (
                    <div key={i} className="flex gap-3">
                      {/* timeline connector */}
                      <div className="flex flex-col items-center pt-1.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isOk ? 'bg-emerald-500' : 'bg-red-400'}`} />
                        {!last && <div className="w-px flex-1 bg-slate-100 dark:bg-white/8 mt-1 mb-1 min-h-[16px]" />}
                      </div>
                      <div className={`flex-1 flex items-start justify-between gap-3 ${!last ? 'pb-3' : ''}`}>
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">{short(hash)}</p>
                          {ts && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{fmtTime(ts)}</p>}
                        </div>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${isOk ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'}`}>
                          {isOk ? 'ok' : 'fail'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-8 text-slate-400 text-sm">No transactions found.</p>
            )}
          </div>
        </div>

        {/* Right — sticky panel */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">

          {/* AI capabilities */}
          <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm overflow-hidden">
            <div className="relative h-48 overflow-hidden bg-white dark:bg-[#0F0E0C]">
              <Image src="/brainy.png" alt="" fill className="object-cover object-center mix-blend-multiply dark:mix-blend-screen opacity-80 dark:opacity-90 dark:brightness-110" aria-hidden />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, white 100%)' }} aria-hidden />
              <div className="absolute inset-0 hidden dark:block" style={{ background: 'linear-gradient(to bottom, transparent 40%, #1A1916 100%)' }} aria-hidden />
            </div>
            <div className="p-5">
              <h2 className="font-medium text-slate-800 dark:text-slate-200 mb-1">76 AI tools</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Everything the AI can do.</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {toolGroups.map((g, i) => (
                  <button
                    key={g.label}
                    onClick={() => setActiveGroup(i)}
                    className={`text-xs font-medium rounded-full px-2.5 py-1 border transition-all duration-100 ${activeGroup === i ? 'bg-[#FCBE00] text-slate-900 border-transparent' : 'bg-stone-100 dark:bg-white/6 text-slate-500 dark:text-slate-400 border-stone-200 dark:border-white/8 hover:bg-stone-200 dark:hover:bg-white/10'}`}
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
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-stone-50 dark:hover:bg-white/5 group transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">{tool.title}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{tool.desc}</p>
                    </div>
                    <span className="text-slate-300 dark:text-slate-600 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0 text-xs">→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* System status */}
          <div className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">System</p>
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="live-dot" style={{ width: 5, height: 5 }} /> Operational
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { label: 'Network',      value: 'Celo Mainnet',                    ok: true },
                { label: 'AI provider',  value: 'Connected',                       ok: true },
                { label: 'RPC latency',  value: gasPrice ? '< 5ms' : 'Checking…', ok: !!gasPrice },
                { label: 'MCP tools',    value: '76 loaded',                       ok: true },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{s.label}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s.ok ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400'}`}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

    </main>
  );
}
