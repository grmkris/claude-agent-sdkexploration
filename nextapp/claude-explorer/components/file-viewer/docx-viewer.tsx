"use client";

import { useEffect, useState } from "react";

interface DocxViewerProps {
  src: string;
  filename: string;
}

export function DocxViewer({ src, filename }: DocxViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function convert() {
      try {
        setLoading(true);
        setError(null);

        const [res, mammoth] = await Promise.all([
          fetch(src),
          import("mammoth"),
        ]);

        if (!res.ok) throw new Error(`Failed to fetch file: ${res.statusText}`);

        const arrayBuffer = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });

        if (!cancelled) {
          setHtml(result.value);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to convert document"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void convert();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur">
        <span className="font-mono text-xs text-muted-foreground truncate">
          {filename}
        </span>
        <a
          href={src}
          download={filename}
          className="ml-auto flex h-6 items-center rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ↓ Download
        </a>
      </div>

      <div className="flex-1 p-6">
        {loading && (
          <div className="animate-pulse py-16 text-center text-sm text-muted-foreground">
            Converting document…
          </div>
        )}
        {error && (
          <div className="py-8 text-center text-sm text-destructive">
            {error}
          </div>
        )}
        {html && (
          <div
            className="prose prose-sm prose-invert max-w-none
              [&_table]:border-collapse [&_table]:w-full
              [&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1
              [&_th]:border [&_th]:border-border/50 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/40
              [&_img]:max-w-full [&_img]:rounded"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: mammoth output is sanitised HTML from DOCX
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
