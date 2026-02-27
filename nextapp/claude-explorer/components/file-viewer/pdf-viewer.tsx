"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Use the bundled worker from react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PDFViewerProps {
  src: string;
  filename: string;
}

export function PDFViewer({ src, filename }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  const onLoadError = useCallback((err: Error) => {
    setError(err.message);
    setLoading(false);
  }, []);

  return (
    <div className="flex flex-col items-center gap-0">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex w-full items-center gap-3 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur">
        <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
          {filename}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {/* Zoom controls */}
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Zoom in"
          >
            +
          </button>

          {/* Page navigation */}
          {numPages > 1 && (
            <>
              <div className="mx-1 h-4 w-px bg-border/50" />
              <button
                type="button"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
                className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="text-xs text-muted-foreground">
                {pageNumber} / {numPages}
              </span>
              <button
                type="button"
                onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                disabled={pageNumber >= numPages}
                className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                aria-label="Next page"
              >
                ›
              </button>
            </>
          )}

          {/* Download */}
          <div className="mx-1 h-4 w-px bg-border/50" />
          <a
            href={src}
            download={filename}
            className="flex h-6 items-center rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ↓ Download
          </a>
        </div>
      </div>

      {/* Document */}
      <div className="flex w-full flex-col items-center gap-0 overflow-x-auto p-4">
        {loading && (
          <div className="animate-pulse py-16 text-sm text-muted-foreground">
            Loading PDF…
          </div>
        )}
        {error && (
          <div className="py-8 text-sm text-destructive">
            Failed to load PDF: {error}
          </div>
        )}
        <Document
          file={src}
          onLoadSuccess={onLoadSuccess}
          onLoadError={onLoadError}
          className="flex flex-col items-center gap-4"
        >
          {/* Render all pages if small doc, or just current page */}
          {numPages > 0 &&
            (numPages <= 20 ? (
              Array.from({ length: numPages }, (_, i) => (
                <div
                  key={i + 1}
                  id={`page-${i + 1}`}
                  className="shadow-md rounded overflow-hidden"
                >
                  <Page
                    pageNumber={i + 1}
                    scale={scale}
                    renderTextLayer
                    renderAnnotationLayer
                  />
                </div>
              ))
            ) : (
              <div className="shadow-md rounded overflow-hidden">
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer
                  renderAnnotationLayer
                />
              </div>
            ))}
        </Document>
      </div>
    </div>
  );
}
