'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useTheme } from '@/components/ThemeProvider';

const NAV_LINKS = [
  { label: 'Home',      href: '/' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Chat',      href: '/chat' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { theme, toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const short = isConnected && address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  const linkCls = (href) =>
    `text-sm rounded-full px-3.5 py-1.5 transition-all duration-150 ${
      pathname === href
        ? 'text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-white/10 font-medium'
        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10'
    }`;

  return (
    <>
      <nav className="sticky top-0 z-50 h-16 bg-stone-50/80 dark:bg-[#0F0E0C]/85 backdrop-blur-md border-b border-stone-200 dark:border-white/8 flex items-center px-4 md:px-10 gap-6 transition-colors duration-200">

        {/* Logo */}
        <Link href="/" className="font-display text-xl font-medium tracking-tight text-slate-900 dark:text-slate-100 shrink-0">
          Celo<span className="text-amber-600">Mind</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1 ml-auto">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkCls(l.href)}>
              {l.label}
            </Link>
          ))}

          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            className="ml-1 w-8 h-8 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all duration-150"
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

          {/* Wallet button */}
          <button
            onClick={() => open()}
            className="ml-1 text-sm font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-5 py-2 transition-all duration-150 shrink-0"
          >
            {short ? `✓ ${short}` : 'Connect wallet'}
          </button>
        </div>

        {/* Mobile right side */}
        <div className="flex items-center gap-2 ml-auto md:hidden">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
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

          {/* Hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Mobile drawer ── */}
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 z-[70] h-full w-72 flex flex-col
          bg-white dark:bg-[#1A1916]
          border-l border-slate-200 dark:border-white/8
          shadow-2xl
          transition-transform duration-300 ease-in-out md:hidden
          ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/8">
          <Link
            href="/"
            onClick={() => setDrawerOpen(false)}
            className="font-display text-lg font-medium text-slate-900 dark:text-slate-100"
          >
            Celo<span className="text-amber-600">Mind</span>
          </Link>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer nav links */}
        <nav className="flex flex-col gap-1 p-4 flex-1">
          {NAV_LINKS.map((l) => {
            const isChat = l.href === '/chat';
            const isActive = pathname === l.href;
            if (isChat) {
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold mt-2 transition-all duration-150 ${
                    isActive
                      ? 'bg-[#FCBE00] text-slate-900'
                      : 'bg-[#FCBE00]/90 hover:bg-[#FCBE00] text-slate-900'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Start chatting
                </Link>
              );
            }
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#FCBE00]/20 dark:bg-[#FCBE00]/15 text-slate-900 dark:text-slate-100 border border-[#FCBE00]/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                )}
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Drawer footer — wallet + GitHub */}
        <div className="p-4 border-t border-slate-100 dark:border-white/8 flex flex-col gap-3">
          <button
            onClick={() => { open(); setDrawerOpen(false); }}
            className="w-full text-sm font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-5 py-2.5 transition-all duration-150"
          >
            {short ? `✓ ${short}` : 'Connect wallet'}
          </button>
          <a
            href="https://github.com/Dami904/CELO_MIND.git"
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            View on GitHub →
          </a>
        </div>
      </div>
    </>
  );
}
