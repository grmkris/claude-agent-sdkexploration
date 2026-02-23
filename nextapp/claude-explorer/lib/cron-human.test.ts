import { test, expect, describe } from "bun:test";

import { cronToHuman, CRON_PRESETS } from "./cron-human";

describe("cronToHuman", () => {
  test("every N minutes", () => {
    expect(cronToHuman("*/5 * * * *")).toBe("every 5 min");
    expect(cronToHuman("*/15 * * * *")).toBe("every 15 min");
    expect(cronToHuman("*/30 * * * *")).toBe("every 30 min");
  });

  test("every minute", () => {
    expect(cronToHuman("* * * * *")).toBe("every minute");
  });

  test("every hour (minute 0)", () => {
    expect(cronToHuman("0 * * * *")).toBe("every hour");
  });

  test("every hour at specific minute", () => {
    expect(cronToHuman("15 * * * *")).toBe("every hour at :15");
    expect(cronToHuman("5 * * * *")).toBe("every hour at :05");
  });

  test("every N hours", () => {
    expect(cronToHuman("0 */2 * * *")).toBe("every 2h");
    expect(cronToHuman("0 */6 * * *")).toBe("every 6h");
  });

  test("daily at specific time", () => {
    expect(cronToHuman("0 9 * * *")).toBe("daily at 9:00");
    expect(cronToHuman("30 14 * * *")).toBe("daily at 14:30");
    expect(cronToHuman("0 0 * * *")).toBe("daily at 0:00");
  });

  test("specific weekday", () => {
    expect(cronToHuman("0 9 * * 1")).toBe("Mon at 9:00");
    expect(cronToHuman("30 8 * * 0")).toBe("Sun at 8:30");
    expect(cronToHuman("0 17 * * 5")).toBe("Fri at 17:00");
    expect(cronToHuman("0 9 * * 6")).toBe("Sat at 9:00");
  });

  test("unrecognized patterns return raw expression", () => {
    expect(cronToHuman("something weird")).toBe("something weird");
    expect(cronToHuman("0 9 1 * *")).toBe("0 9 1 * *"); // day-of-month not handled
    expect(cronToHuman("0 9 * 1 *")).toBe("0 9 * 1 *"); // specific month not handled
  });

  test("wrong number of parts returns raw", () => {
    expect(cronToHuman("* * *")).toBe("* * *");
    expect(cronToHuman("")).toBe("");
  });
});

describe("CRON_PRESETS", () => {
  test("has expected presets", () => {
    expect(CRON_PRESETS).toHaveLength(6);
    expect(CRON_PRESETS[0]).toEqual({
      label: "every 5 min",
      value: "*/5 * * * *",
    });
    expect(CRON_PRESETS[CRON_PRESETS.length - 1]).toEqual({
      label: "custom...",
      value: "",
    });
  });

  test("all preset values produce human-readable output", () => {
    for (const preset of CRON_PRESETS) {
      if (preset.value === "") continue; // custom has no expression
      const human = cronToHuman(preset.value);
      expect(human).not.toBe(preset.value); // should NOT just return the raw expression
    }
  });
});
