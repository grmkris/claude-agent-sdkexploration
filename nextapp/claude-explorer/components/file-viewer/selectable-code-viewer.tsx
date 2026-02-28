"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useContextTray } from "@/components/context-tray/context-tray-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CodeViewer } from "./code-viewer";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface SelectableCodeViewerProps {
  content: string;
  filename: string;
  /** Full relative path (used for chip filePath) */
  filePath: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SelectableCodeViewer({
  content,
  filename,
  filePath,
}: SelectableCodeViewerProps) {
  const { addChip } = useContextTray();

  const lines = content.split("\n");
  const lineCount = lines.length;

  // ── Selection state ──────────────────────────────────────────────────────

  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  const rangeStart =
    selStart !== null && selEnd !== null
      ? Math.min(selStart, selEnd)
      : selStart;
  const rangeEnd =
    selStart !== null && selEnd !== null
      ? Math.max(selStart, selEnd)
      : selStart;

  const hasSelection = rangeStart !== null;

  // ── Line height measurement ──────────────────────────────────────────────

  const codeWrapRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(20);
  const [topPadding, setTopPadding] = useState(16);

  useLayoutEffect(() => {
    const el = codeWrapRef.current;
    if (!el) return;

    const measure = () => {
      const lineSpan = el.querySelector("span.line");
      if (lineSpan) {
        const h = lineSpan.getBoundingClientRect().height;
        if (h > 0) setLineHeight(h);
      }
      // Measure top padding from the <pre> element
      const pre = el.querySelector("pre");
      if (pre) {
        const style = getComputedStyle(pre);
        setTopPadding(parseFloat(style.paddingTop) || 16);
      }
    };

    // Measure after a short delay to allow Shiki to render
    const t = setTimeout(measure, 100);
    return () => clearTimeout(t);
  }, [content]);

  // ── Click handler ────────────────────────────────────────────────────────

  const handleLineClick = useCallback(
    (lineNum: number, shiftKey: boolean) => {
      if (shiftKey && selStart !== null) {
        setSelEnd(lineNum);
      } else {
        setSelStart(lineNum);
        setSelEnd(lineNum);
      }
    },
    [selStart]
  );

  const clearSelection = useCallback(() => {
    setSelStart(null);
    setSelEnd(null);
  }, []);

  // Escape clears selection
  useEffect(() => {
    if (!hasSelection) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [hasSelection, clearSelection]);

  // ── Add to tray handler ──────────────────────────────────────────────────

  const handleAddSelection = useCallback(() => {
    if (rangeStart === null || rangeEnd === null) return;
    const rangeLabel =
      rangeStart === rangeEnd
        ? `${filename}#L${rangeStart}`
        : `${filename}#L${rangeStart}-L${rangeEnd}`;
    addChip({
      id: crypto.randomUUID(),
      type: "file",
      label: rangeLabel,
      subtitle: filePath,
      filePath,
      lineStart: rangeStart,
      lineEnd: rangeEnd,
    });
    clearSelection();
  }, [rangeStart, rangeEnd, filename, filePath, addChip, clearSelection]);

  // ── Helper: is line in range ─────────────────────────────────────────────

  function isInRange(lineNum: number): boolean {
    if (rangeStart === null || rangeEnd === null) return false;
    return lineNum >= rangeStart && lineNum <= rangeEnd;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const gutterWidth = 48; // px

  return (
    <div className="relative w-full overflow-auto">
      {/* Code viewer with left padding for gutter */}
      <div ref={codeWrapRef} style={{ paddingLeft: gutterWidth }}>
        <CodeViewer content={content} filename={filename} />
      </div>

      {/* Gutter overlay */}
      <div
        className="absolute top-0 left-0 select-none"
        style={{ width: gutterWidth, paddingTop: topPadding }}
      >
        {Array.from({ length: lineCount }, (_, i) => {
          const lineNum = i + 1;
          const selected = isInRange(lineNum);
          return (
            <div
              key={lineNum}
              onClick={(e) => handleLineClick(lineNum, e.shiftKey)}
              className={cn(
                "flex items-center justify-end pr-2 font-mono text-[11px] cursor-pointer transition-colors",
                selected
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/30"
              )}
              style={{ height: lineHeight }}
            >
              {lineNum}
            </div>
          );
        })}
      </div>

      {/* Selection highlight strips */}
      {hasSelection && (
        <div
          className="absolute top-0 right-0 pointer-events-none"
          style={{ left: gutterWidth, paddingTop: topPadding }}
        >
          {Array.from({ length: lineCount }, (_, i) => {
            const lineNum = i + 1;
            if (!isInRange(lineNum)) return null;
            return (
              <div
                key={lineNum}
                className="absolute w-full bg-primary/8"
                style={{
                  top: (lineNum - 1) * lineHeight,
                  height: lineHeight,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Floating selection toolbar */}
      {hasSelection && rangeStart !== null && rangeEnd !== null && (
        <div className="sticky bottom-4 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-lg">
            <span className="text-xs text-muted-foreground">
              {rangeStart === rangeEnd
                ? `Line ${rangeStart}`
                : `Lines ${rangeStart}–${rangeEnd}`}
            </span>
            <Button
              size="sm"
              variant="default"
              className="h-6 text-[11px] gap-1"
              onClick={handleAddSelection}
            >
              📎 Add to tray
            </Button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
