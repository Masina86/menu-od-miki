export interface PopularityPeriodOptions {
  timeZone: string;
  cutoffHour: number;
}

function localDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value || 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
  };
}

export function formatDayKey(date: Date, timeZone: string): string {
  const local = localDateTimeParts(date, timeZone);
  return (
    String(local.year) +
    "-" +
    String(local.month).padStart(2, "0") +
    "-" +
    String(local.day).padStart(2, "0")
  );
}

export function formatMonthKey(date: Date, timeZone: string): string {
  const local = localDateTimeParts(date, timeZone);
  return String(local.year) + "-" + String(local.month).padStart(2, "0");
}

export function formatPeriodKey(date: Date, timeZone: string): string {
  return formatDayKey(date, timeZone);
}

export function getCurrentPeriodKey(
  date: Date,
  options: PopularityPeriodOptions,
): string {
  const local = localDateTimeParts(date, options.timeZone);
  if (local.hour >= options.cutoffHour) {
    return formatPeriodKey(date, options.timeZone);
  }
  return formatPeriodKey(
    new Date(date.getTime() - 24 * 60 * 60 * 1000),
    options.timeZone,
  );
}

export function getPreviousPeriodKey(
  periodKey: string,
  timeZone: string,
): string {
  const periodNoon = new Date(periodKey + "T12:00:00Z");
  return formatPeriodKey(
    new Date(periodNoon.getTime() - 24 * 60 * 60 * 1000),
    timeZone,
  );
}
