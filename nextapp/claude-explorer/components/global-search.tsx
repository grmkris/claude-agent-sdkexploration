"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";

import {
  CommandPalette,
  CommandPaletteContent,
  CommandPaletteInput,
  CommandPaletteList,
  CommandPaletteGroup,
  CommandPaletteItem,
  CommandPaletteEmpty,
} from "@/components/ui/command-palette";
import { useCommandPaletteShortcut } from "@/hooks/use-command-palette";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

// --- Static navigation items ---

const NAV_ITEMS = [
  { label: "Home", href: "/", keywords: ["dashboard", "home", "overview"] },
  {
    label: "Analytics",
    href: "/analytics",
    keywords: ["stats", "usage", "activity"],
  },
  { label: "API Keys", href: "/keys", keywords: ["keys", "vault", "tokens"] },
  {
    label: "MCPs & Skills",
    href: "/mcps",
    keywords: ["mcp", "skills", "tools", "servers"],
  },
  { label: "Email", href: "/email", keywords: ["email", "inbox"] },
  { label: "Webhooks", href: "/webhooks", keywords: ["webhooks", "hooks"] },
  {
    label: "Crons",
    href: "/crons",
    keywords: ["cron", "schedule", "timer", "jobs"],
  },
  {
    label: "Tmux",
    href: "/tmux",
    keywords: ["tmux", "terminal", "panes", "sessions"],
  },
];

// --- Helpers ---

function fuzzyMatch(text: string | null | undefined, query: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

type ResultType = "nav" | "project" | "session" | "file" | "prompt";

interface SearchResult {
  type: ResultType;
  label: string;
  detail?: string;
  href: string;
}

const GROUP_LABELS: Record<ResultType, string> = {
  nav: "Navigation",
  project: "Projects",
  session: "Sessions",
  file: "Files",
  prompt: "Saved Prompts",
};

// --- Component ---

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Extract current project slug from URL
  const slugMatch = pathname.match(/^\/project\/([^/]+)/);
  const currentSlug = slugMatch?.[1] ?? undefined;

  // Register Cmd+K
  useCommandPaletteShortcut(useCallback(() => setOpen((prev) => !prev), []));

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced query for server search
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // --- Data sources ---

  // Server: sessions + files
  const { data: serverResults } = useQuery({
    queryKey: ["global-search", debouncedQuery, currentSlug],
    queryFn: () =>
      client.search({
        query: debouncedQuery,
        slug: currentSlug,
        limit: 15,
      }),
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  // Client: projects (already cached by TanStack Query from sidebar)
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());

  // Client: saved prompts
  const { data: savedPrompts } = useQuery(orpc.prompts.list.queryOptions());

  // --- Build flat result list ---

  const allResults = useMemo(() => {
    const items: SearchResult[] = [];
    if (!query) return items;

    const q = query.toLowerCase();

    // Navigation
    for (const nav of NAV_ITEMS) {
      if (fuzzyMatch(nav.label, q) || nav.keywords.some((k) => k.includes(q))) {
        items.push({ type: "nav", label: nav.label, href: nav.href });
      }
    }

    // Projects
    if (projects) {
      for (const p of projects) {
        const shortName = p.path.split("/").pop() ?? p.slug;
        if (fuzzyMatch(shortName, q) || fuzzyMatch(p.slug, q)) {
          items.push({
            type: "project",
            label: shortName,
            detail: p.path,
            href: `/project/${p.slug}`,
          });
        }
      }
    }

    // Saved prompts
    if (savedPrompts) {
      for (const sp of savedPrompts) {
        if (fuzzyMatch(sp.title, q) || fuzzyMatch(sp.content, q)) {
          items.push({
            type: "prompt",
            label: sp.title,
            detail: sp.content.slice(0, 80),
            href: "#",
          });
        }
      }
    }

    // Sessions (from server — returns RecentSession with projectSlug)
    if (serverResults?.sessions) {
      for (const s of serverResults.sessions) {
        const href = s.projectSlug
          ? `/project/${s.projectSlug}/chat/${s.id}`
          : `/chat/${s.id}`;
        items.push({
          type: "session",
          label: s.firstPrompt || "Untitled session",
          detail: [s.model, s.gitBranch].filter(Boolean).join(" \u00b7 "),
          href,
        });
      }
    }

    // Files (from server, only when in a project context)
    if (serverResults?.files && currentSlug) {
      for (const f of serverResults.files) {
        const href = f.isDirectory
          ? `/project/${currentSlug}/files?path=${encodeURIComponent(f.path)}`
          : `/project/${currentSlug}/file/${f.path}`;
        items.push({
          type: "file",
          label: f.name,
          detail: f.path,
          href,
        });
      }
    }

    return items;
  }, [query, projects, savedPrompts, serverResults, currentSlug]);

  // --- Keyboard navigation ---

  const navigateTo = useCallback(
    (href: string) => {
      if (href !== "#") {
        router.push(href);
      }
      setOpen(false);
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = allResults[selectedIndex];
        if (selected) navigateTo(selected.href);
      }
    },
    [allResults, selectedIndex, navigateTo]
  );

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allResults.length]);

  // --- Group results by type ---

  const grouped = useMemo(() => {
    const groups: Partial<Record<ResultType, SearchResult[]>> = {};
    for (const item of allResults) {
      (groups[item.type] ??= []).push(item);
    }
    return groups;
  }, [allResults]);

  // Track flat index across groups for keyboard navigation
  let flatIndex = -1;

  return (
    <CommandPalette open={open} onOpenChange={setOpen}>
      <CommandPaletteContent>
        <CommandPaletteInput
          ref={inputRef}
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setQuery(e.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder={
            currentSlug
              ? "Search files, sessions, projects\u2026"
              : "Search sessions, projects\u2026"
          }
          autoComplete="off"
          spellCheck={false}
        />
        <CommandPaletteList>
          {query.length === 0 && (
            <CommandPaletteEmpty>
              Type to search across your workspace\u2026
            </CommandPaletteEmpty>
          )}
          {query.length > 0 && allResults.length === 0 && (
            <CommandPaletteEmpty />
          )}
          {(Object.entries(grouped) as [ResultType, SearchResult[]][]).map(
            ([type, items]) => (
              <CommandPaletteGroup key={type} heading={GROUP_LABELS[type]}>
                {items.map((item) => {
                  flatIndex++;
                  const thisIndex = flatIndex;
                  return (
                    <CommandPaletteItem
                      key={`${type}-${thisIndex}-${item.href}`}
                      selected={thisIndex === selectedIndex}
                      onSelect={() => navigateTo(item.href)}
                    >
                      <TypeIcon type={item.type} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.detail && (
                        <span className="ml-2 max-w-[200px] truncate text-[10px] text-muted-foreground">
                          {item.detail}
                        </span>
                      )}
                    </CommandPaletteItem>
                  );
                })}
              </CommandPaletteGroup>
            )
          )}
        </CommandPaletteList>
        {/* Footer keyboard hints */}
        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>
            <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[9px]">
              \u2191\u2193
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[9px]">
              \u21b5
            </kbd>{" "}
            open
          </span>
          <span>
            <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[9px]">
              esc
            </kbd>{" "}
            close
          </span>
        </div>
      </CommandPaletteContent>
    </CommandPalette>
  );
}

// --- Tiny inline icons for each result type ---

function TypeIcon({ type }: { type: ResultType }) {
  const cls = "size-3.5 shrink-0 text-muted-foreground";

  switch (type) {
    case "nav":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
        </svg>
      );
    case "project":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
        </svg>
      );
    case "session":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "file":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "prompt":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            d="M4 7V4h16v3M9 20h6M12 4v16"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}
