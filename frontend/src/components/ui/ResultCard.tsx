import React from "react";
import { cn } from "@/lib/utils";

export interface ResultCardProps {
  title: string;
  data: { label: string; value: string; color?: "green" | "yellow" | "red" | "default" }[];
  className?: string;
}

export default function ResultCard({ title, data, className }: ResultCardProps) {
  return (
    <div className={cn("bg-surface border border-border rounded overflow-hidden flex flex-col font-sans w-full hover-lift", className)}>
      {/* Title */}
      <div className="bg-dark/40 border-b border-border px-3.5 py-2 flex items-center justify-between">
        <span className="text-2xs font-mono uppercase tracking-widest text-cy font-bold">
          {title}
        </span>
        <span className="text-[10px] text-muted font-mono uppercase">mcp_result</span>
      </div>

      {/* Content */}
      <div className="divide-y divide-border2">
        {data.map((item, idx) => {
          let valueColor = "text-text";
          if (item.color === "green") valueColor = "text-cg font-semibold";
          else if (item.color === "yellow") valueColor = "text-cy font-semibold";
          else if (item.color === "red") valueColor = "text-error font-semibold";

          return (
            <div key={idx} className="flex justify-between items-start gap-4 px-3.5 py-2.5 text-xs">
              <span className="text-muted font-medium font-mono shrink-0">{item.label}</span>
              <span className={cn("font-mono text-right break-all select-all", valueColor)}>
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
