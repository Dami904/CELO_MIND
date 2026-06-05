'use client'

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useSendTransaction, useSwitchChain, usePublicClient } from "wagmi";
import { motion, useReducedMotion } from "framer-motion";
import { apiClient, type ChatHistoryMessage, type PendingTxData } from "@/lib/api";
import { cn } from "@/lib/utils";
import ResultCard from "@/components/ui/ResultCard";
import ConfirmModal from "@/components/ui/ConfirmModal";

const CELO_CHAIN_ID = 42220; // Celo mainnet

// Slash-command palette. Typing "/" in the chat input surfaces this toolbox;
// each entry maps to a backend intent and inserts an editable prompt template.
type SlashCommand = {
  cmd: string;
  label: string;
  desc: string;
  template: string;
  group: "Wallet" | "Market" | "DeFi" | "Security" | "Learn";
};

const SLASH_COMMANDS: SlashCommand[] = [
  // Wallet
  { cmd: "/balance", label: "Check CELO balance", desc: "See your native CELO balance", template: "What is my CELO balance?", group: "Wallet" },
  { cmd: "/portfolio", label: "View wallet portfolio", desc: "See all token holdings in your wallet", template: "Show my wallet portfolio", group: "Wallet" },
  { cmd: "/transactions", label: "View recent transactions", desc: "See your latest on-chain activity", template: "Show my recent transactions", group: "Wallet" },
  { cmd: "/token-balance", label: "Check token balance", desc: "Check a specific token balance", template: "What is my cUSD balance?", group: "Wallet" },
  // Market
  { cmd: "/price", label: "Check token price", desc: "See the live price of a Celo token", template: "What is the price of CELO?", group: "Market" },
  { cmd: "/trending", label: "Show trending tokens", desc: "See the hottest tokens on Celo right now", template: "Show trending tokens on Celo", group: "Market" },
  { cmd: "/launches", label: "Show recent launches", desc: "See recently launched Celo tokens", template: "Show recently launched tokens on Celo", group: "Market" },
  { cmd: "/whales", label: "Whale leaderboard", desc: "Top whale wallets on Celo", template: "Show the Whale Leaderboard on Celo", group: "Market" },
  // DeFi
  { cmd: "/swap", label: "Prepare swap", desc: "Build a swap transaction", template: "Swap 10 CELO for cUSD", group: "DeFi" },
  { cmd: "/quote", label: "Get swap quote", desc: "Get a price quote without executing", template: "Swap quote for 10 CELO to cUSD", group: "DeFi" },
  { cmd: "/send", label: "Send CELO", desc: "Transfer CELO to an address", template: "Send 1 CELO to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F", group: "DeFi" },
  { cmd: "/aave", label: "Check Aave position", desc: "See your lending / borrowing position", template: "Check my Aave position", group: "DeFi" },
  // Security
  { cmd: "/contract-risk", label: "Check contract risk", desc: "Run a risk check on a contract address", template: "Check contract risk for 0x471EcE3750Da237f93B8E339c536989b8978a438", group: "Security" },
  { cmd: "/token-risk", label: "Check token safety", desc: "Screen a token for rug-pull or honeypot risk", template: "Is this token safe? 0x765DE816845861e75A25fCA122bb6898B8B1282a", group: "Security" },
  { cmd: "/tx-check", label: "Inspect transaction", desc: "Screen a transaction for malicious activity", template: "Check this transaction for malicious activity: 0x", group: "Security" },
  { cmd: "/copy-wallet", label: "Analyze wallet", desc: "Copy-trade analysis of a wallet", template: "Analyze copy-trading strategy for wallet 0x", group: "Security" },
  // Learn
  { cmd: "/explain", label: "Explain a concept", desc: "Learn any Celo / DeFi topic", template: "Explain how Mento stablecoins work", group: "Learn" },
  { cmd: "/verify", label: "Verify with Self", desc: "Verify identity with Self", template: "How do I verify my identity with Self?", group: "Learn" },
  { cmd: "/mcp", label: "Set up MCP", desc: "Connect the CeloMind MCP server", template: "How do I set up the CeloMind MCP server?", group: "Learn" },
];

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  resultCard?: {
    title: string;
    data: { label: string; value: string; color?: "green" | "yellow" | "red" | "default" }[];
  };
  pendingTx?: PendingTxData;
}

type HistoryThread = {
  key: string;
  conversationId: string | null;
  walletAddress: string | null;
  subject: string;
  messages: ChatHistoryMessage[];
  firstAt: string;
  lastAt: string;
};

function shortenText(text: string, maxChars = 48): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Session";
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildThreadSubject(messages: ChatHistoryMessage[]): string {
  const seed = messages.find((message) => message.role === "user") ?? messages[0];
  return shortenText(seed?.content ?? "Session", 56);
}

function formatHistoryDate(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;

  const date = new Date(time);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHistoryStamp(value: string): string {
  const time = Date.parse(value);
  if (Number.isFinite(time)) return new Date(time).toLocaleString();
  return value;
}

function groupHistory(messages: ChatHistoryMessage[]): HistoryThread[] {
  const groups = new Map<string, ChatHistoryMessage[]>();

  for (const message of messages) {
    const key = message.conversationId ?? `session:${message.walletAddress ?? "anonymous"}`;
    const current = groups.get(key) ?? [];
    current.push(message);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const ordered = [...items].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      return {
        key,
        conversationId: ordered[0]?.conversationId ?? null,
        walletAddress: ordered[0]?.walletAddress ?? null,
        subject: buildThreadSubject(ordered),
        messages: ordered,
        firstAt: ordered[0]?.timestamp ?? "",
        lastAt: ordered[ordered.length - 1]?.timestamp ?? "",
      };
    })
    .sort((a, b) => Date.parse(b.lastAt || "0") - Date.parse(a.lastAt || "0"));
}

function formatHistoryTitle(thread: HistoryThread): string {
  return thread.subject;
}

function messageMatchesQuery(message: ChatHistoryMessage, query: string): boolean {
  const haystack = [
    message.content,
    message.intent ?? "",
    message.role,
    message.chatbotType,
    message.conversationId ?? "",
    message.walletAddress ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function threadMatchesQuery(thread: HistoryThread, query: string): boolean {
  if (!query) return true;
  const header = [
    thread.key,
    thread.conversationId ?? "",
    thread.walletAddress ?? "",
    thread.firstAt,
    thread.lastAt,
  ]
    .join(" ")
    .toLowerCase();
  return header.includes(query) || thread.messages.some((message) => messageMatchesQuery(message, query));
}

function toLiveMessage(message: ChatHistoryMessage): Message {
  return {
    id: `history-${message.id}`,
    sender: message.role === "assistant" ? "bot" : "user",
    text: message.content,
    timestamp: new Date(message.timestamp).toLocaleString(),
  };
}

export default function ChatPage() {
  const { address, isConnected, chainId } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: CELO_CHAIN_ID });
  const reduce = useReducedMotion();
  // Persist the conversation id so an anonymous (no-wallet) thread survives reloads —
  // "view history for all times" even before a wallet is connected. (Wallet history is
  // keyed by address server-side and already persists across reloads/devices.)
  const initialConversationId = useRef<string>(
    (() => {
      const fresh = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      if (typeof window === "undefined") return fresh;
      try {
        const stored = window.localStorage.getItem("celomind:conversationId");
        if (stored) return stored;
        window.localStorage.setItem("celomind:conversationId", fresh);
      } catch {
        /* localStorage unavailable (private mode) — fall back to the fresh id */
      }
      return fresh;
    })()
  ).current;
  const [activeConversationId, setActiveConversationId] = useState(initialConversationId);

  // Restore messages from sessionStorage so they survive navigation within the same tab.
  const WELCOME: Message = {
    id: "1",
    sender: "bot",
    text: "CeloMind MCP Interface Initialized. Awaiting prompts. Use the sidebar controls to pre-populate typical queries or enter your custom request below.",
    timestamp: "12:00:00",
  };
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [WELCOME];
    try {
      const raw = sessionStorage.getItem(`celomind:messages:${initialConversationId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [WELCOME];
  });
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<ChatHistoryMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");

  // Transaction signing states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingTxData, setPendingTxData] = useState<PendingTxData | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const addBotMessage = (text: string, resultCard?: Message["resultCard"]) =>
    setMessages((prev) => [
      ...prev,
      { id: Math.random().toString(), sender: "bot", text, timestamp: new Date().toLocaleTimeString(), resultCard },
    ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sidebarActions = {
    wallet: [
      { label: "Check CELO balance", cmd: "What is my CELO balance?" },
      { label: "View wallet portfolio", cmd: "Show my wallet portfolio" },
      { label: "Check cUSD balance", cmd: "What is my cUSD balance?" }
    ],
    defi: [
      { label: "Swap 10 CELO for cUSD", cmd: "Swap 10 CELO for cUSD" },
      { label: "Transfer 1 CELO to 0x...", cmd: "Transfer 1 CELO to 0xRecipientAddress" },
      { label: "Get swap quote", cmd: "Swap quote for 10 CELO to cUSD" }
    ],
    analysis: [
      { label: "Show Whale Leaderboard", cmd: "Show the Whale Leaderboard on Celo" },
      { label: "Check contract risk for 0x...", cmd: "Check contract risk for 0xContractAddress" },
      { label: "Check current gas price", cmd: "What is the current Celo gas price?" }
    ]
  };

  // Slash-command palette: open when the input starts with "/" and isn't dismissed.
  const slashQuery = inputText.startsWith("/") ? inputText.slice(1).toLowerCase().trimStart() : null;
  const filteredCommands = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery;
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (c) =>
        c.cmd.slice(1).includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q)
    );
  }, [slashQuery]);
  const slashOpen = slashQuery !== null && !slashDismissed && filteredCommands.length > 0;

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  const applySlashCommand = (c: SlashCommand) => {
    setInputText(c.template);
    setSlashDismissed(true);
    // Refocus and drop the caret at the end so users can edit addresses/amounts.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(c.template.length, c.template.length);
      }
    });
  };

  // Persist messages to sessionStorage so navigating away and back restores the chat.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Only persist if it's still the initial (non-restored) conversation.
      if (activeConversationId === initialConversationId) {
        sessionStorage.setItem(`celomind:messages:${initialConversationId}`, JSON.stringify(messages));
      }
    } catch { /* storage quota / private mode */ }
  }, [messages, activeConversationId, initialConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    let active = true;
    const walletHistory = isConnected && address ? address : undefined;
    const sessionHistory = !walletHistory ? activeConversationId : undefined;

    if (!walletHistory && !sessionHistory) {
      setHistory([]);
      setHistoryError(null);
      setHistoryLoading(false);
      return () => {
        active = false;
      };
    }

    setHistoryLoading(true);
    setHistoryError(null);

    apiClient.getChatHistory(walletHistory, sessionHistory, walletHistory ? 500 : 200)
      .then((data) => {
        if (!active) return;
        setHistory(data?.messages ?? []);
        if (!data) {
          setHistoryError("Could not load chat history right now.");
        }
      })
      .catch(() => {
        if (!active) return;
        setHistory([]);
        setHistoryError("Could not load chat history right now.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [address, activeConversationId, historyRefreshToken, isConnected]);

  const historyThreads = useMemo(() => groupHistory(history), [history]);
  const normalizedHistorySearch = historySearch.trim().toLowerCase();
  const visibleHistoryThreads = useMemo(
    () => historyThreads.filter((thread) => threadMatchesQuery(thread, normalizedHistorySearch)),
    [historyThreads, normalizedHistorySearch]
  );
  const activeThread =
    visibleHistoryThreads.find((thread) => thread.key === selectedThreadKey) ?? visibleHistoryThreads[0] ?? null;

  useEffect(() => {
    if (activeThread && activeThread.key !== selectedThreadKey) {
      setSelectedThreadKey(activeThread.key);
    }
  }, [activeThread, selectedThreadKey]);

  useEffect(() => {
    if (!historySearch && !selectedThreadKey && visibleHistoryThreads.length > 0) {
      setSelectedThreadKey(visibleHistoryThreads[0].key);
    }
  }, [historySearch, selectedThreadKey, visibleHistoryThreads]);

  const historyScopeLabel = isConnected && address
    ? `All-time wallet history for ${address.slice(0, 6)}...${address.slice(-4)}`
    : "Current session history";
  const activeConversationLabel =
    activeConversationId === initialConversationId
      ? "New Session"
      : `Restored ${activeConversationId.slice(0, 8)}`;

  const handleNewSession = () => {
    const newId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    setActiveConversationId(newId);
    setMessages([WELCOME]);
    setInputText("");
    setIsTyping(false);
    setIsConfirmOpen(false);
    setPendingTxData(null);
    try { localStorage.setItem("celomind:conversationId", newId); } catch { /* ignore */ }
  };

  const restoreThread = (thread: HistoryThread) => {
    setSelectedThreadKey(thread.key);
    setActiveConversationId(thread.conversationId ?? initialConversationId);
    setMessages(thread.messages.map(toLiveMessage));
    setInputText("");
    setIsTyping(false);
    setIsConfirmOpen(false);
    setPendingTxData(null);
    setHistoryOpen(true);
  };

  const historyPanel = (
    <div className="flex h-full min-h-0 flex-col bg-dark">
      <div className="shrink-0 border-b border-border2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="block text-[10px] font-mono uppercase tracking-wider text-muted">History</span>
            <h3 className="font-syne text-sm font-bold uppercase text-text">Chat History</h3>
          </div>
          <button
            type="button"
            onClick={() => setHistoryRefreshToken((n) => n + 1)}
            className="px-2.5 py-1 border border-border2 bg-dark/40 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-cy hover:text-cy transition-colors press"
          >
            Refresh
          </button>
        </div>
        <p className="mt-2 text-[10px] font-mono text-muted leading-relaxed">{historyScopeLabel}</p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Search history"
            className="h-9 min-w-0 flex-1 border border-border2 bg-dark/40 px-2.5 text-[10px] font-mono text-text placeholder:text-muted outline-none focus:border-cy"
          />
          <button
            type="button"
            onClick={() => setHistorySearch("")}
            disabled={!historySearch}
            className="px-2.5 py-1 border border-border2 bg-dark/40 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-cy hover:text-cy transition-colors press disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-wider text-muted">
          <span>{visibleHistoryThreads.length} visible</span>
          <span>{historyThreads.length} total</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3 space-y-3">
        {!isConnected && (
          <div className="border border-border2 bg-dark/40 p-3 text-[10px] font-mono text-muted leading-relaxed">
            Connect a wallet to unlock all-time history. Your current session remains visible here too.
          </div>
        )}

        {historyLoading && (
          <div className="space-y-2">
            <div className="h-14 rounded border border-border2 bg-dark/40 animate-shimmer" />
            <div className="h-14 rounded border border-border2 bg-dark/40 animate-shimmer" />
            <div className="h-14 rounded border border-border2 bg-dark/40 animate-shimmer" />
          </div>
        )}

        {historyError && (
          <div className="border border-error/30 bg-error/10 p-3 text-[10px] font-mono text-error leading-relaxed">
            {historyError}
          </div>
        )}

        {!historyLoading && historyThreads.length === 0 && (
          <div className="border border-border2 bg-dark/40 p-3 text-[10px] font-mono text-muted leading-relaxed">
            No saved messages yet. Start chatting to build your history.
          </div>
        )}

        {!historyLoading && historyThreads.length > 0 && visibleHistoryThreads.length === 0 && (
          <div className="border border-border2 bg-dark/40 p-3 text-[10px] font-mono text-muted leading-relaxed">
            No conversations match your search.
          </div>
        )}

        {visibleHistoryThreads.length > 0 && (
          <div className="space-y-2">
            {visibleHistoryThreads.slice(0, 12).map((thread) => {
              const isActive = activeThread?.key === thread.key;
              return (
                <button
                  key={thread.key}
                  type="button"
                  onClick={() => restoreThread(thread)}
                  className={cn(
                    "w-full border p-3 text-left transition-colors press",
                    isActive ? "border-cy bg-cy/5" : "border-border2 bg-dark/40 hover:border-cy/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 text-sm font-medium text-text truncate">
                      {formatHistoryTitle(thread)}
                    </span>
                    <span className="shrink-0 text-[9px] font-mono text-muted uppercase tracking-wider">
                      {formatHistoryDate(thread.lastAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-wider text-muted">
                    <span>{thread.messages.length} msgs</span>
                    <span>{isActive ? "Restored" : "Click to restore"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const time = new Date().toLocaleTimeString();
    const userMsg: Message = {
      id: Math.random().toString(),
      sender: "user",
      text,
      timestamp: time,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    try {
      const response = await apiClient.sendMessage(text, address, "full", activeConversationId);

      const botMsg: Message = {
        id: Math.random().toString(),
        sender: "bot",
        text: response.message,
        timestamp: new Date().toLocaleTimeString(),
        resultCard: response.data?.resultCard,
        pendingTx: response.data?.pendingTx,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (e) {
      addBotMessage(
        e instanceof Error ? `Request failed: ${e.message}` : "Failed to reach the CeloMind backend."
      );
    } finally {
      setIsTyping(false);
      setHistoryRefreshToken((n) => n + 1);
    }
  };

  const triggerPendingTx = (tx: PendingTxData) => {
    setPendingTxData(tx);
    setIsConfirmOpen(true);
  };

  // Real signer: the backend only prepares unsigned txs — the user's wallet signs/broadcasts them here.
  const handleConfirmSign = async () => {
    if (!pendingTxData) return;

    if (!isConnected || !address) {
      setIsConfirmOpen(false);
      addBotMessage("Connect your wallet first — I prepare transactions, your wallet signs them.");
      return;
    }

    setIsSigning(true);
    try {
      if (chainId !== CELO_CHAIN_ID) {
        await switchChainAsync({ chainId: CELO_CHAIN_ID });
      }

      const hashes: string[] = [];
      for (const tx of pendingTxData.transactions) {
        const hash = await sendTransactionAsync({
          to: tx.to as `0x${string}`,
          data: (tx.data || "0x") as `0x${string}`,
          value: BigInt(tx.value || "0"),
        });
        hashes.push(hash);
        // Wait for each step to be mined before sending the next (e.g. approve before swap/supply).
        if (publicClient && pendingTxData.transactions.length > 1) {
          await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
        }
      }

      setIsConfirmOpen(false);
      addBotMessage("Transaction signed and broadcast to Celo Mainnet.", {
        title: "Transaction Receipt",
        data: [
          { label: "Status", value: "BROADCAST", color: "green" },
          ...hashes.map((h, i) => ({
            label: hashes.length > 1 ? `Tx ${i + 1} hash` : "Transaction hash",
            value: h,
          })),
          { label: "Network", value: "Celo Mainnet (42220)" },
        ],
      });
    } catch (e) {
      setIsConfirmOpen(false);
      const msg = e instanceof Error ? e.message : "Transaction rejected or failed.";
      addBotMessage(`Transaction not completed: ${msg.split("\n")[0]}`);
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden relative">
      
      {/* ConfirmModal Overlay */}
      {pendingTxData && (
        <ConfirmModal
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={handleConfirmSign}
          title={pendingTxData.title}
          data={pendingTxData.data}
          isSubmitting={isSigning}
        />
      )}

      {/* Left Sidebar (220px) — hidden on mobile; presets move to a scroll strip below the header */}
      <aside className="hidden md:flex w-[220px] bg-surface border-r border-border flex-col shrink-0 select-none overflow-hidden">
        {/* New Chat button — always visible at the top of the sidebar */}
        <div className="shrink-0 p-3 border-b border-border2">
          <button
            type="button"
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-1.5 bg-cy/10 border border-cy/40 hover:bg-cy/20 hover:border-cy text-cy px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors press"
          >
            <span className="text-sm leading-none">+</span> New Chat
          </button>
        </div>

        {/* Scrollable preset area — only this scrolls, not the new-chat button */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
        {/* Wallet & Balances preset */}
        <div className="p-4 border-b border-border2">
          <span className="block text-[10px] text-muted font-mono uppercase tracking-wider mb-2.5 font-bold">Wallet & Balances</span>
          <div className="flex flex-col gap-1.5">
            {sidebarActions.wallet.map((act) => (
              <button
                key={act.label}
                onClick={() => setInputText(act.cmd)}
                className="w-full text-left bg-dark/40 border border-border2 hover:border-cy text-muted hover:text-text px-2.5 py-1.5 text-[10px] font-mono transition-colors press"
              >
                &gt; {act.label}
              </button>
            ))}
          </div>
        </div>

        {/* DeFi Actions preset */}
        <div className="p-4 border-b border-border2">
          <span className="block text-[10px] text-muted font-mono uppercase tracking-wider mb-2.5 font-bold">DeFi Actions</span>
          <div className="flex flex-col gap-1.5">
            {sidebarActions.defi.map((act) => (
              <button
                key={act.label}
                onClick={() => setInputText(act.cmd)}
                className="w-full text-left bg-dark/40 border border-border2 hover:border-cy text-muted hover:text-text px-2.5 py-1.5 text-[10px] font-mono transition-colors press"
              >
                &gt; {act.label}
              </button>
            ))}
          </div>
        </div>

        {/* Analysis presets */}
        <div className="p-4">
          <span className="block text-[10px] text-muted font-mono uppercase tracking-wider mb-2.5 font-bold">Analysis</span>
          <div className="flex flex-col gap-1.5">
            {sidebarActions.analysis.map((act) => (
              <button
                key={act.label}
                onClick={() => setInputText(act.cmd)}
                className="w-full text-left bg-dark/40 border border-border2 hover:border-cy text-muted hover:text-text px-2.5 py-1.5 text-[10px] font-mono transition-colors press"
              >
                &gt; {act.label}
              </button>
            ))}
          </div>
        </div>
        </div> {/* end scrollable preset area */}

      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 min-h-0 flex flex-col bg-dark overflow-hidden">
        
        {/* Chat Header */}
        <div className="h-12 border-b border-border px-3 sm:px-4 md:px-5 flex items-center justify-between gap-2 shrink-0 bg-surface/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-syne font-bold text-xs uppercase text-text whitespace-nowrap">CeloMind Agent</span>
            <span className="hidden sm:inline px-1.5 py-0.5 bg-border2 border border-border text-[9px] font-mono text-muted uppercase">
              CeloMind MCP
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              className="px-2.5 py-1 border border-border2 bg-dark/40 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-cy hover:text-cy transition-colors press"
            >
              <span className="sm:hidden">{historyOpen ? "Close" : "History"}</span>
              <span className="hidden sm:inline">{historyOpen ? "Close History" : "Open History"}</span>
            </button>
            <div className="hidden sm:flex text-[10px] font-mono text-muted items-center gap-1.5 shrink-0">
              <span className="pulse-green"></span>
              Agent Ready
            </div>
            <button
              type="button"
              onClick={handleNewSession}
              title="Start a new chat session"
              className="hidden sm:flex items-center gap-1 border border-cy/40 bg-cy/10 hover:bg-cy/20 hover:border-cy px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-cy transition-colors press"
            >
              <span className="text-base leading-none font-bold">+</span>
              {activeConversationLabel === "New Session" ? "New Chat" : "New Chat"}
            </button>
          </div>
        </div>

        {/* Mobile quick actions (the sidebar is hidden on small screens) */}
        <div className="md:hidden flex gap-1.5 overflow-x-auto px-4 py-2 border-b border-border2 bg-surface/30 shrink-0 custom-scroll">
          {/* New Chat — always first on mobile */}
          <button
            type="button"
            onClick={handleNewSession}
            className="shrink-0 bg-cy/10 border border-cy/40 hover:border-cy text-cy px-2.5 py-1 text-[10px] font-mono font-bold whitespace-nowrap transition-colors press"
          >
            + New Chat
          </button>
          {[...sidebarActions.wallet, ...sidebarActions.defi, ...sidebarActions.analysis].map((act) => (
            <button
              key={act.label}
              onClick={() => setInputText(act.cmd)}
              className="shrink-0 bg-dark/40 border border-border2 hover:border-cy text-muted hover:text-text px-2.5 py-1 text-[10px] font-mono whitespace-nowrap transition-colors press"
            >
              {act.label}
            </button>
          ))}
        </div>

        {/* Message Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-5 space-y-4 custom-scroll">
          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <motion.div
                key={msg.id}
                initial={reduce ? false : { opacity: 0, x: isUser ? 24 : -24, y: 4 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className={cn(
                  "flex flex-col gap-1.5 max-w-[92%] sm:max-w-[85%] text-xs",
                  isUser ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                {/* Message Timestamp */}
                <span className="text-[9px] text-muted font-mono">{msg.timestamp}</span>

                {/* Message bubble */}
                <div
                  className={cn(
                    "p-3.5 border font-mono leading-relaxed",
                    isUser
                      ? "bg-cy/10 border-cy/25 text-cy"
                      : "bg-surface border-border2 text-text"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Render Confirm Tx Button if exists */}
                  {msg.pendingTx && (
                    <div className="mt-3">
                      <button
                        onClick={() => triggerPendingTx(msg.pendingTx!)}
                        className="px-3 py-1.5 bg-cy text-dark font-bold text-2xs uppercase tracking-wider hover:bg-transparent hover:text-cy border border-cy transition-colors cursor-pointer hover-lift press"
                      >
                        Sign & Send Transaction
                      </button>
                    </div>
                  )}
                </div>

                {/* Render ResultCard if exists */}
                {msg.resultCard && (
                  <div className="w-full min-w-[280px] max-w-sm mt-1">
                    <ResultCard title={msg.resultCard.title} data={msg.resultCard.data} />
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex flex-col gap-1.5 max-w-[92%] sm:max-w-[85%] text-xs mr-auto items-start">
              <span className="text-[9px] text-muted font-mono">{new Date().toLocaleTimeString()}</span>
              <div className="flex items-center gap-1 p-3 bg-surface border border-border2 rounded w-14 justify-center">
                <span className="typing-dot"></span>
                <span className="typing-dot" style={{ animationDelay: "0.2s" }}></span>
                <span className="typing-dot" style={{ animationDelay: "0.4s" }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input box */}
        <div className="relative p-3 sm:p-4 border-t border-border bg-surface/30 shrink-0">
          {/* Slash-command palette */}
          {slashOpen && (
            <div className="absolute bottom-full left-3 right-3 sm:left-4 sm:right-4 mb-2 z-50 max-h-[280px] overflow-y-auto border border-border bg-surface shadow-xl custom-scroll">
              <div className="sticky top-0 flex items-center justify-between bg-surface/95 px-3 py-1.5 border-b border-border2 text-[9px] font-mono uppercase tracking-wider text-muted">
                <span>Tools — ↑↓ to navigate, ↵ to pick, esc to dismiss</span>
                <span className="text-cy">{filteredCommands.length}</span>
              </div>
              {filteredCommands.map((c, i) => (
                <button
                  key={c.cmd}
                  type="button"
                  onMouseEnter={() => setSlashIndex(i)}
                  onClick={() => applySlashCommand(c)}
                  className={cn(
                    "w-full text-left flex items-start gap-2.5 px-3 py-2 border-b border-border2/60 last:border-b-0 transition-colors",
                    i === slashIndex ? "bg-cy/10" : "hover:bg-dark/40"
                  )}
                >
                  <span className={cn("font-mono text-[11px] font-bold shrink-0 w-28", i === slashIndex ? "text-cy" : "text-text")}>{c.cmd}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="font-mono text-[11px] text-text truncate">{c.label}</span>
                    <span className="font-mono text-[10px] text-muted truncate">{c.desc}</span>
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted">{c.group}</span>
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="flex gap-2 items-end sm:gap-2.5"
          >
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setSlashDismissed(false);
              }}
              placeholder="Type / for tools, or query wallet balance, execute a swap, audit a contract..."
              className="flex-1 min-h-[44px] max-h-[80px] bg-dark border border-border2 hover:border-border text-xs text-text placeholder:text-muted p-2.5 outline-none font-mono resize-none focus:border-cy transition-colors"
              onKeyDown={(e) => {
                if (slashOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashIndex((i) => (i + 1) % filteredCommands.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    applySlashCommand(filteredCommands[slashIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSlashDismissed(true);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(inputText);
                }
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="h-11 px-3 sm:px-5 bg-cy border border-cy text-dark hover:bg-transparent hover:text-cy font-bold text-xs uppercase tracking-wider font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer press"
            >
              Send
            </button>
          </form>
        </div>

      </main>
      {historyOpen && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close history drawer"
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
          />
          <motion.aside
            initial={reduce ? false : { x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-0 top-0 h-full w-full max-w-[380px] sm:max-w-[420px] border-l border-border bg-dark shadow-[0_0_40px_rgba(0,0,0,0.4)]"
          >
            <div className="flex items-center justify-between border-b border-border2 px-4 py-3">
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-wider text-muted"></span>
                <span className="block text-sm font-syne uppercase text-text"></span>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-2.5 py-1 border border-border2 bg-dark/40 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-cy hover:text-cy transition-colors press"
              >
                Close
              </button>
            </div>
            {historyPanel}
          </motion.aside>
        </div>
      )}

    </div>
  );
}
