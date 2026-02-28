"use client";

import type {
  ActivityItem,
  CommitRaw,
  DeploymentRaw,
} from "@/lib/activity-types";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ChatContextSheetProps {
  item: ActivityItem | null;
  slug: string;
  relatedDeployments?: DeploymentRaw[];
  relatedCommit?: CommitRaw;
  onClose: () => void;
}

export function ChatContextSheet({ item, onClose }: ChatContextSheetProps) {
  return (
    <Sheet
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>Start chat with context</SheetTitle>
          <SheetDescription>{item?.title ?? ""}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 text-sm text-muted-foreground">
          Chat context from activity items is coming soon.
        </div>
      </SheetContent>
    </Sheet>
  );
}
