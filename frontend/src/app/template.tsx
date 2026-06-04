'use client'

import { motion, useReducedMotion } from "framer-motion";

/**
 * App Router re-mounts template.tsx on every navigation (unlike layout.tsx), so
 * this is where we run the per-page enter transition. The wrapper must keep the
 * layout's flex behavior (`flex-1 flex flex-col`, NO min-h-0) so the chat page
 * still fills/pins its input and the long landing page still grows + scrolls.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className="flex-1 flex flex-col min-w-0">{children}</div>;
  }

  return (
    <motion.div
      className="flex-1 flex flex-col min-w-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
