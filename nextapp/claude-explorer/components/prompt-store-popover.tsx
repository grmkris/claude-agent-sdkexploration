"use client";

import {
  ArrowLeft01Icon,
  Delete02Icon,
  NoteIcon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { SavedPrompt } from "@/lib/types";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode =
  | { type: "list" }
  | { type: "create" }
  | { type: "edit"; prompt: SavedPrompt };

// ─── Prompt Form ─────────────────────────────────────────────────────────────

function PromptForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: SavedPrompt;
  onSave: (title: string, content: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={titleRef}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Prompt title…"
        className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Prompt content…"
        rows={5}
        className="w-full resize-none rounded border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
      />
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSave(title.trim(), content.trim())}
          disabled={!title.trim() || !content.trim() || isPending}
        >
          {initial ? "Update" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PromptStorePopover({
  onInsert,
}: {
  onInsert: (content: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>({ type: "list" });
  const queryClient = useQueryClient();

  const { data: prompts = [] } = useQuery(orpc.prompts.list.queryOptions());

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.prompts.list.queryOptions().queryKey,
    });
  };

  const create = useMutation({
    mutationFn: (vars: { title: string; content: string }) =>
      client.prompts.create(vars),
    onSuccess: () => {
      invalidate();
      setMode({ type: "list" });
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; title: string; content: string }) =>
      client.prompts.update(vars),
    onSuccess: () => {
      invalidate();
      setMode({ type: "list" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => client.prompts.delete({ id }),
    onSuccess: () => {
      invalidate();
    },
  });

  const handleInsert = (prompt: SavedPrompt) => {
    onInsert(prompt.content);
    setOpen(false);
  };

  const handleSave = (title: string, content: string) => {
    if (mode.type === "create") {
      create.mutate({ title, content });
    } else if (mode.type === "edit") {
      update.mutate({ id: mode.prompt.id, title, content });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMode({ type: "list" });
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            className="shrink-0 rounded-full text-muted-foreground"
            title="Saved prompts"
            aria-label="Saved prompts"
          />
        }
      >
        <HugeiconsIcon icon={NoteIcon} size={18} />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-80 p-0"
      >
        {/* Header */}
        <div className="flex items-center gap-1 border-b px-3 py-2">
          {mode.type !== "list" && (
            <button
              type="button"
              onClick={() => setMode({ type: "list" })}
              className="mr-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Back to list"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
            </button>
          )}
          <span className="flex-1 text-xs font-medium">
            {mode.type === "list"
              ? "Saved Prompts"
              : mode.type === "create"
                ? "New Prompt"
                : "Edit Prompt"}
          </span>
          {mode.type === "list" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setMode({ type: "create" })}
            >
              + New
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="p-2">
          {mode.type === "list" ? (
            prompts.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No saved prompts yet.
              </p>
            ) : (
              <ScrollArea className="max-h-64">
                <ul className="flex flex-col gap-0.5">
                  {prompts.map((prompt) => (
                    <li
                      key={prompt.id}
                      className="group flex items-start gap-1"
                    >
                      <button
                        type="button"
                        onClick={() => handleInsert(prompt)}
                        className={cn(
                          "flex min-w-0 flex-1 flex-col rounded px-2 py-1.5 text-left transition-colors",
                          "hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <span className="truncate text-xs font-medium">
                          {prompt.title}
                        </span>
                        <span className="line-clamp-1 text-[10px] text-muted-foreground">
                          {prompt.content}
                        </span>
                      </button>

                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => setMode({ type: "edit", prompt })}
                        className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                        aria-label={`Edit "${prompt.title}"`}
                      >
                        <HugeiconsIcon icon={PencilEdit01Icon} size={12} />
                      </button>

                      {/* Delete button — wrapped in AlertDialog */}
                      <AlertDialog>
                        <AlertDialogTrigger
                          className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          aria-label={`Delete "${prompt.title}"`}
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={12} />
                        </AlertDialogTrigger>
                        <AlertDialogContent size="sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
                            <AlertDialogDescription>
                              &ldquo;{prompt.title}&rdquo; will be permanently
                              removed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => remove.mutate(prompt.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )
          ) : (
            <PromptForm
              initial={mode.type === "edit" ? mode.prompt : undefined}
              onSave={handleSave}
              onCancel={() => setMode({ type: "list" })}
              isPending={isPending}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
