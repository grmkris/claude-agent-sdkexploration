"use client";

import { MarkdownContent } from "@/components/markdown-content";

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <MarkdownContent isStreaming={false}>{content}</MarkdownContent>
    </div>
  );
}
