import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "chat-draft:";

export function useInputDraft(storageKey: string) {
  const [value, setValue_] = useState("");

  // Load saved draft after mount — useEffect avoids SSR hydration mismatch
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (saved) setValue_(saved);
  }, [storageKey]);

  const setValue = useCallback(
    (newValue: string) => {
      setValue_(newValue);
      if (newValue) {
        localStorage.setItem(STORAGE_PREFIX + storageKey, newValue);
      } else {
        localStorage.removeItem(STORAGE_PREFIX + storageKey);
      }
    },
    [storageKey]
  );

  const clearDraft = useCallback(() => {
    setValue_("");
    localStorage.removeItem(STORAGE_PREFIX + storageKey);
  }, [storageKey]);

  return { value, setValue, clearDraft };
}
