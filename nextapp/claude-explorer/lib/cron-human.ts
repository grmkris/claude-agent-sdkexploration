const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function cronToHuman(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return expression;

  const [min, hour, dom, mon, dow] = parts;

  // every N minutes: */N * * * *
  if (
    min.startsWith("*/") &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `every ${min.slice(2)} min`;
  }

  // every minute: * * * * *
  if (
    min === "*" &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return "every minute";
  }

  // every hour at :MM: MM * * * *
  if (
    /^\d+$/.test(min) &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return min === "0"
      ? "every hour"
      : `every hour at :${min.padStart(2, "0")}`;
  }

  // every N hours: 0 */N * * *
  if (
    min === "0" &&
    hour.startsWith("*/") &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `every ${hour.slice(2)}h`;
  }

  // daily at HH:MM: MM HH * * *
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hour) &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `daily at ${hour}:${min.padStart(2, "0")}`;
  }

  // specific weekday: MM HH * * D
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hour) &&
    dom === "*" &&
    mon === "*" &&
    /^\d$/.test(dow)
  ) {
    const day = WEEKDAYS[Number(dow)] ?? dow;
    return `${day} at ${hour}:${min.padStart(2, "0")}`;
  }

  return expression;
}

export const CRON_PRESETS: readonly { label: string; value: string }[] = [
  { label: "every 5 min", value: "*/5 * * * *" },
  { label: "every 15 min", value: "*/15 * * * *" },
  { label: "every 30 min", value: "*/30 * * * *" },
  { label: "every hour", value: "0 * * * *" },
  { label: "daily at 9am", value: "0 9 * * *" },
  { label: "custom...", value: "" },
];
