"use client";

import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";

export function MarkdownContent({
  children,
  isStreaming = false,
}: {
  children: string;
  isStreaming?: boolean;
}) {
  return (
    <Streamdown
      mode={isStreaming ? "streaming" : "static"}
      animated={isStreaming}
      isAnimating={isStreaming}
      plugins={{ code }}
      className="text-sm"
    >
      {children}
    </Streamdown>
  );
}
