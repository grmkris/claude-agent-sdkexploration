"use client";

import { cn } from "@/lib/utils";

/**
 * Renders a unified diff string with syntax highlighting.
 * Lines starting with "+" are green, "-" are red, "@@" are blue.
 */
export function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre text-[10px] leading-relaxed">
      {diff.split("\n").map((line, i) => (
        <span
          key={i}
          className={cn(
            "block",
            line.startsWith("+") &&
              !line.startsWith("+++") &&
              "text-green-400 bg-green-400/10",
            line.startsWith("-") &&
              !line.startsWith("---") &&
              "text-red-400 bg-red-400/10",
            line.startsWith("@@") && "text-blue-400",
            !line.startsWith("+") &&
              !line.startsWith("-") &&
              !line.startsWith("@@") &&
              "text-muted-foreground"
          )}
        >
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

/**
 * Builds a simple unified diff string from old and new string content.
 * Produces a line-by-line diff with context lines.
 */
export function buildEditDiff(
  oldStr: string,
  newStr: string,
  filePath?: string,
  contextLines = 3
): string {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // Simple LCS-based diff
  const hunks = computeHunks(oldLines, newLines, contextLines);

  if (hunks.length === 0) return "";

  const header = [`--- ${filePath ?? "a"}`, `+++ ${filePath ?? "b"}`].join(
    "\n"
  );

  return header + "\n" + hunks.join("\n");
}

type DiffOp =
  | { type: "equal"; oldIdx: number; newIdx: number }
  | { type: "delete"; oldIdx: number }
  | { type: "insert"; newIdx: number };

function computeHunks(
  oldLines: string[],
  newLines: string[],
  contextLines: number
): string[] {
  const ops = myers(oldLines, newLines);
  if (ops.length === 0) return [];

  // Group ops into hunks with context
  const changeIndices = ops
    .map((op, i) => (op.type !== "equal" ? i : -1))
    .filter((i) => i >= 0);

  if (changeIndices.length === 0) return [];

  // Merge nearby change groups
  const groups: Array<{ start: number; end: number }> = [];
  let groupStart = Math.max(0, changeIndices[0] - contextLines);
  let groupEnd = Math.min(ops.length - 1, changeIndices[0] + contextLines);

  for (let ci = 1; ci < changeIndices.length; ci++) {
    const idx = changeIndices[ci];
    const candidateStart = Math.max(0, idx - contextLines);
    if (candidateStart <= groupEnd + 1) {
      groupEnd = Math.min(ops.length - 1, idx + contextLines);
    } else {
      groups.push({ start: groupStart, end: groupEnd });
      groupStart = candidateStart;
      groupEnd = Math.min(ops.length - 1, idx + contextLines);
    }
  }
  groups.push({ start: groupStart, end: groupEnd });

  return groups.map((group) => {
    const slice = ops.slice(group.start, group.end + 1);

    const oldStart = slice.find(
      (op) => op.type === "equal" || op.type === "delete"
    ) as { oldIdx: number } | undefined;
    const newStart = slice.find(
      (op) => op.type === "equal" || op.type === "insert"
    ) as { newIdx: number } | undefined;

    const oldCount = slice.filter(
      (op) => op.type === "equal" || op.type === "delete"
    ).length;
    const newCount = slice.filter(
      (op) => op.type === "equal" || op.type === "insert"
    ).length;

    const hunkHeader = `@@ -${(oldStart?.oldIdx ?? 0) + 1},${oldCount} +${(newStart?.newIdx ?? 0) + 1},${newCount} @@`;

    const lines = slice.map((op) => {
      if (op.type === "equal")
        return ` ${oldLines[(op as { oldIdx: number }).oldIdx]}`;
      if (op.type === "delete")
        return `-${oldLines[(op as { oldIdx: number }).oldIdx]}`;
      return `+${newLines[(op as { newIdx: number }).newIdx]}`;
    });

    return [hunkHeader, ...lines].join("\n");
  });
}

// Myers diff algorithm — returns list of edit operations
function myers(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;

  if (max === 0) return [];

  const v: number[] = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const ki = k + max;
      let x: number;
      if (k === -d || (k !== d && v[ki - 1] < v[ki + 1])) {
        x = v[ki + 1];
      } else {
        x = v[ki - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[ki] = x;
      if (x >= n && y >= m) {
        return backtrack(trace, a, b, max, d);
      }
    }
  }
  return backtrack(trace, a, b, max, max);
}

function backtrack(
  trace: number[][],
  a: string[],
  b: string[],
  offset: number,
  d: number
): DiffOp[] {
  const ops: DiffOp[] = [];
  let x = a.length;
  let y = b.length;

  for (let dd = d; dd > 0; dd--) {
    const v = trace[dd];
    const k = x - y;
    const ki = k + offset;

    let prevK: number;
    if (k === -dd || (k !== dd && v[ki - 1] < v[ki + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[prevK + offset];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.unshift({ type: "equal", oldIdx: x - 1, newIdx: y - 1 });
      x--;
      y--;
    }

    if (dd > 0) {
      if (x === prevX) {
        ops.unshift({ type: "insert", newIdx: y - 1 });
        y--;
      } else {
        ops.unshift({ type: "delete", oldIdx: x - 1 });
        x--;
      }
    }
  }

  while (x > 0 && y > 0) {
    ops.unshift({ type: "equal", oldIdx: x - 1, newIdx: y - 1 });
    x--;
    y--;
  }

  return ops;
}
