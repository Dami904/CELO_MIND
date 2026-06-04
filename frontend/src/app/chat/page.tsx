'use client'

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useSendTransaction, useSwitchChain, usePublicClient } from "wagmi";
import { motion, useReducedMotion } from "framer-motion";
import { apiClient, type ChatHistoryMessage, type PendingTxData } from "@/lib/api";
import { cn } from "@/lib/utils";
import ResultCard from "@/components/ui/ResultCard";
import ConfirmModal from "@/components/ui/ConfirmModal";

const CELO_CHAIN_ID = 42220; // Celo mainnet

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
  messages: ChatHistoryMessage[];
  firstAt: string;
  lastAt: string;
};

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
        messages: ordered,
        firstAt: ordered[0]?.timestamp ?? "",
        lastAt: ordered[ordered.length - 1]?.timestamp ?? "",
      };
    })
    .sort((a, b) => Date.parse(b.lastAt || "0") - Date.parse(a.lastAt || "0"));
}

function formatHistoryTitle(thread: HistoryThread): string {
  if (thread.conversationId) return thread.conversationId.slice(0, 8);
  if (thread.walletAddress) return `${thread.walletAddress.slice(0, 6)}...${thread.walletAddress.slice(-4)}`;
  return "Session";
}

export default function ChatPage() {
  const { address, isConnected, chainId } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: CELO_CHAIN_ID });
  const reduce = useReducedMotion();
  const conversationId = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  ).current;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "bot",
      text: "CeloMind MCP Interface Initialized. Awaiting prompts. Use the sidebar controls to pre-populate typical queries or enter your custom request below.",
      timestamp: "12:00:00",
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [history, setHistory] = useState<ChatHistoryMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);

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
      { label: "Check CELO Balance", cmd: "Check CELO Balance" },
      { label: "Get ERC20 Allowances", cmd: "Get ERC20 Allowances for Ubeswap Router" },
      { label: "View Token Holdings", cmd: "View current token holdings" }
    ],
    defi: [
      { label: "Swap 10 CELO for cUSD", cmd: "Swap 10 CELO for cUSD" },
      { label: "Transfer 1 CELO", cmd: "Transfer 1 CELO to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
      { label: "Approve Ubeswap", cmd: "Approve Ubeswap to spend 100 cUSD" }
    ],
    analysis: [
      { label: "Detect Whale Trades", cmd: "Detect Whale Trades in past 24 hours" },
      { label: "Audit Target Contract", cmd: "Audit contract address 0x471EcE3750Da237f93B8E33BCEF3C9e9790a400f" },
      { label: "Inspect Gas History", cmd: "Inspect Celo gas price history" }
    ]
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    setHistoryOpen(isConnected);
  }, [isConnected]);

  useEffect(() => {
    let active = true;
    const walletHistory = isConnected && address ? address : undefined;
    const sessionHistory = !walletHistory ? conversationId : undefined;

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
  }, [address, conversationId, historyRefreshToken, isConnected]);

  const historyThreads = useMemo(() => groupHistory(history), [history]);
  const activeThread =
    historyThreads.find((thread) => thread.key === selectedThreadKey) ?? historyThreads[0] ?? null;

  useEffect(() => {
    if (activeThread && activeThread.key !== selectedThreadKey) {
      setSelectedThreadKey(activeThread.key);
    }
  }, [activeThread, selectedThreadKey]);

  const historyScopeLabel = isConnected && address
    ? `All-time wallet history for ${address.slice(0, 6)}...${address.slice(-4)}`
    : "Current session history";

  const historyPanel = (
    <div className="flex h-full min-h-0 flex-col bg-surface">
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

        {historyThreads.length > 0 && (
          <div className="space-y-2">
            {historyThreads.slice(0, 12).map((thread) => {
              const isActive = activeThread?.key === thread.key;
              const lastMessage = thread.messages[thread.messages.length - 1];
              return (
                <button
                  key={thread.key}
                  type="button"
                  onClick={() => setSelectedThreadKey(thread.key)}
                  className={cn(
                    "w-full border p-3 text-left transition-colors press",
                    isActive ? "border-cy bg-cy/5" : "border-border2 bg-dark/40 hover:border-cy/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-text">
                      {formatHistoryTitle(thread)}
                    </span>
                    <span className="text-[9px] font-mono text-muted">
                      {thread.messages.length} msgs
                    </span>
                  </div>
                  <p className="mt-1 max-h-10 overflow-hidden text-[10px] font-mono text-muted leading-relaxed">
                    {lastMessage?.content ?? "No preview available"}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {activeThread && (
          <div className="border-t border-border2 pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
                Selected Session
              </span>
              <span className="text-[9px] font-mono text-muted">
                {activeThread.messages.length} msgs
              </span>
            </div>

            <div className="mt-2 space-y-2">
              {activeThread.messages.slice(-10).map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "rounded border p-2.5 text-[10px] font-mono leading-relaxed",
                      isUser ? "border-cy/20 bg-cy/10 text-cy" : "border-border2 bg-dark/40 text-text"
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider">
                      <span>{isUser ? "User" : "Assistant"}</span>
                      <span className="text-muted">{msg.timestamp}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                );
              })}
            </div>
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
      const response = await apiClient.sendMessage(text, address, "full", conversationId);

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
      <aside className="hidden md:flex w-[220px] bg-surface border-r border-border flex-col overflow-y-auto shrink-0 select-none custom-scroll">
        
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

      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 min-h-0 flex flex-col bg-dark overflow-hidden">
        
        {/* Chat Header */}
        <div className="h-12 border-b border-border px-4 md:px-5 flex items-center justify-between gap-2 shrink-0 bg-surface/30">
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
              className="lg:hidden px-2.5 py-1 border border-border2 bg-dark/40 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-cy hover:text-cy transition-colors press"
            >
              {historyOpen ? "Hide History" : "View History"}
            </button>
            <div className="text-[10px] font-mono text-muted flex items-center gap-1.5 shrink-0">
              <span className="pulse-green"></span>
              Agent Ready
            </div>
          </div>
        </div>

        {/* Mobile quick actions (the sidebar is hidden on small screens) */}
        <div className="md:hidden flex gap-1.5 overflow-x-auto px-4 py-2 border-b border-border2 bg-surface/30 shrink-0 custom-scroll">
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

        {historyOpen && (
          <div className="lg:hidden border-b border-border bg-surface/50 max-h-96 overflow-hidden">
            {historyPanel}
          </div>
        )}

        {/* Message Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5 space-y-4 custom-scroll">
          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <motion.div
                key={msg.id}
                initial={reduce ? false : { opacity: 0, x: isUser ? 24 : -24, y: 4 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className={cn(
                  "flex flex-col gap-1.5 max-w-[85%] text-xs",
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
            <div className="flex flex-col gap-1.5 max-w-[85%] text-xs mr-auto items-start">
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
        <div className="p-4 border-t border-border bg-surface/30 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="flex gap-2.5 items-end"
          >
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Query wallet balance, execute a swap, or trigger contract audits..."
              className="flex-1 min-h-[44px] max-h-[80px] bg-dark border border-border2 hover:border-border text-xs text-text placeholder:text-muted p-2.5 outline-none font-mono resize-none focus:border-cy transition-colors"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(inputText);
                }
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="h-11 px-5 bg-cy border border-cy text-dark hover:bg-transparent hover:text-cy font-bold text-xs uppercase tracking-wider font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer press"
            >
              Send
            </button>
          </form>
        </div>

      </main>

      <aside className="hidden lg:flex w-[320px] shrink-0 border-l border-border overflow-hidden">
        {historyPanel}
      </aside>

    </div>
  );
}
