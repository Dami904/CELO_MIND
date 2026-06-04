'use client'

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
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
    { name: "Terminal", path: "/" },
    { name: "Dashboard", path: "/dashboard" },
    { name: "Chat", path: "/chat" },
  ];

  return (
    <header className="sticky top-0 z-50 h-14 w-full bg-surface border-b border-border flex items-center justify-between gap-2 px-3 sm:px-6 select-none">
      {/* Left: Logo */}
      <div className="flex items-center shrink-0">
        <Link href="/" className="font-syne font-extrabold text-base sm:text-lg text-cy tracking-tight hover:opacity-90 flex items-center gap-2">
          CELOMIND
          <span className="pulse-green"></span>
        </Link>
      </div>

      {/* Center: Links */}
      <nav className="flex items-center gap-0.5 sm:gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-mono uppercase tracking-wider transition-colors border border-transparent font-medium",
                isActive
                  ? "bg-border text-cy border-border"
                  : "text-muted hover:text-text"
              )}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Right: Connect Button — themed trigger that opens the Reown AppKit modal */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => open()}
          className={cn(
            "px-2.5 sm:px-4 py-1.5 text-[11px] sm:text-xs font-mono uppercase tracking-wider font-bold border transition-colors cursor-pointer whitespace-nowrap",
            mounted && isConnected
              ? "bg-transparent text-cy border-cy hover:bg-cy hover:text-dark"
              : "bg-cy text-dark border-cy hover:bg-transparent hover:text-cy"
          )}
        >
          {connectLabel}
        </button>
      </div>
    </header>
  );
}
