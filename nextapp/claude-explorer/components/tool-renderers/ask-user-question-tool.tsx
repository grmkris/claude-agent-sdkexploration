"use client";

import { useState, useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ToolRendererProps } from ".";

type QuestionOption = {
  label: string;
  description?: string;
  markdown?: string;
};

type Question = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
};

export function AskUserQuestionTool({
  input,
  output,
  toolUseId,
  onAnswer,
}: ToolRendererProps) {
  const questions = (input.questions ?? []) as Question[];
  const isAnswered = output !== undefined;

  // Track selected options per question index
  const [selections, setSelections] = useState<Map<number, Set<string>>>(
    () => new Map()
  );
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleOption = useCallback(
    (questionIdx: number, label: string, multiSelect: boolean) => {
      if (isAnswered || submitted) return;
      setSelections((prev) => {
        const next = new Map(prev);
        const current = new Set(next.get(questionIdx) ?? []);
        if (multiSelect) {
          if (current.has(label)) {
            current.delete(label);
          } else {
            current.add(label);
          }
        } else {
          current.clear();
          current.add(label);
        }
        next.set(questionIdx, current);
        return next;
      });
    },
    [isAnswered, submitted]
  );

  const handleSubmit = useCallback(async () => {
    if (!onAnswer || !toolUseId || submitted) return;
    const answers: Record<string, string[]> = {};
    questions.forEach((q, i) => {
      const sel = selections.get(i);
      answers[q.header] = sel ? Array.from(sel) : [];
    });
    setSubmitted(true);
    setSubmitError(null);
    try {
      await onAnswer(toolUseId, answers);
    } catch (err) {
      // Reset so the user can retry
      setSubmitted(false);
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Failed to submit answer. Please try again."
      );
    }
  }, [onAnswer, toolUseId, questions, selections, submitted]);

  const allQuestionsAnswered = questions.every((_, i) => {
    const sel = selections.get(i);
    return sel && sel.size > 0;
  });

  // --- Answered / read-only state ---
  if (isAnswered || submitted) {
    let parsedAnswers: Record<string, string[]> | null = null;
    try {
      parsedAnswers = output ? JSON.parse(output) : null;
    } catch {
      // not JSON — show raw
    }

    return (
      <div className="my-2 rounded-lg border border-border/40 bg-background/20 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] text-muted-foreground"
          >
            ✓ Answered
          </Badge>
        </div>
        {questions.map((q, i) => {
          const answers =
            parsedAnswers?.[q.header] ??
            (submitted ? Array.from(selections.get(i) ?? []) : []);
          return (
            <div key={i} className={cn("text-xs", i > 0 && "mt-2")}>
              <span className="font-medium text-foreground/80">
                {q.question}
              </span>
              {answers.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {answers.map((a) => (
                    <Badge key={a} variant="secondary" className="text-[10px]">
                      {a}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // --- Interactive unanswered state ---
  return (
    <div className="my-2 rounded-lg border-2 border-primary/25 bg-primary/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        {/* Question mark icon */}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
          ?
        </span>
        <span className="text-xs font-medium text-foreground/80">
          Claude is asking you a question
        </span>
      </div>

      {questions.map((q, qi) => (
        <div
          key={qi}
          className={cn(qi > 0 && "mt-4 border-t border-border/20 pt-4")}
        >
          {/* Header chip */}
          <Badge variant="outline" className="mb-2 text-[10px]">
            {q.header}
          </Badge>

          {/* Question text */}
          <p className="mb-3 text-sm font-medium leading-snug">{q.question}</p>

          {/* Options */}
          <div className="flex flex-col gap-1.5">
            {q.options.map((opt, oi) => {
              const isSelected = selections.get(qi)?.has(opt.label) ?? false;
              return (
                <button
                  key={oi}
                  type="button"
                  onClick={() => toggleOption(qi, opt.label, q.multiSelect)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-all",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/50 bg-background/50 hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  <div className="flex w-full items-center gap-2">
                    {/* Selection indicator */}
                    <span
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        q.multiSelect ? "rounded" : "rounded-full",
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-border/60"
                      )}
                    >
                      {isSelected && (
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 8 8"
                          fill="none"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {q.multiSelect ? (
                            <polyline points="1.5,4 3,5.5 6.5,2" />
                          ) : (
                            <circle
                              cx="4"
                              cy="4"
                              r="2"
                              fill="white"
                              stroke="none"
                            />
                          )}
                        </svg>
                      )}
                    </span>
                    <span className="text-sm font-medium">{opt.label}</span>
                  </div>
                  {opt.description && (
                    <p className="mt-0.5 pl-5 text-xs text-muted-foreground">
                      {opt.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {q.multiSelect && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              You can select multiple options
            </p>
          )}
        </div>
      ))}

      {submitError && (
        <p className="mt-3 text-xs text-destructive">{submitError}</p>
      )}
      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          disabled={!allQuestionsAnswered || !onAnswer || submitted}
          onClick={handleSubmit}
          className="text-xs"
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
