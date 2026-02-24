"use client";

import { SendHorizontal, StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, useRef, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [focused, setFocused] = useState(false);
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
    textareaRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 border-t bg-background px-3 pt-3",
        focused ? "pb-2" : "pb-safe-input"
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          autoGrow();
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Send a message..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm max-md:text-base outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-50"
        style={{ maxHeight: 200 }}
      />
      {isStreaming ? (
        <Button
          size="icon-lg"
          variant="outline"
          className="shrink-0 rounded-full"
          onClick={onStop}
        >
          <HugeiconsIcon icon={StopIcon} size={18} />
        </Button>
      ) : (
        <Button
          size="icon-lg"
          className="shrink-0 rounded-full"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
        >
          <HugeiconsIcon icon={SendHorizontal} size={18} />
        </Button>
      )}
    </div>
  );
}
