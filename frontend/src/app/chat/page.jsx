'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// Matches full 0x hashes (66 chars = tx hash) and 0x addresses (42 chars).
const HEX_RE = /(0x[0-9a-fA-F]{64}|0x[0-9a-fA-F]{40})/g;
const isHex = (s) => /^0x[0-9a-fA-F]{40,64}$/.test(s);

function CopyableHex({ value }) {
  const [copied, setCopied] = useState(false);
  const isTx = value.length === 66;
  const display = `${value.slice(0, 8)}…${value.slice(-6)}`;

  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span className="inline-flex items-center gap-1 align-baseline">
      <span
        className="font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 text-[11px] cursor-pointer select-all"
        title={value}
        onClick={copy}
      >
        {display}
      </span>
      <button
        onClick={copy}
        title={`Copy full ${isTx ? 'transaction hash' : 'address'}`}
        className="text-slate-400 hover:text-slate-700 transition-colors"
        style={{ lineHeight: 1 }}
      >
        {copied ? (
          <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </button>
    </span>
  );
}

function MessageText({ content }) {
  const parts = content.split(HEX_RE);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        isHex(part) ? <CopyableHex key={i} value={part} /> : part
      )}
    </p>
  );
}

const suggestions = {
  'My wallet': [
    'Check my CELO balance',
    'View my full portfolio',
    'Show recent transactions',
    'How many cUSD do I have?',
  ],
  'Send & swap': [
    'Swap 10 CELO for cUSD',
    'Send 1 CELO to 0x...',
    'Get a swap quote',
    "What's the gas fee right now?",
  ],
  'Market': [
    'What are trending tokens?',
    'Show whale wallet activity',
    'Best yield opportunities',
    'Top liquidity pools today',
  ],
  'Safety': [
    'Is this contract safe? 0x...',
    'Check risk score for 0x...',
    'Explain a transaction to me',
    'Analyze this wallet strategy',
  ],
};

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-slate-300"
          style={{ animation: `typingBounce 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

function ChatInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hi! I'm CeloMind — your AI guide to the Celo network. Ask me to check your balance, swap tokens, look up prices, or check if something looks risky. What would you like to do?",
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCat, setActiveCat] = useState('My wallet');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) { setInput(q); inputRef.current?.focus(); }
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput('');

    const userMsg = { role: 'user', content, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const reply = data?.message || data?.content || "Sorry, I couldn't process that.";
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, ts: new Date() }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.', ts: new Date(), error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const fmtTime = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Sidebar ── */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-0'} shrink-0 overflow-hidden transition-all duration-250 border-r border-slate-200 bg-stone-50 flex flex-col`}
      >
        <div className="w-64 flex flex-col h-full p-4 gap-4 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-widest text-slate-400">Suggestions</span>
            <button
              onClick={() => setMessages([{ role: 'assistant', content: 'New conversation started. What would you like to do?', ts: new Date() }])}
              className="text-xs font-medium text-amber-700 bg-[#FFF8D6] hover:bg-[#FCBE00] rounded-full px-2.5 py-1 transition-colors whitespace-nowrap"
            >
              + New chat
            </button>
          </div>

          {/* Category tabs */}
          <div className="flex flex-col gap-0.5">
            {Object.keys(suggestions).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`text-left text-sm rounded-xl px-3 py-2 transition-all ${
                  activeCat === cat
                    ? 'bg-white text-slate-800 font-medium shadow-sm border border-slate-100'
                    : 'text-slate-500 hover:bg-stone-100 hover:text-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Prompt buttons */}
          <div className="flex flex-col gap-1">
            {suggestions[activeCat].map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="text-left text-sm text-slate-500 hover:text-slate-800 hover:bg-white hover:border-slate-100 border border-transparent rounded-xl px-3 py-2 transition-all leading-snug"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-slate-400 hover:text-slate-700 hover:bg-stone-100 rounded-lg p-1.5 transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <div className="w-9 h-9 rounded-full bg-[#FCBE00] text-slate-900 font-display font-semibold text-sm flex items-center justify-center shrink-0">
            CM
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">CeloMind</p>
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              Agent ready
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5 max-w-2xl w-full mx-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 items-end ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-[#FCBE00] text-slate-900 font-display font-bold text-xs flex items-center justify-center shrink-0">
                  CM
                </div>
              )}
              <div
                className={`max-w-[78%] px-4 py-3 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white/90 rounded-br-md'
                    : msg.error
                    ? 'bg-red-50 border border-red-100 text-slate-700 rounded-bl-md'
                    : 'bg-white border border-slate-200 shadow-sm text-slate-600 rounded-bl-md'
                }`}
              >
                <MessageText content={msg.content} />
                <span className={`text-[11px] mt-1.5 block ${msg.role === 'user' ? 'text-white/40' : 'text-slate-300'}`}>
                  {fmtTime(msg.ts)}
                </span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5 items-end">
              <div className="w-7 h-7 rounded-full bg-[#FCBE00] text-slate-900 font-display font-bold text-xs flex items-center justify-center shrink-0">CM</div>
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 pb-5 max-w-2xl w-full mx-auto self-center">
          <div className={`flex items-end gap-2 bg-stone-100 rounded-2xl px-4 py-2.5 border transition-colors ${input ? 'border-[#FCBE00]' : 'border-stone-200'}`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={"\"What's my balance?\" or \"Swap 5 CELO for cUSD\""}
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none resize-none leading-relaxed max-h-36 overflow-y-auto disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="shrink-0 w-8 h-8 rounded-full bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 text-base flex items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              ↑
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">
            CeloMind will never move funds without your approval.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading…</div>}>
      <ChatInner />
    </Suspense>
  );
}
