'use client';

import { useState } from 'react';

/**
 * CeloMind logo — your real artwork, swapped by theme.
 *
 * Renders two transparent PNGs and toggles them with pure CSS via the `.dark`
 * class (same source of truth as the rest of the theming), so there's no
 * hydration flash:
 *   public/logo-light.png  → shown in light mode (dark "Celo" text)
 *   public/logo-dark.png   → shown in dark mode  (light "Celo" text)
 *
 * If either file is missing (e.g. before you've added them), it falls back to
 * the live-text wordmark so the nav/footer never show a broken image.
 */
export default function Logo({ className = '', imgClassName = 'h-9 w-auto', textClassName = 'text-xl' }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`font-display font-medium tracking-tight text-slate-900 dark:text-slate-100 ${textClassName} ${className}`}>
        Celo<span className="text-amber-600 dark:text-amber-500">Mind</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src="/logo-light.png"
        alt="CeloMind"
        className={`block dark:hidden ${imgClassName}`}
        onError={() => setFailed(true)}
      />
      <img
        src="/logo-dark.png"
        alt="CeloMind"
        className={`hidden dark:block ${imgClassName}`}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
