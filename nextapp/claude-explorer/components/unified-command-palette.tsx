"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";

import type { LiveSession } from "@/components/resume-session-popover";

import { StateBadgeInline } from "@/components/session-state-badge";
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
import { useCommandPalette } from "@/lib/command-palette-context";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Static navigation items
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  liveSession?: LiveSession;
}

const GROUP_LABELS: Record<ResultType, string> = {
  nav: "Navigation",
  project: "Projects",
  session: "Sessions",
  file: "Files",
  prompt: "Saved Prompts",
};

function formatSlug(slug: string) {
  return slug.replace(/^-home-bun-projects-/, "").replace(/-/g, " ");
}

// ---------------------------------------------------------------------------
// Navigable item for keyboard navigation (used in both modes)
// ---------------------------------------------------------------------------

interface NavigableItem {
  href: string;
  id: string;
}

// ---------------------------------------------------------------------------
// UnifiedCommandPalette
// ---------------------------------------------------------------------------

export function UnifiedCommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string | null>(
    null
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const currentSlug = pathname.match(/^\/project\/([^/]+)/)?.[1] ?? undefined;

  // Register Cmd+K
  useCommandPaletteShortcut(useCallback(() => setOpen(!open), [open, setOpen]));

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setSelectedProjectSlug(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const isSearchMode = query.length > 0;

  // -------------------------------------------------------------------------
  // Browse mode data
  // -------------------------------------------------------------------------

  const { data: liveSessions = [] } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 10_000,
  });

  const { data: projects = [] } = useQuery(orpc.projects.list.queryOptions());

  const { data: recentSessions = [] } = useQuery({
    ...orpc.sessions.timeline.queryOptions({
      input: { limit: 50, slug: selectedProjectSlug ?? undefined },
    }),
    refetchInterval: 15_000,
  });

  const sessionStateMap = useMemo(() => {
    const map = new Map<string, LiveSession>();
    for (const s of liveSessions as LiveSession[]) {
      map.set(s.session_id, s);
    }
    return map;
  }, [liveSessions]);

  const archiveAllMutation = useMutation({
    mutationFn: async () => {
      const toArchive = recentSessions.filter(
        (s) => !sessionStateMap.get(s.id)
      );
      await Promise.all(
        toArchive.map((s) => client.sessions.archive({ sessionId: s.id }))
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 1 &&
            (key[0] === "sessions" || key[0] === "liveState")
          );
        },
      });
    },
  });

  const projectsWithSessions = useMemo(() => {
    const slugs = new Set<string>();
    for (const s of recentSessions) {
      if (s.projectSlug) slugs.add(s.projectSlug);
    }
    for (const s of liveSessions as LiveSession[]) {
      if (s.project_path) {
        const proj = projects.find(
          (p) =>
            s.project_path === p.path ||
            s.project_path?.startsWith(p.path + "/")
        );
        if (proj) slugs.add(proj.slug);
      }
    }
    return Array.from(slugs).sort();
  }, [recentSessions, liveSessions, projects]);

  // -------------------------------------------------------------------------
  // Search mode data
  // -------------------------------------------------------------------------

  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

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

  const { data: savedPrompts } = useQuery(orpc.prompts.list.queryOptions());

  // -------------------------------------------------------------------------
  // Build search results
  // -------------------------------------------------------------------------

  const searchResults = useMemo(() => {
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

    // Sessions (from server)
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
          liveSession: sessionStateMap.get(s.id),
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
  }, [
    query,
    projects,
    savedPrompts,
    serverResults,
    currentSlug,
    sessionStateMap,
  ]);

  // -------------------------------------------------------------------------
  // Build navigable items for keyboard navigation
  // -------------------------------------------------------------------------

  const browseItems = useMemo<NavigableItem[]>(() => {
    return recentSessions.map((s) => ({
      id: s.id,
      href: s.projectSlug
        ? `/project/${s.projectSlug}/chat/${s.id}`
        : `/chat/${s.id}`,
    }));
  }, [recentSessions]);

  const searchItems = useMemo<NavigableItem[]>(() => {
    return searchResults.map((r, i) => ({
      id: `${r.type}-${i}`,
      href: r.href,
    }));
  }, [searchResults]);

  const navigableItems = isSearchMode ? searchItems : browseItems;

  // -------------------------------------------------------------------------
  // Navigation & keyboard
  // -------------------------------------------------------------------------

  const navigateTo = useCallback(
    (href: string) => {
      if (href !== "#") {
        router.push(href);
      }
      setOpen(false);
    },
    [router, setOpen]
  );

  const handleNewSession = useCallback(() => {
    const slugMatch = pathname.match(/^\/project\/([^/]+)/);
    const slug = slugMatch?.[1];
    const url = slug
      ? `/project/${slug}/chat?_new=${Date.now()}`
      : `/chat?_new=${Date.now()}`;
    setOpen(false);
    router.push(url);
  }, [pathname, router, setOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, navigableItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = navigableItems[selectedIndex];
        if (selected) navigateTo(selected.href);
      }
    },
    [navigableItems, selectedIndex, navigateTo]
  );

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [navigableItems.length, isSearchMode]);

  // -------------------------------------------------------------------------
  // Search mode: group results by type
  // -------------------------------------------------------------------------

  const grouped = useMemo(() => {
    const groups: Partial<Record<ResultType, SearchResult[]>> = {};
    for (const item of searchResults) {
      (groups[item.type] ??= []).push(item);
    }
    return groups;
  }, [searchResults]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Track flat index across groups for keyboard navigation in search mode
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

        {/* Browse mode: action bar */}
        {!isSearchMode && (
          <div className="flex items-center justify-between border-b px-3 py-1.5">
            {/* Project filter chips */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none min-w-0 flex-1">
              {projectsWithSessions.length > 0 && (
                <>
                  <button
                    onClick={() => setSelectedProjectSlug(null)}
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                      selectedProjectSlug === null
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                  {projectsWithSessions.map((slug) => (
                    <button
                      key={slug}
                      onClick={() =>
                        setSelectedProjectSlug(
                          selectedProjectSlug === slug ? null : slug
                        )
                      }
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                        selectedProjectSlug === slug
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {formatSlug(slug)}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                onClick={() => archiveAllMutation.mutate()}
                disabled={
                  archiveAllMutation.isPending || recentSessions.length === 0
                }
                title="Archive all non-live conversations"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                >
                  <path d="M21 8v13H3V8" />
                  <path d="M1 3h22v5H1z" />
                  <path d="M10 12h4" />
                </svg>
                {archiveAllMutation.isPending ? "Archiving..." : "Archive all"}
              </button>
              <button
                onClick={handleNewSession}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New
              </button>
            </div>
          </div>
        )}

        <CommandPaletteList>
          {/* ---- Browse mode ---- */}
          {!isSearchMode && (
            <>
              {recentSessions.length === 0 ? (
                <CommandPaletteEmpty>No conversations yet</CommandPaletteEmpty>
              ) : (
                recentSessions.map((session, idx) => {
                  const liveSession = sessionStateMap.get(session.id);
                  const url = session.projectSlug
                    ? `/project/${session.projectSlug}/chat/${session.id}`
                    : `/chat/${session.id}`;

                  return (
                    <CommandPaletteItem
                      key={session.id}
                      selected={idx === selectedIndex}
                      onSelect={() => navigateTo(url)}
                    >
                      <div className="pt-0.5 shrink-0">
                        {liveSession ? (
                          <StateBadgeInline
                            state={liveSession.state}
                            currentTool={liveSession.current_tool}
                            compact
                          />
                        ) : (
                          <svg
                            className="h-3.5 w-3.5 text-muted-foreground/50"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                          >
                            <path d="M2.75 0h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 14H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 15.543V14H2.75A1.75 1.75 0 0 1 1 12.25V1.75C1 .784 1.784 0 2.75 0Z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-xs font-medium block">
                          {session.firstPrompt || "Untitled session"}
                        </span>
                        {session.projectSlug && (
                          <span className="mt-0.5 truncate text-[10px] text-muted-foreground block">
                            {formatSlug(session.projectSlug)}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {getTimeAgo(session.lastModified)}
                        </span>
                        {liveSession && (
                          <span className="text-[10px] font-medium text-green-500">
                            live
                          </span>
                        )}
                      </div>
                    </CommandPaletteItem>
                  );
                })
              )}
            </>
          )}

          {/* ---- Search mode ---- */}
          {isSearchMode && (
            <>
              {query.length > 0 && searchResults.length === 0 && (
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
                          {item.type === "session" && item.liveSession ? (
                            <StateBadgeInline
                              state={item.liveSession.state}
                              currentTool={item.liveSession.current_tool}
                              compact
                            />
                          ) : (
                            <TypeIcon type={item.type} />
                          )}
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
            </>
          )}
        </CommandPaletteList>

        {/* Footer keyboard hints */}
        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>
            <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[9px]">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[9px]">
              ↵
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

// ---------------------------------------------------------------------------
// Tiny inline icons for each result type (search mode)
// ---------------------------------------------------------------------------

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
