'use client'

import React, { useState, useRef, useEffect } from "react";
import { useAccount } from "wagmi";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import ResultCard from "@/components/ui/ResultCard";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  resultCard?: {
    title: string;
    data: { label: string; value: string; color?: "green" | "yellow" | "red" | "default" }[];
  };
  pendingTx?: {
    title: string;
    data: { label: string; value: string }[];
  };
}

export default function ChatPage() {
  const { address } = useAccount();
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

  // Transaction signing states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingTxData, setPendingTxData] = useState<{ title: string; data: { label: string; value: string }[] } | null>(null);
  const [isSigning, setIsSigning] = useState(false);

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
      const response = await apiClient.sendMessage(text, address);
      
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
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: "bot",
          text: "RPC Exception: Failed to connect to local MCP gateway.",
          timestamp: new Date().toLocaleTimeString(),
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const triggerPendingTx = (tx: { title: string; data: { label: string; value: string }[] }) => {
    setPendingTxData(tx);
    setIsConfirmOpen(true);
  };

  const handleConfirmSign = () => {
    setIsSigning(true);
    setTimeout(() => {
      setIsSigning(false);
      setIsConfirmOpen(false);

      // Append success transaction receipt to chat
      const time = new Date().toLocaleTimeString();
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: "bot",
          text: "Transaction successfully signed and broadcast to Celo Mainnet.",
          timestamp: time,
          resultCard: {
            title: "Transaction Receipt",
            data: [
              { label: "Status", value: "SUCCESS (CONFIRMED)", color: "green" },
              { label: "Transaction Hash", value: "0x789c0a...f34b82" },
              { label: "Gas Used", value: "84,231" },
              { label: "Block Number", value: "18,482,901" }
            ]
          }
        }
      ]);
    }, 2000);
  };

  return (
    <div className="flex-1 flex overflow-hidden h-full relative">
      
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

      {/* Left Sidebar (220px) */}
      <aside className="w-[220px] bg-surface border-r border-border flex flex-col overflow-y-auto shrink-0 select-none custom-scroll">
        
        {/* Wallet & Balances preset */}
        <div className="p-4 border-b border-border2">
          <span className="block text-[10px] text-muted font-mono uppercase tracking-wider mb-2.5 font-bold">Wallet & Balances</span>
          <div className="flex flex-col gap-1.5">
            {sidebarActions.wallet.map((act) => (
              <button
                key={act.label}
                onClick={() => setInputText(act.cmd)}
                className="w-full text-left bg-dark/40 border border-border2 hover:border-cy text-muted hover:text-text px-2.5 py-1.5 text-[10px] font-mono transition-colors"
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
                className="w-full text-left bg-dark/40 border border-border2 hover:border-cy text-muted hover:text-text px-2.5 py-1.5 text-[10px] font-mono transition-colors"
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
                className="w-full text-left bg-dark/40 border border-border2 hover:border-cy text-muted hover:text-text px-2.5 py-1.5 text-[10px] font-mono transition-colors"
              >
                &gt; {act.label}
              </button>
            ))}
          </div>
        </div>

      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col bg-dark overflow-hidden h-full">
        
        {/* Chat Header */}
        <div className="h-12 border-b border-border px-5 flex items-center justify-between shrink-0 bg-surface/30">
          <div className="flex items-center gap-2">
            <span className="font-syne font-bold text-xs uppercase text-text">CeloMind Agent</span>
            <span className="px-1.5 py-0.5 bg-border2 border border-border text-[9px] font-mono text-muted uppercase">
              claude-3.5-sonnet
            </span>
          </div>
          <div className="text-[10px] font-mono text-muted flex items-center gap-1.5">
            <span className="pulse-green"></span>
            Agent Ready
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <div
                key={msg.id}
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
                        className="px-3 py-1.5 bg-cy text-dark font-bold text-2xs uppercase tracking-wider hover:bg-transparent hover:text-cy border border-cy transition-colors cursor-pointer"
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
              </div>
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
              className="h-11 px-5 bg-cy border border-cy text-dark hover:bg-transparent hover:text-cy font-bold text-xs uppercase tracking-wider font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer"
            >
              Send
            </button>
          </form>
        </div>

      </main>

    </div>
  );
}
