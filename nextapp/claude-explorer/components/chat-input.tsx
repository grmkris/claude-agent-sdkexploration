"use client";

import { useState, useRef, useCallback } from "react";

import { Button } from "@/components/ui/button";

export function ChatInput({
  onSend,
  onStop,
  disabled,
  isStreaming,
}: {
  onSend: (prompt: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex gap-2 border-t bg-background p-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          autoGrow();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Send a message..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm max-md:text-base outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-50"
        style={{ maxHeight: 200 }}
      />
      {isStreaming ? (
        <Button size="sm" variant="outline" onClick={onStop}>
          Stop
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
        >
          Send
        </Button>
      )}
    </div>
  );
}
