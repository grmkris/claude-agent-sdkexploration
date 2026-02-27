"use client";

interface VideoViewerProps {
  src: string;
  filename: string;
}

export function VideoViewer({ src, filename }: VideoViewerProps) {
  return (
    <div className="flex flex-col items-center gap-3 p-4">
      {/* biome-ignore lint/a11y/useMediaCaptions: user-uploaded file, captions not available */}
      <video
        src={src}
        controls
        controlsList="nodownload"
        className="max-h-[75vh] w-full max-w-4xl rounded-lg border border-border/50 bg-black shadow"
        preload="metadata"
      >
        Your browser does not support the video element.
      </video>
      <p className="text-xs text-muted-foreground">{filename}</p>
    </div>
  );
}
