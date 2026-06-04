'use client'

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  data: { label: string; value: string }[];
  isSubmitting?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  data,
  isSubmitting = false,
}: ConfirmModalProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="w-full max-w-md bg-surface border border-error text-text flex flex-col rounded shadow-2xl overflow-hidden font-sans"
            initial={reduce ? false : { opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Red Warning Banner */}
            <div className="bg-error/15 border-b border-error px-4 py-3 flex items-start gap-2.5">
              <span className="text-error font-mono text-base font-bold select-none">⚠</span>
              <div className="flex-1 text-xs text-error font-medium leading-relaxed uppercase tracking-wide">
                This action will be broadcast to Celo Mainnet. Verify parameters before signing.
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-muted text-2xs uppercase tracking-wider font-mono">Transaction Request</span>
                <h3 className="text-base font-syne font-bold text-text uppercase tracking-tight">{title}</h3>
              </div>

              {/* Data List */}
              <div className="border border-border2 bg-dark/50 divide-y divide-border2">
                {data.map((row, idx) => (
                  <div key={idx} className="flex justify-between items-center px-3 py-2 text-xs">
                    <span className="text-muted font-medium font-mono">{row.label}</span>
                    <span className="font-mono text-text bg-surface px-1.5 py-0.5 border border-border2 truncate max-w-[240px]" title={row.value}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="border-t border-border2 px-5 py-4 bg-dark/20 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2 border border-border2 text-xs uppercase tracking-wider font-mono hover:bg-surface hover:text-text text-muted transition-colors disabled:opacity-50 cursor-pointer press"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isSubmitting}
                className="flex-1 py-2 bg-error text-dark hover:bg-red-600 font-bold text-xs uppercase tracking-wider font-mono transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer press"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin text-dark">⟳</span>
                    Signing...
                  </>
                ) : (
                  "Sign & Send"
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
