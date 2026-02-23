import { test, expect, describe } from "bun:test";

import type { CronJob } from "./types";

import { shouldFire } from "./cron-scheduler";

function makeCron(expression: string): CronJob {
  return {
    id: "test",
    expression,
    prompt: "test",
    projectSlug: "test",
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

describe("shouldFire", () => {
  test("every-5-min cron fires when within 60s after scheduled time", () => {
    const cron = makeCron("*/5 * * * *");
    // 1 second after boundary: prev() returns 12:05:00, diff = 1s
    const at = new Date("2025-06-15T12:05:01Z");
    expect(shouldFire(cron, at)).toBe(true);

    // 30 seconds after: prev() returns 12:05:00, diff = 30s
    const at2 = new Date("2025-06-15T12:05:30Z");
    expect(shouldFire(cron, at2)).toBe(true);
  });

  test("every-5-min cron does NOT fire between boundaries", () => {
    const cron = makeCron("*/5 * * * *");
    // 12:03:00 — last scheduled was 12:00, that's 180s ago
    const at = new Date("2025-06-15T12:03:00Z");
    expect(shouldFire(cron, at)).toBe(false);
  });

  test("hourly cron fires just after the top of the hour", () => {
    const cron = makeCron("0 * * * *");
    const at = new Date("2025-06-15T14:00:15Z"); // prev() = 14:00:00, diff = 15s
    expect(shouldFire(cron, at)).toBe(true);
  });

  test("hourly cron does NOT fire mid-hour", () => {
    const cron = makeCron("0 * * * *");
    const at = new Date("2025-06-15T14:30:00Z");
    expect(shouldFire(cron, at)).toBe(false);
  });

  test("daily at 9am fires just after 9:00", () => {
    const cron = makeCron("0 9 * * *");
    const at = new Date("2025-06-15T09:00:30Z"); // prev() = 09:00:00, diff = 30s
    expect(shouldFire(cron, at)).toBe(true);
  });

  test("daily at 9am does NOT fire at 10:00", () => {
    const cron = makeCron("0 9 * * *");
    const at = new Date("2025-06-15T10:00:00Z");
    expect(shouldFire(cron, at)).toBe(false);
  });

  test("invalid expression returns false", () => {
    const cron = makeCron("not a cron");
    const at = new Date();
    expect(shouldFire(cron, at)).toBe(false);
  });

  test("every minute fires shortly after any minute boundary", () => {
    const cron = makeCron("* * * * *");
    const at = new Date("2025-06-15T12:37:10Z"); // prev() = 12:37:00, diff = 10s
    expect(shouldFire(cron, at)).toBe(true);
  });
});
