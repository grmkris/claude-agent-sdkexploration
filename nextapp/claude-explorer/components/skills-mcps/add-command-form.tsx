"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

export function AddCommandForm({
  slug,
  compact = false,
  onDone,
}: {
  slug: string;
  compact?: boolean;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const add = useMutation({
    mutationFn: () =>
      client.skills.addCommand({
        name,
        content: `---\ndescription: ${description}\n---\n\n${description}`,
        scope: "project",
        slug,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.projects.config.queryOptions({ input: { slug } })
          .queryKey,
      });
      setName("");
      setDescription("");
      onDone?.();
    },
  });

  return (
    <div className="flex flex-col gap-1.5 rounded border bg-background p-2 text-xs">
      <Input
        placeholder="Command name (e.g. review)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={compact ? "h-6 text-xs" : "h-7 text-xs"}
      />
      <textarea
        placeholder="Description / content"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={compact ? 2 : 3}
        className="rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 flex-1 text-xs"
          disabled={!name || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? "Saving\u2026" : "Save"}
        </Button>
        {onDone && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs"
            onClick={onDone}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
