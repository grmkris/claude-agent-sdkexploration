"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { orpc } from "@/lib/orpc";

export function AppBreadcrumb() {
  const pathname = usePathname();
  const projectMatch = pathname.match(/^\/project\/([^/]+)/);
  const slug = projectMatch?.[1] ?? null;

  const { data: projects } = useQuery({
    ...orpc.projects.list.queryOptions(),
    enabled: !!slug,
  });

  if (slug) {
    const project = projects?.find((p) => p.slug === slug);
    const name = project
      ? project.path.split("/").at(-1)
      : slug.replace(/-/g, " ");

    // Detect sub-pages
    const fileMatch = pathname.match(/^\/project\/[^/]+\/file\/(.+)$/);
    const filePath = fileMatch?.[1] ?? null;

    const sectionMatch = pathname.match(
      /^\/project\/[^/]+\/(overview|git|skills|files|automations|crons|webhooks|email|diff|activity)(?:\/|$)/
    );
    const sectionName = sectionMatch?.[1] ?? null;
    const sectionLabel: Record<string, string> = {
      overview: "Overview",
      git: "Git",
      skills: "Skills & MCPs",
      files: "Files",
      automations: "Automations",
      crons: "Crons",
      webhooks: "Webhooks",
      email: "Email",
      diff: "Diff",
      activity: "Activity",
    };

    const hasSubPage = !!filePath || !!sectionName;

    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Link
          href="/"
          className={
            hasSubPage
              ? "text-muted-foreground hover:text-foreground transition-colors"
              : "text-foreground font-medium hover:text-foreground/80 transition-colors"
          }
        >
          {name}
        </Link>
        {sectionName && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground font-medium capitalize">
              {sectionLabel[sectionName] ?? sectionName}
            </span>
          </>
        )}
        {filePath && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="font-mono text-foreground font-medium">
              {filePath}
            </span>
          </>
        )}
      </div>
    );
  }

  return null;
}
