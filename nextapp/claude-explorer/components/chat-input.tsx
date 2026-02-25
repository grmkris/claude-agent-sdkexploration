"use client";

import {
  Attachment01Icon,
  SendHorizontal,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useCallback } from "react";

import type { AttachedImage } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { useInputDraft } from "@/hooks/use-input-draft";
import { cn } from "@/lib/utils";

// ─── Image attachment constants ──────────────────────────────────────────────

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type AllowedMediaType = (typeof ALLOWED_TYPES)[number];

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB per image
const MAX_IMAGES = 5;

async function processImageFile(file: File): Promise<AttachedImage | null> {
  if (!ALLOWED_TYPES.includes(file.type as AllowedMediaType)) return null;
  if (file.size > MAX_SIZE_BYTES) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      resolve({
        id: crypto.randomUUID(),
        dataUrl,
        base64: dataUrl.split(",")[1],
        mediaType: file.type as AllowedMediaType,
        sizeBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChatInput({
  onSend,
  onStop,
  disabled,
  isStreaming,
  storageKey,
}: {
  onSend: (prompt: string, images?: AttachedImage[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  storageKey: string;
}) {
  const { value, setValue, clearDraft } = useInputDraft(storageKey);
  const [focused, setFocused] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  const addImages = useCallback((incoming: (AttachedImage | null)[]) => {
    const valid = incoming.filter((img): img is AttachedImage => img !== null);
    setAttachedImages((prev) => [...prev, ...valid].slice(0, MAX_IMAGES));
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachedImages.length === 0) || disabled || isStreaming)
      return;
    onSend(trimmed, attachedImages.length > 0 ? attachedImages : undefined);
    clearDraft();
    setAttachedImages([]);
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

  // Clipboard paste — captures images pasted with Ctrl/Cmd+V
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const imageFiles: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (
          item.kind === "file" &&
          ALLOWED_TYPES.includes(item.type as AllowedMediaType)
        ) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return; // let normal text paste proceed
      e.preventDefault();
      addImages(await Promise.all(imageFiles.map(processImageFile)));
    },
    [addImages]
  );

  // Drag-and-drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) =>
          ALLOWED_TYPES.includes(f.type as AllowedMediaType) &&
          f.size <= MAX_SIZE_BYTES
      );
      addImages(await Promise.all(files.map(processImageFile)));
    },
    [addImages]
  );

  // File picker
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      addImages(await Promise.all(files.map(processImageFile)));
      e.target.value = ""; // allow re-selecting the same file
    },
    [addImages]
  );

  const removeImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const canSend =
    !disabled && !isStreaming && (!!value.trim() || attachedImages.length > 0);

  return (
    <div
      className={cn(
        "flex flex-col border-t bg-background",
        isDragOver && "ring-2 ring-inset ring-primary/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Image thumbnail strip */}
      {attachedImages.length > 0 && (
        <div className="flex gap-2 px-3 pt-2 flex-wrap">
          {attachedImages.map((img) => (
            <div key={img.id} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.dataUrl}
                alt="attachment"
                className="h-16 w-16 rounded object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border text-muted-foreground hover:text-foreground text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        className={cn(
          "flex items-end gap-2 px-3 pt-3",
          focused ? "pb-2" : "pb-safe-input"
        )}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Attach button */}
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          className="shrink-0 rounded-full text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || attachedImages.length >= MAX_IMAGES}
          title="Attach image"
        >
          <HugeiconsIcon icon={Attachment01Icon} size={18} />
        </Button>

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
          onPaste={handlePaste}
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
            disabled={!canSend}
          >
            <HugeiconsIcon icon={SendHorizontal} size={18} />
          </Button>
        )}
      </div>
    </div>
  );
}
