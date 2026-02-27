"use client";

import { useEffect, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/orpc-client";

import type { ToolRendererProps } from ".";

type AllowedPrompt = { tool: string; prompt: string };

export function ExitPlanModeTool({
  input,
  output,
  toolUseId,
  onApprovePlan,
  sessionId,
}: ToolRendererProps) {
  const allowedPrompts = (input.allowedPrompts ?? []) as AllowedPrompt[];
  const isResolved = output !== undefined;

  const [planText, setPlanText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch plan text from server when mounted and not yet resolved
  useEffect(() => {
    if (isResolved || !toolUseId || !sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await client.getPendingPlan({
          sessionId,
          toolUseId,
        });
        if (!cancelled) {
          setPlanText(result?.planText ?? "");
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPlanText("");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toolUseId, sessionId, isResolved]);

  const handleApprove = () => {
    if (!toolUseId || !onApprovePlan || submitting || submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    onApprovePlan(toolUseId, true);
  };

  const handleReject = () => {
    if (!toolUseId || !onApprovePlan || submitting || submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    onApprovePlan(toolUseId, false, feedback.trim() || undefined);
  };

  // --- Resolved / read-only state ---
  if (isResolved || submitted) {
    // Parse output to determine if it was approved or rejected
    const wasApproved =
      typeof output === "string"
        ? output.includes("approved") || !output.includes("rejected")
        : submitted;

    return (
      <div className="my-2 rounded-lg border border-border/40 bg-background/20 p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[11px] font-bold text-blue-500">
            {/* Map icon */}
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
              <line x1="9" y1="3" x2="9" y2="18" />
              <line x1="15" y1="6" x2="15" y2="21" />
            </svg>
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] ${wasApproved ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
          >
            {wasApproved ? "✓ Plan approved" : "✗ Plan rejected"}
          </Badge>
        </div>
      </div>
    );
  }

  // --- Interactive approval card ---
  return (
    <div className="my-2 rounded-lg border-2 border-blue-500/30 bg-blue-500/[0.04] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
          {/* Map icon */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
            <line x1="9" y1="3" x2="9" y2="18" />
            <line x1="15" y1="6" x2="15" y2="21" />
          </svg>
        </span>
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
          Claude wants to start implementing
        </span>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Claude has finished exploring and created a plan. Review it below, then
        approve to let it proceed — or reject to ask for revisions.
      </p>

      {/* Plan content */}
      {loading ? (
        <div className="mb-4 rounded-md border border-border/40 bg-background/30 p-3">
          <div className="animate-pulse text-xs text-muted-foreground">
            Loading plan…
          </div>
        </div>
      ) : planText ? (
        <div className="mb-4 max-h-72 overflow-y-auto rounded-md border border-border/40 bg-background/50 p-3 text-sm">
          <MarkdownContent>{planText}</MarkdownContent>
        </div>
      ) : (
        <div className="mb-4 rounded-md border border-border/40 bg-background/30 p-3">
          <p className="text-xs text-muted-foreground italic">
            No PLAN.md found — Claude may have described the plan in text above.
          </p>
        </div>
      )}

      {/* Allowed prompts / permissions Claude wants */}
      {allowedPrompts.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-foreground/70">
            Requested permissions:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allowedPrompts.map((p, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="text-[10px] font-normal"
              >
                <span className="mr-1 font-medium opacity-60">{p.tool}:</span>
                {p.prompt}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Rejection feedback */}
      <div className="mb-4">
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Optional: feedback for Claude if rejecting…"
          rows={2}
          className="w-full resize-none rounded-md border border-border/50 bg-background/50 px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={handleReject}
          className="text-xs text-red-600 hover:bg-red-500/10 hover:border-red-500/40 dark:text-red-400"
        >
          {/* X icon */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-1"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Reject — revise plan
        </Button>
        <Button
          size="sm"
          disabled={submitting}
          onClick={handleApprove}
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
        >
          {/* Check icon */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-1"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
          Approve — start implementing
        </Button>
      </div>
    </div>
  );
}
