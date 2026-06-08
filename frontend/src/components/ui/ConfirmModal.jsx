'use client'

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  data,
  isSubmitting = false,
}) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="w-full max-w-md flex flex-col rounded-2xl overflow-hidden shadow-2xl
              bg-white dark:bg-[#1A1916]
              border border-red-200 dark:border-red-800/60
              text-slate-800 dark:text-slate-200"
            initial={reduce ? false : { opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Warning banner */}
            <div className="flex items-start gap-2.5 px-4 py-3
              bg-red-50 dark:bg-red-950/50
              border-b border-red-200 dark:border-red-800/60">
              <span className="text-red-500 dark:text-red-400 font-bold text-base select-none mt-0.5">⚠</span>
              <p className="text-xs text-red-600 dark:text-red-400 font-medium leading-relaxed uppercase tracking-wide">
                This action will be broadcast to Celo Mainnet. Verify parameters before signing.
              </p>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest font-medium text-slate-400 dark:text-slate-500">
                  Transaction Request
                </span>
                <h3 className="font-display text-lg font-medium text-slate-900 dark:text-slate-100 tracking-tight">
                  {title}
                </h3>
              </div>

              {/* Data rows */}
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/8 divide-y divide-slate-100 dark:divide-white/6">
                {data.map((row, idx) => (
                  <div key={idx} className="flex justify-between items-center px-3.5 py-2.5 text-xs
                    bg-slate-50 dark:bg-white/3">
                    <span className="text-slate-400 dark:text-slate-500 font-medium font-mono shrink-0">
                      {row.label}
                    </span>
                    <span
                      className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[240px] ml-4"
                      title={row.value}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-5 py-4
              border-t border-slate-100 dark:border-white/8
              bg-slate-50 dark:bg-white/3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium
                  border border-slate-200 dark:border-white/10
                  text-slate-600 dark:text-slate-400
                  hover:bg-slate-100 dark:hover:bg-white/8
                  disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold
                  bg-red-500 hover:bg-red-600
                  text-white
                  disabled:opacity-50
                  flex items-center justify-center gap-1.5
                  transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Signing…
                  </>
                ) : (
                  'Sign & Send'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
