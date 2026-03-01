"use client";

import * as React from "react";

type CommandPaletteContextProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const CommandPaletteContext =
  React.createContext<CommandPaletteContextProps | null>(null);

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((prev) => !prev), []);
  return (
    <CommandPaletteContext value={{ open, setOpen, toggle }}>
      {children}
    </CommandPaletteContext>
  );
}

export function useCommandPalette() {
  const ctx = React.useContext(CommandPaletteContext);
  if (!ctx)
    throw new Error(
      "useCommandPalette must be used within CommandPaletteProvider"
    );
  return ctx;
}
