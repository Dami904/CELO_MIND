'use client'

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { Home, LayoutDashboard, MessageSquare } from "lucide-react";
import { cn, truncateAddress } from "@/lib/utils";

export default function Navbar() {
  const pathname = usePathname();
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();

  // Avoid hydration mismatch: render the disconnected label until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const connectLabel = mounted && isConnected && address ? truncateAddress(address) : "Connect Wallet";

  const navItems = [
    { name: "Home", desktopName: "Terminal", path: "/", icon: Home },
    { name: "Dashboard", desktopName: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Chat", desktopName: "Chat", path: "/chat", icon: MessageSquare },
  ];
  const mobileNavItems = navItems;
  const isWalletConnected = mounted && isConnected;

  return (
    <>
      <header className="sticky top-0 z-50 h-14 w-full bg-surface border-b border-border flex items-center justify-between gap-2 px-3 sm:px-6 select-none">
        {/* Left: Logo */}
        <div className="flex items-center shrink-0 min-w-0">
          <Link href="/" className="font-syne font-extrabold text-base sm:text-lg text-cy tracking-tight hover:opacity-90 flex items-center gap-2">
            CELOMIND
            <span className="pulse-green"></span>
          </Link>
        </div>

        {/* Center: Desktop Links */}
        <nav className="hidden md:flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors border border-transparent font-medium press",
                  isActive
                    ? "bg-border text-cy border-border"
                    : "text-muted hover:text-text"
                )}
              >
                {item.desktopName}
              </Link>
            );
          })}
        </nav>

        {/* Right: Connect Button — themed trigger that opens the Reown AppKit modal */}
        <div className="flex items-center shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => open()}
            aria-label={isWalletConnected ? "Wallet connected — manage account" : "Connect wallet"}
            className={cn(
              "inline-flex items-center gap-2 h-10 px-3.5 sm:px-4 text-[11px] sm:text-xs font-mono uppercase tracking-wider font-bold border transition-colors cursor-pointer whitespace-nowrap press shadow-[0_0_22px_rgba(6,242,157,0.16)]",
              isWalletConnected
                ? "bg-transparent text-cy border-cy hover:bg-cy hover:text-dark"
                : "bg-cy text-dark border-cy hover:bg-transparent hover:text-cy"
            )}
          >
            {isWalletConnected && <span className="h-1.5 w-1.5 rounded-full bg-cy shrink-0" aria-hidden="true" />}
            <span className="truncate max-w-[120px] sm:max-w-none">{connectLabel}</span>
          </button>
        </div>
      </header>

      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 px-4 pt-2 pb-2 shadow-[0_-18px_40px_rgba(0,0,0,0.45)] backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-mono font-bold transition-colors press",
                  isActive
                    ? "text-cy"
                    : "text-muted hover:text-text"
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("h-6 w-6", isActive ? "fill-cy/20" : "fill-transparent")}
                  strokeWidth={2.6}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
