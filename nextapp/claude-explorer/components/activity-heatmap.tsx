"use client";

import { useMemo } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

const DAYS = 90;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function getIntensity(count: number, max: number): string {
  if (count === 0) return "bg-muted/40";
  const ratio = count / max;
  if (ratio < 0.25) return "bg-emerald-900/60";
  if (ratio < 0.5) return "bg-emerald-700/70";
  if (ratio < 0.75) return "bg-emerald-500/80";
  return "bg-emerald-400";
}

export function ActivityHeatmap({ data }: { data: DailyActivity[] }) {
  const { grid, months, maxCount } = useMemo(() => {
    const byDate = new Map(data.map((d) => [d.date, d]));

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - DAYS + 1);
    // Align to Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const totalDays =
      Math.ceil((today.getTime() - startDate.getTime()) / 86400000) + 1;
    const grid: (DailyActivity | null)[][] = [];
    const months: { label: string; col: number }[] = [];

    let maxCount = 0;
    let lastMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + d);
      const dayOfWeek = date.getDay();
      const col = Math.floor(d / 7);

      if (!grid[col]) grid[col] = Array(7).fill(null);

      const dateStr = date.toISOString().slice(0, 10);
      const entry = byDate.get(dateStr) ?? null;

      if (entry && entry.messageCount > maxCount) maxCount = entry.messageCount;

      grid[col][dayOfWeek] = entry ?? {
        date: dateStr,
        messageCount: 0,
        sessionCount: 0,
        toolCallCount: 0,
      };

      const month = date.getMonth();
      if (month !== lastMonth) {
        months.push({
          label: date.toLocaleString("default", { month: "short" }),
          col,
        });
        lastMonth = month;
      }
    }

    return { grid, months, maxCount };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">No activity data</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Month labels */}
      <div className="relative mb-1" style={{ paddingLeft: 28, height: 14 }}>
        {months.map((m, i) => (
          <span
            key={`${m.label}-${i}`}
            className="absolute text-[10px] text-muted-foreground"
            style={{ left: 28 + m.col * 13 }}
          >
            {m.label}
          </span>
        ))}
      </div>

      <div className="flex gap-0">
        {/* Day labels */}
        <div className="flex flex-col gap-[2px] pr-1" style={{ width: 24 }}>
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="flex h-[11px] items-center text-[9px] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-[2px]">
          {grid.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-[2px]">
              {col.map((cell, rowIdx) => {
                if (!cell)
                  return <div key={rowIdx} className="h-[11px] w-[11px]" />;
                return (
                  <Tooltip key={rowIdx}>
                    <TooltipTrigger>
                      <div
                        className={`h-[11px] w-[11px] rounded-[2px] ${getIntensity(cell.messageCount, maxCount)}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">{cell.date}</p>
                      <p>
                        {cell.messageCount} messages, {cell.sessionCount}{" "}
                        sessions
                      </p>
                      <p>{cell.toolCallCount} tool calls</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className="h-[10px] w-[10px] rounded-[2px] bg-muted/40" />
        <div className="h-[10px] w-[10px] rounded-[2px] bg-emerald-900/60" />
        <div className="h-[10px] w-[10px] rounded-[2px] bg-emerald-700/70" />
        <div className="h-[10px] w-[10px] rounded-[2px] bg-emerald-500/80" />
        <div className="h-[10px] w-[10px] rounded-[2px] bg-emerald-400" />
        <span>More</span>
      </div>
    </div>
  );
}
