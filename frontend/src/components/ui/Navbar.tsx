'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const pathname = usePathname();

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

      {/* Right: Connect Button */}
      <div className="flex items-center shrink-0">
        {/* Reown AppKit web component (replaces the old w3m-button) */}
        {/* @ts-ignore */}
        <appkit-button balance="hide" size="sm" />
      </div>
    </header>
  );
}
