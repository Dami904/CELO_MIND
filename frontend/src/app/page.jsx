'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { apiGet } from '@/lib/api';

const MCP_URL = 'https://celo-mind-nmk2.onrender.com/mcp';

const MCP_CLIENTS = [
  { id: 'claude',   label: 'Claude Desktop', sublabel: 'Mac / Windows', icon: '🤖', desc: 'Three methods: Settings UI connector, JSON config file, or npx legacy fallback for older versions.' },
  { id: 'cursor',   label: 'Cursor IDE',     sublabel: null,            icon: '⌨️', desc: 'Add via Cursor Settings → MCP, or paste the config into ~/.cursor/mcp.json and restart.' },
  { id: 'windsurf', label: 'Windsurf',       sublabel: null,            icon: '🏄', desc: 'Open the Cascade panel → Plugin settings, or edit your mcp_config.json directly.' },
  { id: 'vscode',   label: 'VS Code',        sublabel: 'Copilot',       icon: '💻', desc: 'Requires GitHub Copilot ≥ v1.99. Create .vscode/mcp.json in your project, then use Agent mode.' },
  { id: 'web',      label: 'Web chat',       sublabel: 'no config',     icon: '🌐', desc: 'Already connected. Open the chat and start asking — 76 tools available instantly, zero setup.' },
];

function StickyScrollSection({ items, outerClass = '', leftClass = '', rightClass = '' }) {
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(Number(hit.target.dataset.idx));
      },
      { threshold: 0.45, rootMargin: '-10% 0px -10% 0px' }
    );
    refs.current.forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 items-start ${outerClass}`}>
      <div className={leftClass}>
        {items.map((item, i) => (
          <div
            key={i}
            ref={el => refs.current[i] = el}
            data-idx={i}
            onClick={() => setActive(i)}
            className="min-h-[60vh] flex flex-col justify-center py-14 cursor-default border-b border-white/6 last:border-0"
            style={{ opacity: active === i ? 1 : 0.3, transition: 'opacity 0.4s ease' }}
          >
            {item.trigger}
          </div>
        ))}
      </div>
      <div className={`hidden lg:block ${rightClass}`}>
        <div className="sticky top-24">
          <div key={active} className="animate-fade-in">{items[active]?.panel}</div>
        </div>
      </div>
    </div>
  );
}

function Reveal({ children, delay = 0, y = 24 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.06 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : `translateY(${y}px)`,
      transition: `opacity 0.55s ease ${delay}ms, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

const MARQUEE_ROW1 = [
  'Check balance', 'Swap tokens', 'Token prices', 'Risk scan',
  'GoodDollar UBI', 'Governance', 'Carbon DeFi', 'Block explorer',
  'Top liquidity pools', 'Whale watch', 'Earn yield', 'NFT portfolio',
  'Send CELO', 'Trending tokens', 'Gas fees', 'Validator groups',
];

const MARQUEE_ROW2 = [
  'Full portfolio', 'Contract audit', 'Swap quote', 'Staking balances',
  'G$ entitlement', 'ENS resolve', 'Recent transactions', 'Fee data',
  'Activate stakes', 'AMM strategies', 'Price feeds', 'Celo Mainnet',
  'Token risk check', 'Pool liquidity', 'Uniswap V3', 'Mento DEX',
];

const capabilities = [
  {
    badge: 'Wallet intelligence',
    title: 'Check your wallet',
    desc: 'Ask in plain English — "What\'s in my wallet?" or "Show my recent transactions." No jargon needed.',
  },
  {
    badge: 'DeFi actions',
    title: 'Swap & send tokens',
    desc: 'Move money on the Celo network. Swap CELO for cUSD, send to a friend — all through a simple chat.',
  },
  {
    badge: 'Risk detection',
    title: 'Stay safe',
    desc: 'Before you sign anything, CeloMind checks if a contract or token looks risky — like a virus scanner for crypto.',
  },
];

const steps = [
  { n: '1', title: 'Connect your wallet', desc: 'One click with MetaMask or any Celo-compatible wallet.' },
  { n: '2', title: 'Ask anything', desc: '"What\'s my balance?" or "Swap 5 CELO to cUSD" — the AI handles the rest.' },
  { n: '3', title: 'Confirm & go', desc: 'You approve every transaction. CeloMind never moves funds without you.' },
];

const prompts = [
  "What's my CELO balance?",
  'Show my recent transactions',
  'Swap 10 CELO for cUSD',
  'Is this contract safe to use?',
  'What are the top DeFi pools?',
  'Who are the biggest CELO holders?',
];

export default function HomePage() {
  const [activeStep, setActiveStep] = useState(0);
  const [mcpClient, setMcpClient] = useState('claude');
  const [copied, setCopied] = useState('');
  const [liveStats, setLiveStats] = useState([
    { value: '76', label: 'AI tools' },
    { value: '—', label: 'CELO price' },
    { value: '—', label: 'Ecosystem TVL' },
    { value: '100%', label: 'Open source' },
  ]);
  const [ticker, setTicker] = useState({
    price: null, change: null, tvl: null, gas: null, chats: null,
  });

  useEffect(() => {
    apiGet('/api/dashboard/metrics').then((d) => {
      const price = d?.celoPrice?.usd != null ? `$${Number(d.celoPrice.usd).toFixed(3)}` : null;
      const tvl   = d?.tvl?.usd  != null ? `$${(d.tvl.usd / 1e6).toFixed(0)}M` : null;
      const gas = (() => {
        const raw = d?.gasPrice;
        if (raw == null) return null;
        const n = parseFloat(String(raw));
        return Number.isFinite(n) ? `${n.toFixed(3)} Gwei` : null;
      })();
      const change = d?.celoPrice?.usd_24h_change ?? null;
      setLiveStats([
        { value: '76', label: 'AI tools' },
        { value: price ?? '—', label: 'CELO price' },
        { value: tvl ?? '—', label: 'Ecosystem TVL' },
        { value: '100%', label: 'Open source' },
      ]);
      setTicker(t => ({ ...t, price, tvl, gas, change }));
    }).catch(() => {});
    apiGet('/api/metrics/overview').then((d) => {
      if (d?.totals?.chatRequests) setTicker(t => ({ ...t, chats: d.totals.chatRequests }));
    }).catch(() => {});
  }, []);

  function copyText(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    }).catch(() => {});
  }

  return (
    <main>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden text-center px-4 pt-20 pb-16 md:pt-28 md:pb-24 bg-stone-50 dark:bg-[#0F0E0C] transition-colors duration-200">

        {/* Ambient gold glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(252,190,0,0.12) 0%, transparent 70%)' }}
        />

        {/* brain.png — right side */}
        <div className="pointer-events-none absolute right-0 top-0 w-[340px] md:w-[440px] h-full overflow-hidden hidden lg:block" aria-hidden>
          <Image
            src="/brain.png"
            alt=""
            width={440}
            height={600}
            className="object-cover object-left opacity-30 dark:opacity-50 mix-blend-luminosity dark:mix-blend-screen dark:brightness-125"
            style={{ maskImage: 'linear-gradient(to left, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
            priority
          />
        </div>

        {/* brain.png — left side, same size, mirrored */}
        <div className="pointer-events-none absolute left-0 top-0 w-[340px] md:w-[440px] h-full overflow-hidden hidden lg:block" aria-hidden>
          <Image
            src="/brain.png"
            alt=""
            width={440}
            height={600}
            className="object-cover object-right opacity-30 dark:opacity-50 mix-blend-luminosity dark:mix-blend-screen dark:brightness-125 scale-x-[-1]"
            style={{ maskImage: 'linear-gradient(to left, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-2xl">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#1A8C52] dark:text-[#35D07F] bg-[#D4F5E6] dark:bg-[#35D07F]/15 rounded-full px-4 py-1.5 mb-7 animate-fade-up">
            <span className="live-dot" />
            Live on Celo Mainnet
          </div>

          <h1 className="font-display text-5xl md:text-6xl font-light tracking-tight leading-tight text-slate-900 dark:text-slate-100 mb-5 animate-fade-up delay-1">
            Your AI assistant<br />
            <em className="not-italic text-amber-600">for the Celo network</em>
          </h1>

          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-lg mx-auto mb-9 leading-relaxed animate-fade-up delay-2">
            CeloMind lets you manage crypto, track tokens, and stay safe — all by having a normal conversation.
            No technical knowledge required.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-12 animate-fade-up delay-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 font-medium text-base px-7 py-3 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              Start chatting →
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-white dark:bg-[#242220] text-slate-700 dark:text-slate-200 font-medium text-base px-7 py-3 rounded-full border border-slate-200 dark:border-[rgba(255,240,180,0.12)] shadow-sm hover:bg-slate-50 dark:hover:bg-[#2e2c28] transition-all duration-200"
            >
              View dashboard
            </Link>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-3 animate-fade-up delay-3">
            {liveStats.map((s) => (
              <div key={s.label} className="flex flex-col items-center bg-stone-100 dark:bg-[#242220] border border-stone-200 dark:border-[rgba(255,240,180,0.10)] rounded-2xl px-5 py-3 min-w-[100px]">
                <span className="font-display text-2xl font-medium text-slate-900 dark:text-[#F0EDE4] leading-none">{s.value}</span>
                <span className="text-xs text-slate-400 dark:text-[#A09880] uppercase tracking-wider mt-1">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live Stats Ticker ── */}
      {(() => {
        const changeUp = typeof ticker.change === 'number' && ticker.change >= 0;
        const items = [
          { value: ticker.price ?? '—',  label: 'CELO',          accent: true, badge: ticker.change != null ? `${changeUp ? '▲' : '▼'} ${Math.abs(ticker.change).toFixed(2)}%` : null, badgeUp: changeUp },
          { value: ticker.tvl   ?? '—',  label: 'Ecosystem TVL' },
          { value: ticker.gas   ?? '—',  label: 'Gas' },
          { value: '75',                 label: 'AI tools' },
          { value: ticker.chats ? `${ticker.chats}+` : '167+', label: 'Conversations' },
          { value: '< 1s',               label: 'Avg response' },
          { value: '100%',               label: 'Open source' },
          { value: 'Mainnet',            label: 'Celo network' },
        ];
        return (
          <div className="border-y border-stone-200 dark:border-white/8 bg-white dark:bg-[#0D0C0A] overflow-hidden select-none">
            <div className="ticker-pause flex animate-ticker" style={{ width: 'max-content' }}>
              {[...items, ...items].map((item, i) => (
                <span key={i} className="inline-flex items-center gap-2 px-6 py-2.5 whitespace-nowrap">
                  <span className={`text-sm font-medium tabular-nums ${item.accent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-[#F0EDE4]'}`}>
                    {item.value}
                  </span>
                  {item.badge && (
                    <span className={`text-[10px] font-medium ${item.badgeUp ? 'text-emerald-500' : 'text-red-400'}`}>{item.badge}</span>
                  )}
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">{item.label}</span>
                  <span className="text-slate-200 dark:text-white/10 mx-1 text-xs">·</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── What is CeloMind ── */}
      <section className="bg-stone-100 dark:bg-[#1A1916] border-y border-stone-200 dark:border-white/8 overflow-hidden transition-colors duration-200">
        <div className="max-w-5xl mx-auto px-4 py-16 md:py-20 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-center">
          <div>
            <p className="flex items-center gap-2.5 text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
              <span className="w-5 h-px bg-current inline-block opacity-50" />
              What is CeloMind?
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-light text-slate-900 dark:text-slate-100 mb-5 leading-snug">
              Crypto can be complex.<br />We made it conversational.
            </h2>
            <p className="text-base text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
              CeloMind connects an AI assistant to the Celo blockchain — a fast, low-cost network built for
              everyday use. Instead of copying addresses or figuring out DeFi, you just type what you want.
            </p>
          </div>

          {/* smiling.png — gold glow halo in dark mode */}
          <div className="hidden md:flex items-end justify-center shrink-0">
            <div
              className="rounded-3xl dark:shadow-[0_0_40px_8px_rgba(252,190,0,0.25)]"
              style={{ transform: 'rotate(2deg)' }}
            >
              <Image
                src="/smiling.png"
                alt="CeloMind is friendly and easy to use"
                width={220}
                height={280}
                className="rounded-3xl shadow-xl object-cover dark:brightness-110 dark:contrast-105"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      {(() => {
        const numerals = ['I', 'II', 'III'];
        const stepPanels = [
          <div key="s0" className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1916] shadow-sm p-6" style={{ animation: 'slideRight 0.55s ease both' }}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-slate-400 dark:text-white/50 text-xs uppercase tracking-widest">Wallet</p>
              <span className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Connected
              </span>
            </div>
            <p className="font-mono text-xs text-slate-400 dark:text-white/30 mb-5">0x4f3a…82b1 · Celo Mainnet</p>
            {[['CELO', '12.45', '$7.23'], ['cUSD', '50.00', '$50.00'], ['G$', '100', '$0.25']].map(([sym, bal, usd]) => (
              <div key={sym} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-white/6 last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-600 dark:text-amber-400">{sym[0]}</div>
                  <span className="text-sm text-slate-600 dark:text-white/70">{sym}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-800 dark:text-white/80">{bal}</p>
                  <p className="text-[11px] text-slate-400 dark:text-white/30">{usd}</p>
                </div>
              </div>
            ))}
          </div>,
          <div key="s1" className="rounded-2xl border border-slate-200 dark:border-white/10 bg-stone-50 dark:bg-[#0D0C0A] shadow-sm p-5 space-y-3" style={{ animation: 'slideRight 0.55s ease both' }}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-white/8">
              <div className="w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-400/10 ring-1 ring-amber-200/60 dark:ring-amber-400/15 flex items-center justify-center shrink-0"><img src="/logo-icon.png" alt="CeloMind" className="w-4 h-4 object-contain" /></div>
              <span className="text-xs text-slate-400 dark:text-white/40">CeloMind</span>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />Live
              </span>
            </div>
            <div className="flex justify-end">
              <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-sm max-w-[80%]">Swap 5 CELO to cUSD</div>
            </div>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-400/10 ring-1 ring-amber-200/60 dark:ring-amber-400/15 flex items-center justify-center shrink-0"><img src="/logo-icon.png" alt="CeloMind" className="w-4 h-4 object-contain" /></div>
              <div className="bg-white dark:bg-[#1A1916] border border-slate-200 dark:border-white/8 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-slate-600 dark:text-white/80 leading-relaxed">
                Best rate on <span className="text-amber-600 dark:text-amber-400 font-medium">Mento</span>: 5 CELO → <span className="text-emerald-600 dark:text-emerald-400 font-medium">3.12 cUSD</span>. Shall I proceed?
              </div>
            </div>
            <div className="flex gap-2 justify-center pt-1">
              <button className="text-xs bg-amber-400/15 text-amber-600 dark:text-amber-400 px-4 py-1.5 rounded-full border border-amber-400/25">Confirm</button>
              <button className="text-xs bg-slate-100 dark:bg-white/6 text-slate-400 dark:text-white/35 px-4 py-1.5 rounded-full">Cancel</button>
            </div>
          </div>,
          <div key="s2" className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1916] shadow-sm p-6" style={{ animation: 'slideRight 0.55s ease both' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">🔐</div>
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-white/90">Sign transaction</p>
                <p className="text-[11px] text-slate-400 dark:text-white/30">Approved by you · never by CeloMind</p>
              </div>
            </div>
            <div className="space-y-2.5 mb-5">
              {[['From', '5 CELO'], ['To (est.)', '3.12 cUSD'], ['Route', 'Mento DEX'], ['Gas', '~0.001 CELO']].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-xs text-slate-400 dark:text-white/35">{label}</span>
                  <span className="text-xs font-medium text-slate-700 dark:text-white/80">{value}</span>
                </div>
              ))}
            </div>
            <button className="w-full bg-amber-400 text-slate-900 font-medium text-sm py-2.5 rounded-xl">Sign with wallet</button>
            <p className="text-[10px] text-slate-400 dark:text-white/20 text-center mt-2.5">CeloMind never stores or touches your keys</p>
          </div>,
        ];
        return (
          <section className="bg-stone-100 dark:bg-[#0D0C0A] transition-colors duration-200">
            <div className="max-w-5xl mx-auto px-8 pt-16 pb-8">
              <p className="flex items-center gap-2.5 text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-white/30 mb-4">
                <span className="w-5 h-px bg-current inline-block opacity-50" />
                How it works
              </p>
              <h2 className="font-display text-3xl md:text-4xl font-light text-slate-900 dark:text-white leading-tight mb-10">
                Three simple steps.<br />
                <span className="text-slate-400 dark:text-white/35">No technical knowledge needed.</span>
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
                {/* Left — compact step list */}
                <div className="rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-transparent shadow-sm dark:shadow-none overflow-hidden">
                  {steps.map((s, i) => {
                    const isActive = activeStep === i;
                    return (
                      <button
                        key={s.n}
                        onClick={() => setActiveStep(i)}
                        className={`flex items-start gap-4 px-5 pt-5 pb-6 text-left transition-all duration-300 w-full relative border-b border-slate-100 dark:border-white/6 last:border-0 overflow-hidden ${isActive ? 'bg-stone-100 dark:bg-white/5' : 'bg-transparent'}`}
                      >
                        <span
                          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-amber-400 transition-all duration-500"
                          style={{ opacity: isActive ? 1 : 0, transform: isActive ? 'scaleY(1)' : 'scaleY(0)' }}
                        />
                        <span className={`font-display text-2xl font-light leading-none mt-0.5 shrink-0 transition-colors duration-300 ${isActive ? 'text-amber-500 dark:text-amber-400/70' : 'text-slate-300 dark:text-white/15'}`}>
                          {numerals[i]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium leading-tight transition-colors duration-300 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/35'}`}>
                            {s.title}
                          </p>
                          <p className={`text-xs mt-1.5 leading-relaxed transition-colors duration-300 ${isActive ? 'text-slate-500 dark:text-white/40' : 'text-slate-400 dark:text-white/20'}`}>
                            {s.desc}
                          </p>
                        </div>
                        {/* Progress bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-100 dark:bg-white/6">
                          {isActive && (
                            <div
                              key={activeStep}
                              className="h-full bg-amber-400"
                              style={{ animation: 'progressFill 3.5s linear forwards' }}
                              onAnimationEnd={() => setActiveStep((activeStep + 1) % steps.length)}
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Right — panel */}
                <div>{stepPanels[activeStep]}</div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── Capabilities ── */}
      <section className="max-w-5xl mx-auto px-4 py-16 md:py-20">
        <p className="flex items-center gap-2.5 text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
          <span className="w-5 h-px bg-current inline-block opacity-50" />
          What you can do
        </p>
        <h2 className="font-display text-3xl font-light text-slate-900 dark:text-slate-100 mb-8">Three ways CeloMind helps you</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {capabilities.map((c, i) => (
            <div key={c.title} className="relative bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 p-6 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <span className="absolute top-4 right-5 font-display text-5xl font-light text-slate-100 dark:text-white/6 leading-none select-none tabular-nums">
                0{i + 1}
              </span>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/8 rounded-full px-3 py-0.5 mb-4 inline-block relative z-10">{c.badge}</span>
              <h3 className="font-medium text-slate-800 dark:text-slate-200 text-base mb-2 relative z-10">{c.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed relative z-10">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Prompt chips ── */}
      <section className="bg-stone-100/60 dark:bg-[#1A1916]/60 border-y border-stone-200 dark:border-white/8 transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 py-16 md:py-20">
        <p className="flex items-center gap-2.5 text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
          <span className="w-5 h-px bg-current inline-block opacity-50" />
          Try these
        </p>
        <h2 className="font-display text-3xl font-light text-slate-900 dark:text-slate-100 mb-8">Things to ask CeloMind</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {prompts.map((p) => (
            <Link
              key={p}
              href={`/chat?q=${encodeURIComponent(p)}`}
              className="flex items-center justify-between gap-3 bg-white dark:bg-[#1A1916] border border-slate-200 dark:border-white/8 rounded-xl px-4 py-3.5 text-sm text-slate-700 dark:text-slate-300 shadow-sm hover:border-[#FCBE00] hover:bg-[#FFF8D6] dark:hover:bg-[#2A2510] dark:hover:border-amber-500/50 hover:-translate-y-0.5 hover:shadow-md transition-all duration-150 group"
            >
              <span>{p}</span>
              <span className="text-slate-300 group-hover:text-amber-600 group-hover:translate-x-1 transition-all duration-150 shrink-0">→</span>
            </Link>
          ))}
        </div>
      </div>
      </section>

      {/* ── 75 Tools Marquee ── */}
      <div className="border-y border-stone-200 dark:border-white/8 bg-stone-50 dark:bg-[#0D0C0A] py-4 overflow-hidden select-none">
        <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-300 dark:text-white/15 mb-3">76 AI-powered tools</p>

        {/* Row 1 — scrolls left */}
        <div className="overflow-hidden mb-2">
          <div className="ticker-pause flex animate-ticker" style={{ width: 'max-content' }}>
            {[...MARQUEE_ROW1, ...MARQUEE_ROW1].map((tool, i) => (
              <span key={i} className="inline-flex items-center mx-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-full whitespace-nowrap">
                {tool}
              </span>
            ))}
          </div>
        </div>

        {/* Row 2 — scrolls right */}
        <div className="overflow-hidden">
          <div className="ticker-pause flex animate-ticker-back" style={{ width: 'max-content' }}>
            {[...MARQUEE_ROW2, ...MARQUEE_ROW2].map((tool, i) => (
              <span key={i} className="inline-flex items-center mx-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-500 bg-stone-100 dark:bg-white/3 border border-stone-200 dark:border-white/6 rounded-full whitespace-nowrap">
                {tool}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── MCP Connect ── */}
      <section className="px-4 py-8 md:py-12 bg-stone-100/60 dark:bg-[#1A1916]/60 border-y border-stone-200 dark:border-white/8 transition-colors duration-200">
        <Reveal delay={0}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Connect</p>
          <h2 className="font-display text-3xl font-light text-slate-900 dark:text-slate-100 mb-8">Use CeloMind in your AI client</h2>
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0C0A] shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] items-start">

              {/* Left — compact client list */}
              <div className="border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-white/8 p-5 flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/25 mb-3 px-2">Pick your platform</p>
                {MCP_CLIENTS.map((c) => {
                  const isActive = mcpClient === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setMcpClient(c.id)}
                      className={`flex items-center gap-3 rounded-xl px-3.5 pt-3 pb-4 text-left transition-all duration-300 w-full relative overflow-hidden ${isActive ? 'bg-stone-100 dark:bg-white/[0.07]' : 'bg-transparent'}`}
                    >
                      {/* Active left bar */}
                      <span
                        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-amber-400 transition-all duration-500"
                        style={{ opacity: isActive ? 1 : 0, transform: isActive ? 'scaleY(1)' : 'scaleY(0)' }}
                      />
                      <span className="text-lg shrink-0 w-7 text-center">{c.icon}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium leading-tight transition-colors duration-300 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/40'}`}>
                          {c.label}
                        </p>
                        {c.sublabel && (
                          <p className={`text-[10px] mt-0.5 transition-colors duration-300 ${isActive ? 'text-slate-500 dark:text-white/35' : 'text-slate-400 dark:text-white/20'}`}>
                            {c.sublabel}
                          </p>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-100 dark:bg-white/6">
                        {isActive && (
                          <div
                            key={mcpClient}
                            className="h-full bg-amber-400"
                            style={{ animation: 'progressFill 3.5s linear forwards' }}
                            onAnimationEnd={() => {
                              const idx = MCP_CLIENTS.findIndex(x => x.id === mcpClient);
                              setMcpClient(MCP_CLIENTS[(idx + 1) % MCP_CLIENTS.length].id);
                            }}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
                <p className="text-[10px] text-slate-400 dark:text-white/20 leading-relaxed mt-4 px-2">
                  Free &amp; public — no token or signup required.
                </p>
              </div>

              {/* Right — config panel */}
              <div key={mcpClient} className="p-7 flex flex-col gap-5 min-w-0" style={{ animation: 'slideRight 0.55s ease both' }}>

                {mcpClient === 'claude' && (
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">1 — EASIEST</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-white/70">Settings UI — no config editing</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-white/45 leading-relaxed">
                        Claude Desktop → Settings → Connectors → Add custom connector → paste this URL:
                      </p>
                      <div className="flex items-center gap-2 bg-slate-900 dark:bg-black/30 border border-slate-700 dark:border-white/10 rounded-xl px-4 py-2.5">
                        <span className="font-mono text-sm text-slate-100 dark:text-white/80 flex-1 truncate">{MCP_URL}</span>
                        <button onClick={() => copyText(MCP_URL, 'url1')} className="shrink-0 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors">
                          {copied === 'url1' ? '✓ Copied' : 'Copy URL'}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50 px-2 py-0.5 rounded">2 — RECOMMENDED</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-white/70">Config file — modern</span>
                      </div>
                      <pre className="bg-slate-900 dark:bg-black/40 border border-slate-700 dark:border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ mcpServers: { celomind: { url: MCP_URL } } }, null, 2)}</pre>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <button onClick={() => copyText(JSON.stringify({ mcpServers: { celomind: { url: MCP_URL } } }, null, 2), 'cfg1')} className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white/70 px-4 py-1.5 rounded-lg transition-colors">
                          {copied === 'cfg1' ? '✓ Copied' : 'Copy'}
                        </button>
                        <span className="font-mono text-[10px] text-slate-400 dark:text-white/25 truncate">~/Library/Application Support/Claude/claude_desktop_config.json</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-400 dark:bg-white/6 dark:text-white/35 px-2 py-0.5 rounded">3 — LEGACY FALLBACK</span>
                        <span className="text-sm font-medium text-slate-500 dark:text-white/50">Config file — requires Node.js</span>
                      </div>
                      <pre className="bg-slate-900 dark:bg-black/40 border border-slate-700 dark:border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ mcpServers: { celomind: { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL] } } }, null, 2)}</pre>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <button onClick={() => copyText(JSON.stringify({ mcpServers: { celomind: { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL] } } }, null, 2), 'cfg2')} className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white/70 px-4 py-1.5 rounded-lg transition-colors">
                          {copied === 'cfg2' ? '✓ Copied' : 'Copy'}
                        </button>
                        <span className="text-[10px] text-slate-400 dark:text-white/25">Use this if Method 2 shows &quot;not valid MCP server configurations&quot;.</span>
                      </div>
                    </div>
                  </div>
                )}

                {mcpClient === 'cursor' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-slate-500 dark:text-white/45 leading-relaxed">
                      Open <span className="text-slate-700 dark:text-white/75 font-medium">Cursor Settings → MCP</span> and add a new server, or paste into{' '}
                      <code className="bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-white/65 font-mono">~/.cursor/mcp.json</code>
                    </p>
                    <pre className="bg-slate-900 dark:bg-black/40 border border-slate-700 dark:border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ mcpServers: { celomind: { url: MCP_URL, type: 'http' } } }, null, 2)}</pre>
                    <p className="text-xs text-slate-400 dark:text-white/30">No token required. Restart Cursor after saving.</p>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button onClick={() => copyText(JSON.stringify({ mcpServers: { celomind: { url: MCP_URL, type: 'http' } } }, null, 2), 'cursor')} className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white/70 px-4 py-2 rounded-lg transition-colors">
                        {copied === 'cursor' ? '✓ Copied' : 'Copy config'}
                      </button>
                      <span className="font-mono text-[10px] text-slate-400 dark:text-white/25 truncate">%APPDATA%\Cursor\User\globalStorage\cursor.mcp\mcp.json</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-slate-200 dark:border-white/6">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/25 mb-1">Linux</p>
                      <code className="font-mono text-[10px] text-slate-400 dark:text-white/35">~/.cursor/mcp.json</code>
                    </div>
                  </div>
                )}

                {mcpClient === 'windsurf' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-slate-500 dark:text-white/45 leading-relaxed">
                      Open <span className="text-slate-700 dark:text-white/75 font-medium">Windsurf → Cascade panel → Plugin settings</span>, or edit the config file directly:
                    </p>
                    <pre className="bg-slate-900 dark:bg-black/40 border border-slate-700 dark:border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ mcpServers: { celomind: { serverUrl: MCP_URL } } }, null, 2)}</pre>
                    <p className="text-xs text-slate-400 dark:text-white/30">Reload the Windsurf window after saving.</p>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button onClick={() => copyText(JSON.stringify({ mcpServers: { celomind: { serverUrl: MCP_URL } } }, null, 2), 'windsurf')} className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white/70 px-4 py-2 rounded-lg transition-colors">
                        {copied === 'windsurf' ? '✓ Copied' : 'Copy config'}
                      </button>
                      <span className="font-mono text-[10px] text-slate-400 dark:text-white/25 truncate">~/.codeium/windsurf/mcp_config.json</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-slate-200 dark:border-white/6">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/25 mb-1">Windows</p>
                      <code className="font-mono text-[10px] text-slate-400 dark:text-white/35">%APPDATA%\Codeium\windsurf\mcp_config.json</code>
                    </div>
                  </div>
                )}

                {mcpClient === 'vscode' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-slate-500 dark:text-white/45 leading-relaxed">
                      Requires <span className="text-slate-700 dark:text-white/75 font-medium">GitHub Copilot + VS Code ≥ 1.99</span>. Create{' '}
                      <code className="bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-white/65 font-mono">.vscode/mcp.json</code> in your project:
                    </p>
                    <pre className="bg-slate-900 dark:bg-black/40 border border-slate-700 dark:border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ servers: { celomind: { type: 'http', url: MCP_URL } } }, null, 2)}</pre>
                    <p className="text-xs text-slate-400 dark:text-white/30">Open Copilot Chat → Agent mode to access CeloMind tools.</p>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button onClick={() => copyText(JSON.stringify({ servers: { celomind: { type: 'http', url: MCP_URL } } }, null, 2), 'vscode')} className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white/70 px-4 py-2 rounded-lg transition-colors">
                        {copied === 'vscode' ? '✓ Copied' : 'Copy config'}
                      </button>
                      <span className="font-mono text-[10px] text-slate-400 dark:text-white/25">.vscode/mcp.json</span>
                    </div>
                  </div>
                )}

                {mcpClient === 'web' && (
                  <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                    <span className="text-5xl">🌐</span>
                    <div>
                      <p className="text-slate-700 dark:text-white/80 font-medium mb-1">No setup needed</p>
                      <p className="text-sm text-slate-500 dark:text-white/40 max-w-xs leading-relaxed">CeloMind&apos;s web chat is already connected. Open the chat and start asking — 76 tools, zero config.</p>
                    </div>
                    <Link href="/chat" className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-medium text-sm px-6 py-2.5 rounded-full transition-colors">
                      Open web chat →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </Reveal>
      </section>

      {/* ── CTA ── */}
      <section className="px-4 pb-20">
        <div className="max-w-2xl mx-auto bg-slate-900 dark:bg-[#1A1916] dark:border dark:border-white/8 rounded-3xl overflow-hidden dark:shadow-[0_0_60px_-10px_rgba(252,190,0,0.15)]">
          <div className="flex flex-col md:flex-row items-center gap-0">

            {/* superb.png */}
            <div className="md:w-56 shrink-0 self-stretch overflow-hidden hidden md:block">
              <Image
                src="/superb.png"
                alt=""
                width={224}
                height={320}
                className="w-full h-full object-cover opacity-80 dark:opacity-95 dark:brightness-110 dark:saturate-110"
                aria-hidden
              />
            </div>

            <div className="flex-1 px-8 py-12 text-center md:text-left">
              <h2 className="font-display text-3xl md:text-4xl font-light text-white mb-4">Ready to try it?</h2>
              <p className="text-slate-400 text-base mb-8 leading-relaxed">
                Connect your wallet and start a conversation. It's free and open-source.
              </p>
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <Link
                  href="/chat"
                  className="bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 font-medium px-7 py-3 rounded-full text-sm transition-all duration-150"
                >
                  Open AI chat
                </Link>
                <a
                  href="https://github.com/Dami904/CELO_MIND.git"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 font-medium px-7 py-3 rounded-full text-sm transition-all duration-150"
                >
                  View source
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
