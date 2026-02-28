"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StackState, TechCategory } from "./types";

import { generateCliCommand, generateCliString } from "./command-generator";
import { analyzeStackCompatibility, getDisabledReason } from "./compatibility";
import { DEFAULT_STACK, PRESET_STACKS } from "./constants";

function stackHash(stack: StackState): string {
  return JSON.stringify(stack);
}

export function useStackBuilder() {
  const [stack, setStack] = useState<StackState>({ ...DEFAULT_STACK });
  const [compatibilityNotes, setCompatibilityNotes] = useState<string[]>([]);
  const lastHashRef = useRef(stackHash(DEFAULT_STACK));

  // Run compatibility checks when stack changes
  useEffect(() => {
    const hash = stackHash(stack);
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    const result = analyzeStackCompatibility(stack);
    if (result.adjustedStack) {
      lastHashRef.current = stackHash(result.adjustedStack);
      setStack(result.adjustedStack);
      setCompatibilityNotes(result.changes);
    } else {
      setCompatibilityNotes([]);
    }
  }, [stack]);

  const selectOption = useCallback(
    (category: TechCategory, optionId: string) => {
      if (category === "addons") {
        // Use toggleAddon for addons
        return;
      }
      setStack((prev) => ({ ...prev, [category]: optionId }));
    },
    []
  );

  const toggleAddon = useCallback((addonId: string) => {
    setStack((prev) => {
      const has = prev.addons.includes(addonId);
      return {
        ...prev,
        addons: has
          ? prev.addons.filter((a) => a !== addonId)
          : [...prev.addons, addonId],
      };
    });
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = PRESET_STACKS.find((p) => p.id === presetId);
    if (preset) {
      const newStack = {
        ...DEFAULT_STACK,
        ...preset.stack,
        addons: preset.stack.addons ?? DEFAULT_STACK.addons,
      };
      lastHashRef.current = stackHash(newStack);
      setStack(newStack);
      setCompatibilityNotes([]);
    }
  }, []);

  const reset = useCallback(() => {
    const s = { ...DEFAULT_STACK };
    lastHashRef.current = stackHash(s);
    setStack(s);
    setCompatibilityNotes([]);
  }, []);

  const setProjectName = useCallback((name: string) => {
    setStack((prev) => ({ ...prev, projectName: name }));
  }, []);

  const cliCommand = useMemo(() => generateCliCommand(stack), [stack]);
  const cliString = useMemo(() => generateCliString(stack), [stack]);

  const checkDisabled = useCallback(
    (category: TechCategory, optionId: string) =>
      getDisabledReason(stack, category, optionId),
    [stack]
  );

  return {
    stack,
    selectOption,
    toggleAddon,
    applyPreset,
    reset,
    setProjectName,
    cliCommand,
    cliString,
    compatibilityNotes,
    getDisabledReason: checkDisabled,
  };
}
