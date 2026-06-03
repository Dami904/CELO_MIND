'use client'

import React from "react";
import { useAccount, useBalance } from "wagmi";
import { truncateAddress } from "@/lib/utils";

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({ address });

  // Mock data for fallback or additional tokens
  const mockBalances = {
    celo: "2,450.00",
    cUSD: "1,280.50",
    cEUR: "840.20"
  };

  const activity = [
    { type: "swap", desc: "Swap 200 CELO for cUSD", time: "10m ago", status: "confirmed", arrow: "↓" },
    { type: "send", desc: "Transfer 50 cUSD to 0x3f9d...82e1", time: "1h ago", status: "confirmed", arrow: "↑" },
    { type: "approve", desc: "Approve Uniswap V3 Router", time: "3h ago", status: "pending", arrow: "⟳" },
    { type: "receive", desc: "Received 1,000 cUSD from 0x8a1c...f302", time: "1d ago", status: "confirmed", arrow: "↓" }
  ];

  const whaleAlerts = [
    { asset: "120,000 CELO", desc: "transferred from Binance to Unknown Wallet", type: "WHALE", time: "4m ago" },
    { asset: "50,000 cUSD", desc: "swapped on Ubeswap Pool #4", type: "SWAP", time: "22m ago" }
  ];

  const riskAlerts = [
    { title: "Gas Spike", desc: "Celo BaseFee increased by 45%", level: "MED", time: "1m ago" },
    { title: "Untrusted Call", desc: "Address 0x92b... attempted router interaction", level: "HIGH", time: "12m ago" }
  ];

  const activeTools = [
    "get_balance", "transfer_token", "swap_token", "get_allowance", "approve_spender", "get_whale_alerts"
  ];

  return (
    <div className="flex-1 flex flex-col bg-dark text-text p-6">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
        <div>
          <span className="text-2xs font-mono uppercase tracking-widest text-muted">Management Console</span>
          <h2 className="text-xl md:text-2xl font-syne font-extrabold uppercase tracking-tight text-text">Command Center</h2>
        </div>
        <div className="flex items-center gap-2 border border-cg/20 bg-cg/5 text-cg px-3 py-1 font-mono text-2xs uppercase font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-cg animate-pulse"></span>
          Celo Mainnet
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        
        {/* Metric 1 */}
        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">CELO Price</span>
            <span className="block text-xl font-mono font-bold text-text mt-1">$1.18</span>
          </div>
          <div className="mt-2 text-2xs font-mono text-cg">
            ↑ 4.20% <span className="text-muted">(24h)</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">Portfolio Value</span>
            <span className="block text-xl font-mono font-bold text-text mt-1">
              {isConnected ? `$${(parseFloat(balanceData?.formatted || "0") * 1.18 + 2120).toFixed(2)}` : "$4,171.70"}
            </span>
          </div>
          <div className="mt-2 text-2xs font-mono text-cg">
            ↑ 2.85% <span className="text-muted">(24h)</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">MCP Tools Loaded</span>
            <span className="block text-xl font-mono font-bold text-cy mt-1">18 Active</span>
          </div>
          <div className="mt-2 text-2xs font-mono text-muted">
            Status: Ready
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-surface border border-border p-4 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] text-muted font-mono uppercase tracking-wide">Total Chat Requests</span>
            <span className="block text-xl font-mono font-bold text-text mt-1">1,248</span>
          </div>
          <div className="mt-2 text-2xs font-mono text-cy">
            +14 requests <span className="text-muted">(today)</span>
          </div>
        </div>

      </div>

      {/* Main Grid: Left 2fr, Right 1fr */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Cols) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Wallet Summary */}
          <div className="bg-surface border border-border flex flex-col">
            <div className="border-b border-border bg-dark/30 px-4 py-3 flex justify-between items-center">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Wallet Summary</span>
              <span className="text-2xs font-mono text-muted">
                {isConnected ? truncateAddress(address) : "No wallet connected"}
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Celo */}
              <div className="border border-border2 bg-dark/20 p-3.5 flex flex-col">
                <span className="text-2xs text-muted font-mono uppercase">CELO</span>
                <span className="text-lg font-mono font-bold text-text mt-1">
                  {isConnected ? parseFloat(balanceData?.formatted || "0").toFixed(2) : mockBalances.celo}
                </span>
                <span className="text-[10px] text-muted font-mono mt-0.5">
                  {isConnected ? `$${(parseFloat(balanceData?.formatted || "0") * 1.18).toFixed(2)}` : "$2,891.00"}
                </span>
              </div>
              {/* cUSD */}
              <div className="border border-border2 bg-dark/20 p-3.5 flex flex-col">
                <span className="text-2xs text-muted font-mono uppercase">cUSD</span>
                <span className="text-lg font-mono font-bold text-text mt-1">{mockBalances.cUSD}</span>
                <span className="text-[10px] text-muted font-mono mt-0.5">$1,280.50</span>
              </div>
              {/* cEUR */}
              <div className="border border-border2 bg-dark/20 p-3.5 flex flex-col">
                <span className="text-2xs text-muted font-mono uppercase">cEUR</span>
                <span className="text-lg font-mono font-bold text-text mt-1">{mockBalances.cEUR}</span>
                <span className="text-[10px] text-muted font-mono mt-0.5">$910.45</span>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-surface border border-border flex flex-col">
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Activity Feed</span>
            </div>
            <div className="divide-y divide-border2">
              {activity.map((item, idx) => (
                <div key={idx} className="px-4 py-3.5 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center border font-bold ${
                      item.status === "pending" ? "border-cy/30 bg-cy/5 text-cy animate-spin" : "border-border2 bg-dark text-muted"
                    }`}>
                      {item.arrow}
                    </span>
                    <span className="text-text">{item.desc}</span>
                  </div>
                  <div className="flex items-center gap-3 text-2xs text-muted">
                    <span>{item.time}</span>
                    <span className={`px-1.5 py-0.5 border ${
                      item.status === "pending" 
                        ? "border-cy/25 bg-cy/5 text-cy uppercase" 
                        : "border-border2 bg-dark/40 text-muted uppercase"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column (1 Col) */}
        <div className="flex flex-col gap-6">
          
          {/* Whale Alerts */}
          <div className="bg-surface border border-border flex flex-col">
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Whale Alerts</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {whaleAlerts.map((item, idx) => (
                <div key={idx} className="border border-border2 bg-dark/20 p-3 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="px-1.5 py-0.5 bg-cy/10 border border-cy/20 text-cy text-[9px] font-mono font-bold tracking-wide">
                      [{item.type}]
                    </span>
                    <span className="text-[9px] text-muted font-mono">{item.time}</span>
                  </div>
                  <p className="text-xs font-mono">
                    <span className="text-text font-bold">{item.asset}</span> <span className="text-muted">{item.desc}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Alerts */}
          <div className="bg-surface border border-border flex flex-col">
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-error font-bold">Risk Monitor</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {riskAlerts.map((item, idx) => (
                <div key={idx} className="border border-error/15 bg-dark/20 p-3 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="px-1.5 py-0.5 bg-error/10 border border-error/20 text-error text-[9px] font-mono font-bold tracking-wide">
                      [{item.level} RISK]
                    </span>
                    <span className="text-[9px] text-muted font-mono">{item.time}</span>
                  </div>
                  <p className="text-xs font-mono">
                    <span className="text-text font-bold">{item.title}:</span> <span className="text-muted">{item.desc}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Active Tools Summary */}
          <div className="bg-surface border border-border flex flex-col">
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Loaded MCP Tools</span>
            </div>
            <div className="p-4 flex flex-wrap gap-1.5">
              {activeTools.map((tool, idx) => (
                <span key={idx} className="bg-dark border border-border2 text-muted px-2 py-1 font-mono text-[10px]">
                  {tool}
                </span>
              ))}
            </div>
          </div>

          {/* MCP Server Status */}
          <div className="bg-surface border border-border flex flex-col">
            <div className="border-b border-border bg-dark/30 px-4 py-3">
              <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">Server Diagnostic</span>
            </div>
            <div className="p-4 font-mono text-2xs flex flex-col gap-2.5">
              <div className="flex justify-between">
                <span className="text-muted">SERVER VERSION</span>
                <span className="text-text font-bold">CELOMIND-MCP v0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">RPC LATENCY</span>
                <span className="text-cg font-bold">3ms (EXCELLENT)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">IPC CHANNEL</span>
                <span className="text-cg font-bold">ACTIVE / OPEN</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">MEMORY USAGE</span>
                <span className="text-text">42.8 MB</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
