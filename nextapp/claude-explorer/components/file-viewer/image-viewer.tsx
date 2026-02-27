"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

interface ImageViewerProps {
  src: string;
  filename: string;
}

export function ImageViewer({ src, filename }: ImageViewerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Clickable thumbnail → opens lightbox */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-border/50 bg-muted/20 shadow-sm transition hover:border-border"
        aria-label="Click to open full-size image"
      >
        {/* biome-ignore lint/performance/noImgElement: intentional img for file viewer */}
        <img
          src={src}
          alt={filename}
          className="max-h-[70vh] max-w-full object-contain"
        />
        <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
            Click to zoom
          </span>
        </div>
      </button>

      <Lightbox
        open={open}
        close={() => setOpen(false)}
        slides={[{ src, alt: filename, download: src }]}
        plugins={[Zoom, Fullscreen, Download]}
        zoom={{ maxZoomPixelRatio: 8, scrollToZoom: true }}
        styles={{ container: { backgroundColor: "rgba(0,0,0,0.92)" } }}
      />
    </div>
  );
}
