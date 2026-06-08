'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { apiGet } from '@/lib/api';

const MCP_URL = 'https://celo-mind-nmk2.onrender.com/mcp';

const MCP_CLIENTS = [
  { id: 'claude',   label: 'Claude Desktop (Mac / Windows)', icon: '🤖' },
  { id: 'cursor',   label: 'Cursor IDE',                     icon: '⌨️' },
  { id: 'windsurf', label: 'Windsurf',                       icon: '🏄' },
  { id: 'vscode',   label: 'VS Code (Copilot)',               icon: '💻' },
  { id: 'web',      label: 'Web chat — no config needed',     icon: '🌐' },
];

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
  const [mcpClient, setMcpClient] = useState('claude');
  const [copied, setCopied] = useState('');
  const [liveStats, setLiveStats] = useState([
    { value: '75', label: 'AI tools' },
    { value: '—', label: 'CELO price' },
    { value: '—', label: 'Ecosystem TVL' },
    { value: '100%', label: 'Open source' },
  ]);

  useEffect(() => {
    apiGet('/api/dashboard/metrics').then((d) => {
      const price = d?.celoPrice?.usd != null ? `$${Number(d.celoPrice.usd).toFixed(3)}` : null;
      const tvl = d?.tvl?.usd != null ? `$${(d.tvl.usd / 1e6).toFixed(0)}M` : null;
      setLiveStats([
        { value: '75', label: 'AI tools' },
        { value: price ?? '—', label: 'CELO price' },
        { value: tvl ?? '—', label: 'Ecosystem TVL' },
        { value: '100%', label: 'Open source' },
      ]);
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

      {/* ── What is CeloMind ── */}
      <section className="bg-stone-100 dark:bg-[#1A1916] border-y border-stone-200 dark:border-white/8 overflow-hidden transition-colors duration-200">
        <div className="max-w-5xl mx-auto px-4 py-16 md:py-20 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">What is CeloMind?</p>
            <h2 className="font-display text-3xl md:text-4xl font-light text-slate-900 dark:text-slate-100 mb-5 leading-snug">
              Crypto can be complex.<br />We made it conversational.
            </h2>
            <p className="text-base text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed mb-10">
              CeloMind connects an AI assistant to the Celo blockchain — a fast, low-cost network built for
              everyday use. Instead of copying addresses or figuring out DeFi, you just type what you want.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {steps.map((s) => (
                <div key={s.n} className="flex gap-4 items-start">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-[#FCBE00] text-slate-900 font-display font-semibold text-sm flex items-center justify-center">
                    {s.n}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200 text-sm mb-1">{s.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
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

      {/* ── Capabilities ── */}
      <section className="max-w-5xl mx-auto px-4 py-16 md:py-20">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">What you can do</p>
        <h2 className="font-display text-3xl font-light text-slate-900 dark:text-slate-100 mb-8">Three ways CeloMind helps you</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {capabilities.map((c) => (
            <div key={c.title} className="bg-white dark:bg-[#1A1916] rounded-2xl border border-slate-200 dark:border-white/8 p-6 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/8 rounded-full px-3 py-0.5 mb-3 inline-block">{c.badge}</span>
              <h3 className="font-medium text-slate-800 dark:text-slate-200 text-base mb-2">{c.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Prompt chips ── */}
      <section className="bg-stone-100/60 dark:bg-[#1A1916]/60 border-y border-stone-200 dark:border-white/8 transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 py-16 md:py-20">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Try these</p>
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

      {/* ── MCP Connect ── */}
      <section className="px-4 py-8 md:py-12 bg-stone-100/60 dark:bg-[#1A1916]/60 border-y border-stone-200 dark:border-white/8 transition-colors duration-200">
        <Reveal delay={0}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Connect</p>
          <h2 className="font-display text-3xl font-light text-slate-900 dark:text-slate-100 mb-8">Use CeloMind in your AI client</h2>
          <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: '#0D0C0A' }}>
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-white/8">

              {/* Left — client list */}
              <div className="p-6 flex flex-col">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">Pick your platform</p>
                <div className="flex flex-col gap-1">
                  {MCP_CLIENTS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setMcpClient(c.id)}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-left transition-all duration-150 ${mcpClient === c.id ? 'bg-white/10 text-white font-medium' : 'text-white/45 hover:text-white/75 hover:bg-white/5'}`}
                    >
                      <span className="text-base shrink-0 w-6 text-center">{c.icon}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/25 leading-relaxed mt-auto pt-5">
                  Free and public — no token or signup required.
                </p>
              </div>

              {/* Right — config */}
              <div key={mcpClient} className="p-6 flex flex-col gap-5 min-w-0 animate-slide-right">

                {mcpClient === 'claude' && (
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">1 — EASIEST</span>
                        <span className="text-sm font-medium text-white/70">Settings UI — no config editing</span>
                      </div>
                      <p className="text-xs text-white/45 leading-relaxed">
                        Claude Desktop → Settings → Connectors → Add custom connector → paste this URL:
                      </p>
                      <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5">
                        <span className="font-mono text-sm text-white/80 flex-1 truncate">{MCP_URL}</span>
                        <button onClick={() => copyText(MCP_URL, 'url1')} className="shrink-0 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors">
                          {copied === 'url1' ? '✓ Copied' : 'Copy URL'}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-white/10 text-white/50 px-2 py-0.5 rounded">2 — RECOMMENDED</span>
                        <span className="text-sm font-medium text-white/70">Config file — modern</span>
                      </div>
                      <pre className="bg-black/40 border border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ mcpServers: { celomind: { url: MCP_URL } } }, null, 2)}</pre>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <button onClick={() => copyText(JSON.stringify({ mcpServers: { celomind: { url: MCP_URL } } }, null, 2), 'cfg1')} className="text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 px-4 py-1.5 rounded-lg transition-colors">
                          {copied === 'cfg1' ? '✓ Copied' : 'Copy'}
                        </button>
                        <span className="font-mono text-[10px] text-white/25 truncate">~/Library/Application Support/Claude/claude_desktop_config.json</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-white/6 text-white/35 px-2 py-0.5 rounded">3 — LEGACY FALLBACK</span>
                        <span className="text-sm font-medium text-white/50">Config file — requires Node.js</span>
                      </div>
                      <pre className="bg-black/40 border border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ mcpServers: { celomind: { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL] } } }, null, 2)}</pre>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <button onClick={() => copyText(JSON.stringify({ mcpServers: { celomind: { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL] } } }, null, 2), 'cfg2')} className="text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 px-4 py-1.5 rounded-lg transition-colors">
                          {copied === 'cfg2' ? '✓ Copied' : 'Copy'}
                        </button>
                        <span className="text-[10px] text-white/25">Use this if Method 2 shows &quot;not valid MCP server configurations&quot;.</span>
                      </div>
                    </div>
                  </div>
                )}

                {mcpClient === 'cursor' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-white/45 leading-relaxed">
                      Open <span className="text-white/75 font-medium">Cursor Settings → MCP</span> and add a new server, or paste into{' '}
                      <code className="bg-white/10 px-1.5 py-0.5 rounded text-white/65 font-mono">~/.cursor/mcp.json</code>
                    </p>
                    <pre className="bg-black/40 border border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ mcpServers: { celomind: { url: MCP_URL, type: 'http' } } }, null, 2)}</pre>
                    <p className="text-xs text-white/30">No token required. Restart Cursor after saving.</p>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button onClick={() => copyText(JSON.stringify({ mcpServers: { celomind: { url: MCP_URL, type: 'http' } } }, null, 2), 'cursor')} className="text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 px-4 py-2 rounded-lg transition-colors">
                        {copied === 'cursor' ? '✓ Copied' : 'Copy config'}
                      </button>
                      <span className="font-mono text-[10px] text-white/25 truncate">%APPDATA%\Cursor\User\globalStorage\cursor.mcp\mcp.json</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-white/6">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-1">Linux</p>
                      <code className="font-mono text-[10px] text-white/35">~/.cursor/mcp.json</code>
                    </div>
                  </div>
                )}

                {mcpClient === 'windsurf' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-white/45 leading-relaxed">
                      Open <span className="text-white/75 font-medium">Windsurf → Cascade panel → Plugin settings</span>, or edit the config file directly:
                    </p>
                    <pre className="bg-black/40 border border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ mcpServers: { celomind: { serverUrl: MCP_URL } } }, null, 2)}</pre>
                    <p className="text-xs text-white/30">Reload the Windsurf window after saving.</p>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button onClick={() => copyText(JSON.stringify({ mcpServers: { celomind: { serverUrl: MCP_URL } } }, null, 2), 'windsurf')} className="text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 px-4 py-2 rounded-lg transition-colors">
                        {copied === 'windsurf' ? '✓ Copied' : 'Copy config'}
                      </button>
                      <span className="font-mono text-[10px] text-white/25 truncate">~/.codeium/windsurf/mcp_config.json</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-white/6">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-1">Windows</p>
                      <code className="font-mono text-[10px] text-white/35">%APPDATA%\Codeium\windsurf\mcp_config.json</code>
                    </div>
                  </div>
                )}

                {mcpClient === 'vscode' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-white/45 leading-relaxed">
                      Requires <span className="text-white/75 font-medium">GitHub Copilot + VS Code ≥ 1.99</span>. Create{' '}
                      <code className="bg-white/10 px-1.5 py-0.5 rounded text-white/65 font-mono">.vscode/mcp.json</code> in your project:
                    </p>
                    <pre className="bg-black/40 border border-white/8 rounded-xl p-4 text-xs font-mono text-emerald-400 leading-relaxed overflow-x-auto">{JSON.stringify({ servers: { celomind: { type: 'http', url: MCP_URL } } }, null, 2)}</pre>
                    <p className="text-xs text-white/30">Open Copilot Chat → Agent mode to access CeloMind tools.</p>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button onClick={() => copyText(JSON.stringify({ servers: { celomind: { type: 'http', url: MCP_URL } } }, null, 2), 'vscode')} className="text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 px-4 py-2 rounded-lg transition-colors">
                        {copied === 'vscode' ? '✓ Copied' : 'Copy config'}
                      </button>
                      <span className="font-mono text-[10px] text-white/25">.vscode/mcp.json</span>
                    </div>
                  </div>
                )}

                {mcpClient === 'web' && (
                  <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                    <span className="text-5xl">🌐</span>
                    <div>
                      <p className="text-white/80 font-medium mb-1">No setup needed</p>
                      <p className="text-sm text-white/40 max-w-xs leading-relaxed">CeloMind&apos;s web chat is already connected. Open the chat and start asking — 75 tools, zero config.</p>
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
