'use client'

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Delay in seconds (use for staggering siblings). */
  delay?: number;
  /** Vertical offset to animate from, in px. */
  y?: number;
}

/**
 * Fade + slide-up a block as it scrolls into view (once). Falls back to a plain
 * div when the user prefers reduced motion. Keep `app/page.tsx` a server
 * component by using this client wrapper around its sections.
 */
export default function Reveal({ children, className, delay = 0, y = 16 }: RevealProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.45, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
