'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';

export default function Navbar() {
  const pathname = usePathname();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  const short = isConnected && address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  const linkBase =
    'text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full px-3.5 py-1.5 transition-all duration-150';
  const linkActive = 'text-slate-900 bg-slate-100 font-medium';

  return (
    <nav className="sticky top-0 z-50 h-16 bg-stone-50/80 backdrop-blur-md border-b border-stone-200 flex items-center px-4 md:px-10 gap-6">
      {/* Logo */}
      <Link href="/" className="font-display text-xl font-medium tracking-tight text-slate-900 shrink-0">
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

        {/* Wallet button — opens Reown AppKit modal */}
        <button
          onClick={() => open()}
          className="ml-3 text-sm font-medium bg-[#FCBE00] hover:bg-[#C49200] hover:text-white text-slate-900 rounded-full px-5 py-2 transition-all duration-150 shrink-0"
        >
          {short ? `✓ ${short}` : 'Connect wallet'}
        </button>
      </div>
    </nav>
  );
}
