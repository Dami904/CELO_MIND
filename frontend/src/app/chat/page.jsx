'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { createWalletClient, custom } from 'viem';
import { celo } from 'viem/chains';
import { apiClient } from '@/lib/api';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ResultCard from '@/components/ui/ResultCard';

// ── Hex rendering ──────────────────────────────────────────────────────────────
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
        className="font-mono text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 rounded px-1 py-0.5 text-[11px] cursor-pointer select-all"
        title={value}
        onClick={copy}
      >
        {display}
      </span>
      <button
        onClick={copy}
        title={`Copy full ${isTx ? 'transaction hash' : 'address'}`}
        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
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
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-inherit">
      {parts.map((part, i) =>
        isHex(part) ? <CopyableHex key={i} value={part} /> : part
      )}
    </p>
  );
}

// ── Sidebar suggestions ────────────────────────────────────────────────────────
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
          className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"
          style={{ animation: `typingBounce 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}


const GREETING = "Hi! I'm CeloMind — your AI guide to the Celo network. Ask me to check your balance, swap tokens, look up prices, or check if something looks risky. What would you like to do?";
const HISTORY_KEY = 'celomind_chat_history';
const MAX_HISTORY = 20;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY))); } catch {}
}
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main chat component ────────────────────────────────────────────────────────
function ChatInner() {
  const searchParams = useSearchParams();
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');

  const [messages, setMessages] = useState([
    { role: 'assistant', content: GREETING, ts: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCat, setActiveCat] = useState('My wallet');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [history, setHistory] = useState([]);

  // Load history from localStorage on mount
  useEffect(() => { setHistory(loadHistory()); }, []);

  // Sidebar opens by default on desktop; on mobile it stays closed and overlays.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) setSidebarOpen(true);
  }, []);

  // Confirmation modal state
  const [pendingTx, setPendingTx] = useState(null);
  const [isSigning, setIsSigning] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) { setInput(q); inputRef.current?.focus(); }
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > 120);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  const addMessage = (msg) => setMessages((prev) => [...prev, msg]);

  // Save current session to history (only if it has user messages)
  const saveCurrentSession = useCallback((currentMessages, currentId) => {
    const firstUser = currentMessages.find((m) => m.role === 'user');
    if (!firstUser) return;
    const entry = {
      id: currentId,
      title: firstUser.content.slice(0, 60),
      ts: new Date().toISOString(),
    };
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.id !== currentId);
      const next = [entry, ...filtered];
      saveHistory(next);
      return next;
    });
  }, []);

  const startNewChat = useCallback(() => {
    saveCurrentSession(messages, conversationId);
    const newId = crypto.randomUUID();
    setConversationId(newId);
    setMessages([{ role: 'assistant', content: GREETING, ts: new Date() }]);
    setInput('');
  }, [messages, conversationId, saveCurrentSession]);

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput('');

    const userMsg = { role: 'user', content, ts: new Date() };
    // If this is the first user message, register session in history
    const isFirst = !messages.some((m) => m.role === 'user');
    if (isFirst) {
      const entry = { id: conversationId, title: content.slice(0, 60), ts: new Date().toISOString() };
      setHistory((prev) => {
        const next = [entry, ...prev.filter((h) => h.id !== conversationId)];
        saveHistory(next);
        return next;
      });
    }
    addMessage(userMsg);
    setLoading(true);

    try {
      const response = await apiClient.sendMessage(
        content,
        isConnected && address ? address : undefined,
        'full',
        conversationId
      );

      if (!response.success) {
        addMessage({ role: 'assistant', content: response.message, ts: new Date(), error: true });
        return;
      }

      // If the backend returned a transaction to sign, show confirm modal.
      if (response.data?.pendingTx) {
        setPendingTx(response.data.pendingTx);
      }

      addMessage({
        role: 'assistant',
        content: response.message,
        ts: new Date(),
        resultCard: response.data?.resultCard ?? null,
        pendingTx: response.data?.pendingTx ?? null,
      });
    } catch {
      addMessage({ role: 'assistant', content: 'Something went wrong. Please try again.', ts: new Date(), error: true });
    } finally {
      setLoading(false);
    }
  }, [input, loading, address, isConnected, conversationId]);

  // Sign and broadcast the pending transaction via the connected wallet.
  const handleConfirm = async () => {
    if (!pendingTx || !walletProvider) return;
    setIsSigning(true);
    try {
      const walletClient = createWalletClient({
        chain: celo,
        transport: custom(walletProvider),
      });
      const [account] = await walletClient.getAddresses();

      for (const tx of pendingTx.transactions) {
        const hash = await walletClient.sendTransaction({
          account,
          to: tx.to,
          data: tx.data ?? '0x',
          value: tx.value ? BigInt(tx.value) : 0n,
        });
        addMessage({
          role: 'assistant',
          content: `Transaction submitted on Celo Mainnet.\nHash: ${hash}`,
          ts: new Date(),
        });
      }
    } catch (err) {
      addMessage({
        role: 'assistant',
        content: err?.code === 4001 ? 'Transaction cancelled.' : `Signing failed: ${err?.message ?? 'unknown error'}`,
        ts: new Date(),
        error: true,
      });
    } finally {
      setIsSigning(false);
      setPendingTx(null);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const fmtTime = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex relative" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Confirmation modal ── */}
      {pendingTx && (
        <ConfirmModal
          isOpen={!!pendingTx}
          onClose={() => setPendingTx(null)}
          onConfirm={handleConfirm}
          title={pendingTx.title}
          data={pendingTx.data}
          isSubmitting={isSigning}
        />
      )}

      {/* ── Mobile sidebar backdrop ── */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-0'} shrink-0 overflow-hidden transition-all duration-250 border-r border-slate-200 dark:border-white/8 bg-stone-50 dark:bg-[#131210] flex flex-col absolute lg:relative inset-y-0 left-0 z-30`}
      >
        <div className="w-64 flex flex-col h-full overflow-y-auto">

          {/* ── New chat button ── */}
          <div className="px-4 pt-4 pb-2 shrink-0">
            <button
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium
                text-amber-800 dark:text-amber-400
                bg-[#FFF8D6] dark:bg-[#FCBE00]/10
                hover:bg-[#FCBE00] dark:hover:bg-[#FCBE00]/25
                border border-[#FCBE00]/40 dark:border-[#FCBE00]/20
                rounded-xl px-3 py-2 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </button>
          </div>

          {/* ── Chat history ── */}
          {history.length > 0 && (
            <div className="px-4 pb-3 flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1 px-1">
                Recent
              </p>
              {history.slice(0, 8).map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    // Start fresh session — full history retrieval needs backend support
                    startNewChat();
                  }}
                  className="group flex flex-col items-start px-3 py-2 rounded-xl text-left
                    hover:bg-white dark:hover:bg-white/8
                    border border-transparent hover:border-slate-100 dark:hover:border-white/10
                    transition-all duration-100"
                >
                  <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug line-clamp-1 group-hover:text-slate-900 dark:group-hover:text-slate-100">
                    {h.title}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {relativeTime(h.ts)}
                  </span>
                </button>
              ))}
              {history.length > 8 && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 px-3 pt-1">
                  +{history.length - 8} more
                </p>
              )}
            </div>
          )}

          {/* ── Divider ── */}
          <div className="mx-4 border-t border-slate-100 dark:border-white/6 mb-3" />

          {/* ── Suggestions ── */}
          <div className="px-4 flex flex-col gap-3 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1">
              Suggestions
            </p>
            <div className="flex flex-col gap-0.5">
              {Object.keys(suggestions).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCat(cat)}
                  className={`text-left text-sm rounded-xl px-3 py-2 transition-all ${
                    activeCat === cat
                      ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-slate-100 font-medium shadow-sm border border-slate-100 dark:border-white/10'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-white/6 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1 pb-4">
              {suggestions[activeCat].map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="text-left text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-white/8 hover:border-slate-100 dark:hover:border-white/10 border border-transparent rounded-xl px-3 py-2 transition-all leading-snug"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-stone-50 dark:bg-[#0F0E0C]">

        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/8 bg-white dark:bg-[#131210] shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-stone-100 dark:hover:bg-white/8 rounded-lg p-1.5 transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-400/10 ring-1 ring-amber-200/60 dark:ring-amber-400/15 flex items-center justify-center shrink-0">
            <img src="/logo-icon.png" alt="CeloMind" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">CeloMind</p>
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              Agent ready
            </p>
          </div>
          {/* Connected wallet badge */}
          {isConnected && address && (
            <div className="ml-auto flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5 max-w-2xl w-full mx-auto relative">


          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 items-end ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-amber-50 dark:bg-amber-400/10 ring-1 ring-amber-200/60 dark:ring-amber-400/15 flex items-center justify-center shrink-0">
                  <img src="/logo-icon.png" alt="CeloMind" className="w-5 h-5 object-contain" />
                </div>
              )}
              <div className="max-w-[78%] flex flex-col gap-2">
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-slate-900 dark:bg-[#FCBE00] dark:text-slate-900 text-white rounded-br-md'
                      : msg.error
                      ? 'bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-800/40 text-slate-700 dark:text-red-300 rounded-bl-md'
                      : 'bg-white dark:bg-[#1A1916] border border-slate-200 dark:border-white/8 shadow-sm text-slate-600 dark:text-slate-300 rounded-bl-md'
                  }`}
                >
                  <MessageText content={msg.content} />
                  <span className={`text-[11px] mt-1.5 block ${msg.role === 'user' ? 'text-white/55 dark:text-slate-900/50' : 'text-slate-400 dark:text-slate-500'}`}>
                    {fmtTime(msg.ts)}
                  </span>
                </div>

                {/* Result card rendered below the bubble */}
                {msg.resultCard && (
                  <ResultCard
                    title={msg.resultCard.title}
                    data={msg.resultCard.data}
                    className="rounded-xl border-slate-200"
                  />
                )}

                {/* Pending tx — show a sign button if no modal was triggered yet */}
                {msg.pendingTx && !pendingTx && (
                  <button
                    onClick={() => setPendingTx(msg.pendingTx)}
                    className="self-start text-xs font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-4 py-1.5 transition-all"
                  >
                    Review & sign transaction →
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5 items-end">
              <div className="w-7 h-7 rounded-full bg-amber-50 dark:bg-amber-400/10 ring-1 ring-amber-200/60 dark:ring-amber-400/15 flex items-center justify-center shrink-0"><img src="/logo-icon.png" alt="CeloMind" className="w-5 h-5 object-contain" /></div>
              <div className="bg-white dark:bg-[#1A1916] border border-slate-200 dark:border-white/8 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />

          {/* Scroll-to-bottom button */}
          {showScrollBtn && (
            <button
              onClick={scrollToBottom}
              className="sticky bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full
                bg-white dark:bg-[#1A1916]
                border border-slate-200 dark:border-white/10
                shadow-md hover:shadow-lg
                text-slate-500 dark:text-slate-400
                flex items-center justify-center
                hover:-translate-y-0.5 hover:border-[#FCBE00]
                transition-all duration-150 z-10"
              aria-label="Scroll to bottom"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-slate-200 dark:border-white/8 bg-white dark:bg-[#131210] px-4 pt-3 pb-5 max-w-2xl w-full mx-auto self-center">
          <div className={`flex items-end gap-2 bg-stone-100 dark:bg-white/6 rounded-2xl px-4 py-2.5 border transition-colors ${input ? 'border-[#FCBE00]' : 'border-stone-200 dark:border-white/8'}`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={isConnected ? '"What\'s my balance?" or "Swap 5 CELO for cUSD"' : '"Show me CELO price" or paste a wallet address…'}
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-[color:var(--text-primary)] caret-[var(--celo-gold)] placeholder:text-[color:var(--text-tertiary)] outline-none resize-none leading-relaxed max-h-36 overflow-y-auto disabled:opacity-50"
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
          <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-2">
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
