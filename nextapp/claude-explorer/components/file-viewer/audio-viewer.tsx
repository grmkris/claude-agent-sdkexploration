"use client";

interface AudioViewerProps {
  src: string;
  filename: string;
}

export function AudioViewer({ src, filename }: AudioViewerProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/40 text-4xl">
          🎵
        </div>
        <p className="font-mono text-sm text-foreground">{filename}</p>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaptions: audio file viewer, no captions applicable */}
      <audio src={src} controls className="w-full max-w-md" preload="metadata">
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}
