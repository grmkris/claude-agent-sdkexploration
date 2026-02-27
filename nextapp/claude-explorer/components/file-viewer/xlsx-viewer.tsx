"use client";

import { useEffect, useState } from "react";

interface XlsxViewerProps {
  src: string;
  filename: string;
}

interface SheetData {
  name: string;
  html: string;
}

export function XlsxViewer({ src, filename }: XlsxViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [res, XLSX] = await Promise.all([fetch(src), import("xlsx")]);

        if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);

        const arrayBuffer = await res.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });

        const parsed: SheetData[] = workbook.SheetNames.map((name) => ({
          name,
          html: XLSX.utils.sheet_to_html(workbook.Sheets[name], {
            id: `sheet-${name}`,
          }),
        }));

        if (!cancelled) {
          setSheets(parsed);
          setActiveSheet(0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to parse spreadsheet"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur">
        <span className="font-mono text-xs text-muted-foreground truncate max-w-xs">
          {filename}
        </span>
        {/* Sheet tabs */}
        {sheets.length > 1 && (
          <div className="flex items-center gap-1 ml-3">
            {sheets.map((sheet, i) => (
              <button
                key={sheet.name}
                type="button"
                onClick={() => setActiveSheet(i)}
                className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                  i === activeSheet
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        )}
        <a
          href={src}
          download={filename}
          className="ml-auto flex h-6 items-center rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ↓ Download
        </a>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="animate-pulse py-16 text-center text-sm text-muted-foreground">
            Parsing spreadsheet…
          </div>
        )}
        {error && (
          <div className="py-8 text-center text-sm text-destructive">
            {error}
          </div>
        )}
        {sheets[activeSheet] && (
          <div
            className="
              text-xs
              [&_table]:w-full [&_table]:border-collapse [&_table]:font-mono
              [&_td]:border [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1 [&_td]:text-foreground/85
              [&_th]:border [&_th]:border-border/50 [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium [&_th]:text-foreground/60
            "
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SheetJS output is sanitised HTML table
            dangerouslySetInnerHTML={{ __html: sheets[activeSheet].html }}
          />
        )}
      </div>
    </div>
  );
}
