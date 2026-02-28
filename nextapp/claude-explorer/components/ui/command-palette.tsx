"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as React from "react";

import { cn } from "@/lib/utils";

function CommandPalette({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="command-palette" {...props} />;
}

function CommandPaletteOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="command-palette-overlay"
      className={cn(
        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0",
        "bg-black/10 duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0",
        "supports-backdrop-filter:backdrop-blur-xs",
        "fixed inset-0 z-50",
        className
      )}
      {...props}
    />
  );
}

function CommandPaletteContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <CommandPaletteOverlay />
      <DialogPrimitive.Popup
        data-slot="command-palette-content"
        className={cn(
          "data-open:animate-in data-closed:animate-out",
          "data-closed:fade-out-0 data-open:fade-in-0",
          "data-closed:zoom-out-95 data-open:zoom-in-95",
          "data-closed:slide-out-to-top-2 data-open:slide-in-from-top-4",
          "bg-popover text-popover-foreground ring-foreground/10",
          "fixed top-[20%] left-1/2 z-50 -translate-x-1/2",
          "w-full max-w-lg rounded-none ring-1 shadow-2xl duration-100",
          "flex flex-col overflow-hidden max-h-[min(500px,60vh)]",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function CommandPaletteInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="flex items-center border-b border-border px-3">
      <svg
        className="mr-2 size-3.5 shrink-0 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" strokeLinecap="round" />
      </svg>
      <input
        data-slot="command-palette-input"
        className={cn(
          "flex-1 bg-transparent py-3 text-xs outline-none",
          "placeholder:text-muted-foreground",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandPaletteList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-palette-list"
      className={cn(
        "flex-1 overflow-y-auto overscroll-contain py-1 no-scrollbar",
        className
      )}
      {...props}
    />
  );
}

function CommandPaletteGroup({
  heading,
  children,
  className,
}: {
  heading: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="command-palette-group" className={cn("px-1", className)}>
      <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {heading}
      </div>
      {children}
    </div>
  );
}

function CommandPaletteItem({
  className,
  selected,
  onSelect,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  onSelect?: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Auto-scroll into view when selected via keyboard
  React.useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      data-slot="command-palette-item"
      data-selected={selected || undefined}
      onClick={onSelect}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-none px-3 py-2 text-xs outline-none select-none",
        "data-[selected]:bg-accent data-[selected]:text-accent-foreground",
        "hover:bg-accent/50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CommandPaletteEmpty({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-palette-empty"
      className={cn(
        "py-6 text-center text-xs text-muted-foreground",
        className
      )}
      {...props}
    >
      {children ?? "No results found."}
    </div>
  );
}

export {
  CommandPalette,
  CommandPaletteContent,
  CommandPaletteInput,
  CommandPaletteList,
  CommandPaletteGroup,
  CommandPaletteItem,
  CommandPaletteEmpty,
  CommandPaletteOverlay,
};
