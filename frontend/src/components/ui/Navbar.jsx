'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useTheme } from '@/components/ThemeProvider';

export default function Navbar() {
  const pathname = usePathname();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { theme, toggle } = useTheme();

  const short = isConnected && address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  const linkBase =
    'text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full px-3.5 py-1.5 transition-all duration-150';
  const linkActive = 'text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-white/10 font-medium';

  return (
    <nav className="sticky top-0 z-50 h-16 bg-stone-50/80 dark:bg-[#0F0E0C]/85 backdrop-blur-md border-b border-stone-200 dark:border-white/8 flex items-center px-4 md:px-10 gap-6 transition-colors duration-200">
      {/* Logo */}
      <Link href="/" className="font-display text-xl font-medium tracking-tight text-slate-900 dark:text-slate-100 shrink-0">
        Celo<span className="text-amber-600">Mind</span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-1 ml-auto">
        <Link href="/" className={`${linkBase} hidden md:inline-flex ${pathname === '/' ? linkActive : ''}`}>
          Home
        </Link>
        <Link href="/dashboard" className={`${linkBase} ${pathname === '/dashboard' ? linkActive : ''}`}>
          Dashboard
        </Link>
        <Link href="/chat" className={`${linkBase} ${pathname === '/chat' ? linkActive : ''}`}>
          Chat
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label="Toggle dark mode"
          className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all duration-150 shrink-0"
        >
          {theme === 'dark' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="5" />
              <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>

        {/* Wallet button — opens Reown AppKit modal */}
        <button
          onClick={() => open()}
          className="ml-1 text-sm font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-5 py-2 transition-all duration-150 shrink-0"
        >
          {short ? `✓ ${short}` : 'Connect wallet'}
        </button>
      </div>
    </nav>
  );
}
