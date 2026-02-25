"use client";

import { generateCursorUrl } from "@/lib/cursor-urls";

/** The Cursor editor logo — a stylised cursor arrow. */
function CursorLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Cursor arrow shape */}
      <path d="M4 2L4 17.5L7.5 14L10.5 21L12.5 20L9.5 13L14.5 13L4 2Z" />
    </svg>
  );
}

interface OpenInCursorButtonProps {
  /** Absolute path on the host to open. */
  path: string;
  /** SSH hostname from server config. When null, opens a local file:// URL. */
  sshHost: string | null | undefined;
  /** Show a text label next to the icon. Default: true. */
  showLabel?: boolean;
  className?: string;
}

/**
 * A plain <a href="cursor://..."> button that deep-links into the Cursor editor.
 *
 * Remote SSH:  cursor://vscode-remote/ssh-remote+{host}{path}
 * Local:       cursor://file{path}
 */
export function OpenInCursorButton({
  path,
  sshHost,
  showLabel = true,
  className,
}: OpenInCursorButtonProps) {
  const url = generateCursorUrl(path, sshHost);

  return (
    <a
      href={url}
      title={url}
      onClick={(e) => e.stopPropagation()}
      className={[
        "inline-flex items-center gap-1.5",
        "rounded-md border border-sidebar-border",
        "bg-sidebar px-2 py-1",
        "text-[11px] text-sidebar-foreground/80",
        "transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "select-none",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <CursorLogo className="h-3 w-3 shrink-0" />
      {showLabel && <span>Open in Cursor</span>}
    </a>
  );
}
