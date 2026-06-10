'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { createWalletClient, custom } from 'viem';
import { celo } from 'viem/chains';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

function InlineText({ children }) {
  const text = String(children);
  const parts = text.split(HEX_RE);
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((p, i) => isHex(p) ? <CopyableHex key={i} value={p} /> : p)}</>;
}

function MessageText({ content }) {
  return (
    <div className="text-sm leading-relaxed break-words text-inherit space-y-1.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-1 last:mb-0 whitespace-pre-wrap"><InlineText>{children}</InlineText></p>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold mt-2 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-1.5 mb-0.5">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5 my-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ children, className }) => {
            const text = String(children).trim();
            const isBlock = !!className;
            if (!isBlock && isHex(text)) return <CopyableHex value={text} />;
            if (!isBlock) return (
              <code className="font-mono text-[11px] bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 rounded px-1 py-0.5">{children}</code>
            );
            return <code className="block font-mono text-[11px] overflow-x-auto">{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="bg-slate-100 dark:bg-white/8 rounded-lg px-3 py-2 overflow-x-auto my-1.5 text-[11px] font-mono">{children}</pre>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#FCBE00] underline underline-offset-2 hover:text-[#C49200]">{children}</a>
          ),
          hr: () => <hr className="border-slate-200 dark:border-white/10 my-2" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#FCBE00]/60 pl-3 text-slate-500 dark:text-slate-400 italic my-1">{children}</blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
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
    'who are the top 10 whales on celo today',
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
// History is scoped per connected wallet, with a shared "guest" bucket for the
// not-connected state. Each wallet only ever sees its own history (no cross-wallet
// leakage on a shared browser); connecting a wallet folds the guest history into it.
const HISTORY_PREFIX = 'celomind_chat_history__';
const LEGACY_HISTORY_KEY = 'celomind_chat_history'; // pre-scope global key — migrated into guest
const MAX_HISTORY = 20;

function scopeOf(walletAddress) {
  return walletAddress ? `w_${walletAddress.toLowerCase()}` : 'guest';
}
function loadHistory(scope) {
  try { return JSON.parse(localStorage.getItem(HISTORY_PREFIX + scope) ?? '[]'); } catch { return []; }
}
function saveHistory(scope, history) {
  try { localStorage.setItem(HISTORY_PREFIX + scope, JSON.stringify(history.slice(0, MAX_HISTORY))); } catch {}
}
// Merge two history lists, dedupe by id (keep the newer entry), newest-first, capped.
function mergeHistories(a, b) {
  const byId = new Map();
  for (const e of [...(a ?? []), ...(b ?? [])]) {
    if (!e?.id) continue;
    const prev = byId.get(e.id);
    if (!prev || new Date(e.ts) > new Date(prev.ts)) byId.set(e.id, e);
  }
  return [...byId.values()].sort((x, y) => new Date(y.ts) - new Date(x.ts)).slice(0, MAX_HISTORY);
}

// Per-conversation message persistence so a chat can be resumed from history.
// Message blobs are keyed by conversationId (globally unique), so they're shared
// across scopes — visibility is controlled entirely by the per-scope history index.
const MSGS_PREFIX = 'celomind_chat_msgs_';
function loadMessages(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(MSGS_PREFIX + id) ?? 'null');
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.map((m) => ({ ...m, ts: new Date(m.ts) }));
  } catch { return null; }
}
function saveMessages(id, messages) {
  try { localStorage.setItem(MSGS_PREFIX + id, JSON.stringify(messages)); } catch {}
}
// Drop message blobs not referenced by ANY scope's history (+ the active conversation),
// so localStorage stays bounded without wiping other wallets' stored chats.
function pruneMessages(activeId) {
  try {
    const keep = new Set();
    if (activeId) keep.add(MSGS_PREFIX + activeId);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(HISTORY_PREFIX)) continue;
      try {
        for (const e of JSON.parse(localStorage.getItem(k) ?? '[]')) {
          if (e?.id) keep.add(MSGS_PREFIX + e.id);
        }
      } catch { /* skip unparseable bucket */ }
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(MSGS_PREFIX) && !keep.has(k)) localStorage.removeItem(k);
    }
  } catch {}
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

function humanizeWalletError(err) {
  const code = err?.code ?? err?.cause?.code;
  const raw = (err?.message ?? err?.cause?.message ?? '').toLowerCase();

  // User explicitly cancelled in wallet
  if (code === 4001 || code === 'ACTION_REJECTED' || raw.includes('user rejected') || raw.includes('user denied') || raw.includes('rejected the request')) {
    return "You cancelled the transaction — nothing was sent.";
  }
  // Insufficient funds
  if (raw.includes('insufficient funds') || raw.includes('insufficient balance') || raw.includes('exceeds balance')) {
    return "Your wallet doesn't have enough funds to cover this transaction and gas fees.";
  }
  // Chain / network mismatch
  if (raw.includes('wrong network') || raw.includes('chain mismatch') || raw.includes('unsupported chain') || raw.includes('switch') && raw.includes('chain')) {
    return "Your wallet is on the wrong network. Switch to Celo Mainnet and try again.";
  }
  // Contract execution reverted
  if (raw.includes('revert') || raw.includes('execution reverted') || raw.includes('contract call reverted')) {
    return "The transaction was rejected by the contract — this can happen if parameters are invalid or you lack permission.";
  }
  // Gas estimation failed
  if (raw.includes('gas') && (raw.includes('estimat') || raw.includes('exceeds') || raw.includes('limit'))) {
    return "Couldn't estimate gas for this transaction. Check your balance and try again.";
  }
  // Nonce issues
  if (raw.includes('nonce') || raw.includes('replacement transaction')) {
    return "There's a pending transaction on your wallet. Wait for it to confirm, then try again.";
  }
  // Wallet not connected / locked
  if (raw.includes('no account') || raw.includes('not connected') || raw.includes('wallet locked') || raw.includes('provider is not set')) {
    return "Your wallet isn't connected. Reconnect and try again.";
  }
  // RPC / network error
  if (raw.includes('network error') || raw.includes('failed to fetch') || raw.includes('rpc') || raw.includes('timeout')) {
    return "Couldn't reach the Celo network right now. Check your connection and try again.";
  }
  // Generic fallback — hide the technical details
  return "The transaction couldn't be completed. Please check your wallet and try again.";
}

// ── Slash command palette ──────────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { cmd: 'balance',    icon: '💰', label: 'Balance',            desc: 'Check your CELO or token balance',                      prompt: 'What is my CELO balance?' },
  { cmd: 'price',      icon: '📊', label: 'Token price',        desc: 'Live price for CELO or any supported token',            prompt: 'What is the current price of CELO?' },
  { cmd: 'portfolio',  icon: '💼', label: 'Portfolio',          desc: 'All token holdings for a wallet',                      prompt: 'Show my portfolio' },
  { cmd: 'swap',       icon: '🔄', label: 'Swap tokens',        desc: 'Get a quote or execute a token swap',                   prompt: 'Swap 10 CELO to cUSD' },
  { cmd: 'send',       icon: '📤', label: 'Send tokens',        desc: 'Transfer CELO or tokens to an address',                 prompt: 'Send 1 CELO to ' },
  { cmd: 'launch',     icon: '🚀', label: 'Launch token',       desc: 'Deploy a new ERC-20 token on Celo',                    prompt: 'Launch a token called ' },
  { cmd: 'whales',     icon: '🐋', label: 'Whale leaderboard',  desc: 'Top CELO large-holders ranked by balance',             prompt: 'Show me the top CELO whale leaderboard' },
  { cmd: 'trending',   icon: '🔥', label: 'Trending tokens',    desc: 'High-volume tokens on Celo right now',                 prompt: 'What are the trending tokens on Celo?' },
  { cmd: 'pulse',      icon: '🌐', label: 'Network pulse',      desc: 'Live Celo stats: gas, price, trending, yields',        prompt: "What's happening on Celo today?" },
  { cmd: 'gas',        icon: '⛽', label: 'Gas price',          desc: 'Current Celo network gas fee',                         prompt: 'What is the current gas price on Celo?' },
  { cmd: 'risk',       icon: '🛡️', label: 'Risk scan',          desc: 'Honeypot and rug-pull check for a token or contract',  prompt: 'Is this token safe to buy: ' },
  { cmd: 'staking',    icon: '🔒', label: 'Staking',            desc: 'Locked CELO, active votes, pending stakes',            prompt: 'Show my staking balances and locked CELO' },
  { cmd: 'yield',      icon: '💸', label: 'Best yield',         desc: 'Top APY across Celo lending and liquidity pools',      prompt: 'What are the best yield opportunities on Celo?' },
  { cmd: 'nfts',       icon: '🖼️', label: 'My NFTs',            desc: 'ERC-721 and ERC-1155 NFTs held by your wallet',        prompt: 'Show my NFT holdings' },
  { cmd: 'governance', icon: '🗳️', label: 'Governance',         desc: 'Active CGPs with vote tallies and deadlines',          prompt: 'Show me active Celo governance proposals' },
  { cmd: 'history',    icon: '📜', label: 'Transaction history', desc: 'Recent on-chain activity for a wallet',               prompt: 'Show my recent transactions' },
  { cmd: 'compare',    icon: '🔍', label: 'Compare wallets',    desc: 'Side-by-side token portfolio of two addresses',        prompt: 'Compare wallet ' },
  { cmd: 'gooddollar', icon: '🤑', label: 'GoodDollar UBI',     desc: 'Check claimable G$ amount and whitelist status',       prompt: 'Check my GoodDollar UBI claim' },
];

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
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Which history bucket is active: the connected wallet, or the shared guest bucket.
  const currentScope = scopeOf(isConnected && address ? address : undefined);
  const scopeRef = useRef(currentScope);   // latest scope, read inside callbacks
  const prevScopeRef = useRef(null);        // to detect guest -> wallet transitions

  // Load the right history bucket whenever the wallet scope changes. On the guest -> wallet
  // transition, fold the guest history into the wallet bucket (compound), then clear guest so
  // it can't later leak into a different wallet on the same browser.
  useEffect(() => {
    // One-time migration of the old global (pre-scope) history into the guest bucket.
    try {
      const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
      if (legacy) {
        saveHistory('guest', mergeHistories(loadHistory('guest'), JSON.parse(legacy)));
        localStorage.removeItem(LEGACY_HISTORY_KEY);
      }
    } catch { /* ignore */ }

    const prev = prevScopeRef.current;
    if (prev === 'guest' && currentScope !== 'guest') {
      saveHistory(currentScope, mergeHistories(loadHistory(currentScope), loadHistory('guest')));
      saveHistory('guest', []);
    }
    prevScopeRef.current = currentScope;
    scopeRef.current = currentScope;
    setHistory(loadHistory(currentScope));
    setHistoryLoaded(true);
  }, [currentScope]);

  // Persist the current conversation's messages so it can be resumed later.
  useEffect(() => {
    if (!messages.some((m) => m.role === 'user')) return;
    saveMessages(conversationId, messages);
  }, [messages, conversationId]);

  // Keep stored messages bounded to conversations still referenced by any scope (+ the active one).
  // Guarded so it never runs before history has loaded (which would wipe stored chats).
  useEffect(() => {
    if (!historyLoaded) return;
    pruneMessages(conversationId);
  }, [historyLoaded, history, conversationId]);

  // Sidebar opens by default on desktop; on mobile it stays closed and overlays.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) setSidebarOpen(true);
  }, []);

  // Confirmation modal state
  const [pendingTx, setPendingTx] = useState(null);
  const [isSigning, setIsSigning] = useState(false);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashHighlight, setSlashHighlight] = useState(0);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const slashMenuRef = useRef(null);
  const scrollRef = useRef(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) { setInput(q); inputRef.current?.focus(); }
  }, [searchParams]);

  // Auto-grow the input as text wraps to new lines, up to a max height (then it scrolls).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

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
      saveHistory(scopeRef.current, next);
      return next;
    });
  }, []);

  const closeSidebarOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setSidebarOpen(false);
  }, []);

  const startNewChat = useCallback(() => {
    saveCurrentSession(messages, conversationId);
    const newId = crypto.randomUUID();
    setConversationId(newId);
    setMessages([{ role: 'assistant', content: GREETING, ts: new Date() }]);
    setInput('');
    closeSidebarOnMobile();
  }, [messages, conversationId, saveCurrentSession, closeSidebarOnMobile]);

  // Resume a past conversation: restore its messages and reuse its id so the backend
  // (which keys chat memory by conversationId) continues the thread seamlessly.
  const openConversation = useCallback((id) => {
    if (id === conversationId) { closeSidebarOnMobile(); return; }
    saveCurrentSession(messages, conversationId);
    const restored = loadMessages(id) ?? [{ role: 'assistant', content: GREETING, ts: new Date() }];
    setConversationId(id);
    setMessages(restored);
    setInput('');
    closeSidebarOnMobile();
  }, [conversationId, messages, saveCurrentSession, closeSidebarOnMobile]);

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
        saveHistory(scopeRef.current, next);
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
    } catch (err) {
      const isNetwork = /fetch|network|timeout/i.test(err?.message ?? '');
      addMessage({
        role: 'assistant',
        content: isNetwork
          ? "Couldn't reach CeloMind right now — check your connection and try again."
          : "Something went wrong on our end. Please try again.",
        ts: new Date(),
        error: true,
      });
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
          to: tx.to ?? undefined, // null → contract deployment (token launch)
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
        content: humanizeWalletError(err),
        ts: new Date(),
        error: true,
      });
    } finally {
      setIsSigning(false);
      setPendingTx(null);
    }
  };

  const slashFilter = slashOpen && input.startsWith('/') ? input.slice(1).toLowerCase() : '';
  const slashCmds = SLASH_COMMANDS.filter((c) =>
    !slashFilter || c.cmd.startsWith(slashFilter) || c.label.toLowerCase().startsWith(slashFilter)
  );

  const selectSlashCmd = (cmd) => {
    setInput(cmd.prompt);
    setSlashOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKey = (e) => {
    if (slashOpen && slashCmds.length > 0) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); setSlashHighlight((h) => Math.min(h + 1, slashCmds.length - 1)); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setSlashHighlight((h) => Math.max(h - 1, 0)); return; }
      if (e.key === 'Escape')     { e.preventDefault(); setSlashOpen(false); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && slashOpen)) {
        e.preventDefault();
        selectSlashCmd(slashCmds[slashHighlight] ?? slashCmds[0]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    if (val === '/' || (val.startsWith('/') && !val.includes(' '))) {
      setSlashOpen(true);
      setSlashHighlight(0);
    } else {
      setSlashOpen(false);
    }
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

          {/* ── Chat history (collapsible + bounded so Suggestions stay visible) ── */}
          {history.length > 0 && (
            <div className="px-4 pb-3 shrink-0">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
                className="w-full flex items-center justify-between px-1 mb-1 py-0.5 rounded-md hover:bg-stone-100 dark:hover:bg-white/5 transition-colors"
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  Recent
                  <span className="normal-case tracking-normal text-slate-300 dark:text-slate-600">({history.length})</span>
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${historyOpen ? '' : '-rotate-90'}`}
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {historyOpen && (
                <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => openConversation(h.id)}
                      className={`group flex flex-col items-start px-3 py-2 rounded-xl text-left border transition-all duration-100 ${
                        h.id === conversationId
                          ? 'bg-white dark:bg-white/8 border-slate-200 dark:border-white/10'
                          : 'border-transparent hover:bg-white dark:hover:bg-white/8 hover:border-slate-100 dark:hover:border-white/10'
                      }`}
                    >
                      <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug line-clamp-1 group-hover:text-slate-900 dark:group-hover:text-slate-100">
                        {h.title}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {relativeTime(h.ts)}
                      </span>
                    </button>
                  ))}
                </div>
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
                  onClick={() => { sendMessage(p); closeSidebarOnMobile(); }}
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
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5 max-w-3xl w-full mx-auto relative">


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
                  {msg.role === 'user' ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                  ) : (
                    <MessageText content={msg.content} />
                  )}
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
        <div className="shrink-0 border-t border-slate-200 dark:border-white/8 bg-white dark:bg-[#131210] px-4 pt-3 pb-5 max-w-3xl w-full mx-auto self-center relative">

          {/* Slash command popover */}
          {slashOpen && slashCmds.length > 0 && (
            <div
              ref={slashMenuRef}
              className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden z-50"
            >
              <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Tools</span>
                <span className="text-[10px] text-slate-300 dark:text-slate-600 ml-auto">↑↓ navigate · Enter to select · Esc to close</span>
              </div>
              <ul className="max-h-72 overflow-y-auto py-1">
                {slashCmds.map((c, i) => (
                  <li key={c.cmd}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectSlashCmd(c); }}
                      onMouseEnter={() => setSlashHighlight(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        i === slashHighlight
                          ? 'bg-[#FCBE00]/15 dark:bg-[#FCBE00]/10'
                          : 'hover:bg-slate-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="text-lg w-6 shrink-0 text-center">{c.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-slate-800 dark:text-white">{c.label}</span>
                        <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">{c.desc}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-300 dark:text-slate-600 shrink-0">/{c.cmd}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={`flex items-end gap-2 bg-stone-100 dark:bg-[#1C1C1E] rounded-2xl px-4 py-2.5 border transition-colors ${input ? 'border-[#FCBE00]' : 'border-stone-200 dark:border-white/10'}`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              placeholder={isConnected ? '"What\'s my balance?" or "Swap 5 CELO for cUSD"' : '"Show me CELO price" or paste a wallet address…'}
              rows={1}
              disabled={loading}
              style={{ caretColor: '#FCBE00' }}
              className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none leading-relaxed max-h-40 overflow-y-auto disabled:opacity-50"
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
