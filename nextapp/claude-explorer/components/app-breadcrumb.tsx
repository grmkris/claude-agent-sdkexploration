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

    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Claude Explorer
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <Link
          href={`/project/${slug}`}
          className="text-foreground font-medium hover:text-foreground/80 transition-colors"
        >
          {name}
        </Link>
      </div>
    );
  }

  return (
    <Link
      href="/"
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      Claude Explorer
    </Link>
  );
}
