import React from "react";
import { cn } from "@/lib/utils";

export interface ResultCardProps {
    title: string;
    data: { label: string; value: string; color?: "green" | "yellow" | "red" | "default" }[];
    className?: string;
}

const colorClass: Record<string, string> = {
    green:   "text-emerald-600 dark:text-emerald-400 font-semibold",
    yellow:  "text-amber-600  dark:text-amber-400  font-semibold",
    red:     "text-red-600    dark:text-red-400    font-semibold",
    default: "text-slate-800  dark:text-slate-200",
};

export default function ResultCard({ title, data, className }: ResultCardProps) {
    return (
        <div className={cn(
            "w-full overflow-hidden rounded-xl border font-mono text-xs",
            "bg-white dark:bg-[#1A1916]",
            "border-slate-200 dark:border-white/10",
            "shadow-sm",
            className,
        )}>
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-100 dark:border-white/8 bg-slate-50 dark:bg-white/4">
                <span className="uppercase tracking-widest text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    {title}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    mcp_result
                </span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-100 dark:divide-white/6">
                {data.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start gap-4 px-3.5 py-2.5">
                        <span className="shrink-0 text-slate-400 dark:text-slate-500 font-medium">
                            {item.label}
                        </span>
                        <span className={cn(
                            "text-right break-all select-all",
                            colorClass[item.color ?? "default"],
                        )}>
                            {item.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
