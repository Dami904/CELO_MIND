'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { label: 'Home',      href: '/' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Chat',      href: '/chat' },
];

export default function Footer() {
  const pathname = usePathname();
  if (pathname === '/chat') return null;

  return (
    <footer className="border-t border-stone-200 dark:border-white/8 bg-stone-50 dark:bg-[#0F0E0C] transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 md:px-10 py-10 flex flex-col md:flex-row items-center justify-between gap-6">

        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-1">
          <Link href="/" className="font-display text-lg font-medium tracking-tight text-slate-900 dark:text-slate-100">
            Celo<span className="text-amber-600">Mind</span>
          </Link>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            AI assistant for the Celo network
          </p>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm transition-colors duration-150 ${
                pathname === l.href
                  ? 'text-slate-900 dark:text-slate-100 font-medium'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/Dami904/CELO_MIND.git"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-150"
          >
            GitHub
          </a>
        </nav>

        {/* Built on Celo */}
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <span className="w-2 h-2 rounded-full bg-[#35D07F] inline-block" />
          Built on Celo Mainnet · Open source
        </div>
      </div>
    </footer>
  );
}
