import Database from "better-sqlite3";
import type {
  ScanDayStatistics,
  ScanMonthStatistics,
  ScanMonthSummary,
  ScanSource,
  ScanSourceTotals,
  ScanStatisticsExportScope,
  ScanStatisticsResponse,
  ScanStatisticsStatus,
} from "../../../shared/types.js";
import { HttpError } from "../../http/errors.js";
import { formatDayKey, formatMonthKey } from "./periods.js";

interface MonthRow {
  month_key: string;
  scan_count: number | bigint;
}

interface DayRow {
  day_key: string;
  scan_count: number | bigint;
}

interface SourceRow {
  day_key: string;
  source: "qr" | "direct";
  scan_count: number | bigint;
}

interface MetadataRow {
  daily_tracking_started_at: string;
}

interface RestaurantRow {
  slug: string;
}

interface ScanStatisticsOptions {
  timeZone: string;
  now?: () => Date;
}

interface StatisticsQuery {
  monthKey?: string;
  dayKey?: string;
  includeSources?: boolean;
}

interface ExportResult {
  content: string;
  filename: string;
}

type ScanSourceInput = Exclude<ScanSource, "unattributed">;

function numericValue(value: number | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  return Number(value || 0);
}

function validateMonthKey(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new HttpError(400, "month must use YYYY-MM format.");
  }
  return value;
}

function validateDayKey(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    throw new HttpError(400, "day must use YYYY-MM-DD format.");
  }

  const date = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new HttpError(400, "day must be a real calendar date.");
  }

  return value;
}

function dateFromDayKey(dayKey: string): Date {
  return new Date(dayKey + "T12:00:00Z");
}

function dayKeyFromUtcDate(date: Date): string {
  return (
    String(date.getUTCFullYear()).padStart(4, "0") +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getUTCDate()).padStart(2, "0")
  );
}

function firstDayOfMonth(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

function lastDayOfMonth(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0, 12));
}

function addCalendarDays(date: Date, amount: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + amount,
      12,
    ),
  );
}

function addCalendarDay(date: Date): Date {
  return addCalendarDays(date, 1);
}

function previousMonthKey(monthKey: string): string {
  return dayKeyFromUtcDate(addCalendarDays(firstDayOfMonth(monthKey), -1)).slice(
    0,
    7,
  );
}

function startOfWeek(dayKey: string): Date {
  const date = dateFromDayKey(dayKey);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return addCalendarDays(date, -mondayOffset);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

function safeFilenamePart(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "restaurant"
  );
}

function sourceTotals(
  total: number,
  qr: number,
  direct: number,
): ScanSourceTotals {
  const safeQr = Math.max(0, qr);
  const safeDirect = Math.max(0, direct);
  return {
    total,
    qr: safeQr,
    direct: safeDirect,
    unattributed: Math.max(0, total - safeQr - safeDirect),
  };
}

export function createScanStatisticsService(
  db: Database.Database,
  options: ScanStatisticsOptions,
) {
  const clock = options.now || (() => new Date());
  const timeZone = options.timeZone;

  const getMetadata = (): { startedOn: string } => {
    const row = db
      .prepare(
        "SELECT daily_tracking_started_at FROM menu_scan_tracking_metadata WHERE id = 1",
      )
      .get() as MetadataRow | undefined;

    if (!row) {
      throw new Error("Daily scan tracking migration has not been applied.");
    }

    const startedAt = new Date(row.daily_tracking_started_at);
    if (!Number.isFinite(startedAt.getTime())) {
      throw new Error("Daily scan tracking metadata is invalid.");
    }

    return { startedOn: formatDayKey(startedAt, timeZone) };
  };

  const getRestaurant = (restaurantId: number): RestaurantRow => {
    const restaurant = db
      .prepare("SELECT slug FROM restaurants WHERE id = ?")
      .get(restaurantId) as RestaurantRow | undefined;

    if (!restaurant) throw new HttpError(404, "Restaurant not found.");
    return restaurant;
  };

  const getDailyStatus = (
    monthKey: string,
    trackingStartedOn: string,
  ): ScanStatisticsStatus => {
    const trackingMonth = trackingStartedOn.slice(0, 7);
    if (monthKey < trackingMonth) return "unavailable";
    if (monthKey === trackingMonth) return "partial";
    return "complete";
  };

  const getMonthRows = (restaurantId: number): MonthRow[] =>
    db
      .prepare(
        "SELECT month_key, scan_count FROM menu_scans " +
          "WHERE restaurant_id = ? ORDER BY month_key DESC",
      )
      .all(restaurantId) as MonthRow[];

  const getSourceRows = (
    restaurantId: number,
    startDay?: string,
    endDay?: string,
  ): SourceRow[] => {
    if (startDay && endDay) {
      return db
        .prepare(
          "SELECT day_key, source, scan_count FROM menu_scan_sources " +
            "WHERE restaurant_id = ? AND day_key >= ? AND day_key <= ?",
        )
        .all(restaurantId, startDay, endDay) as SourceRow[];
    }

    if (startDay) {
      return db
        .prepare(
          "SELECT day_key, source, scan_count FROM menu_scan_sources " +
            "WHERE restaurant_id = ? AND day_key LIKE ?",
        )
        .all(restaurantId, startDay + "-%") as SourceRow[];
    }

    return db
      .prepare(
        "SELECT day_key, source, scan_count FROM menu_scan_sources " +
          "WHERE restaurant_id = ?",
      )
      .all(restaurantId) as SourceRow[];
  };

  const getSourceTotals = (
    restaurantId: number,
    total: number,
    monthKey?: string,
    startDay?: string,
    endDay?: string,
  ): ScanSourceTotals => {
    const rows = monthKey
      ? getSourceRows(restaurantId, monthKey)
      : getSourceRows(restaurantId, startDay, endDay);
    let qr = 0;
    let direct = 0;

    for (const row of rows) {
      if (row.source === "qr") qr += numericValue(row.scan_count);
      if (row.source === "direct") direct += numericValue(row.scan_count);
    }

    return sourceTotals(total, qr, direct);
  };

  const getDaySourceCounts = (
    restaurantId: number,
    startDay: string,
    endDay: string,
  ): Map<string, { qr: number; direct: number }> => {
    const counts = new Map<string, { qr: number; direct: number }>();
    for (const row of getSourceRows(restaurantId, startDay, endDay)) {
      const current = counts.get(row.day_key) || { qr: 0, direct: 0 };
      if (row.source === "qr") current.qr += numericValue(row.scan_count);
      if (row.source === "direct") current.direct += numericValue(row.scan_count);
      counts.set(row.day_key, current);
    }
    return counts;
  };

  const getDayCounts = (
    restaurantId: number,
    startDay: string,
    endDay: string,
  ): Map<string, number> => {
    const rows = db
      .prepare(
        "SELECT day_key, scan_count FROM menu_scan_days " +
          "WHERE restaurant_id = ? AND day_key >= ? AND day_key <= ?",
      )
      .all(restaurantId, startDay, endDay) as DayRow[];
    return new Map(
      rows.map((row) => [row.day_key, numericValue(row.scan_count)]),
    );
  };

  const getRangeTotals = (
    restaurantId: number,
    startDay: string,
    endDay: string,
  ) => {
    const dayCounts = getDayCounts(restaurantId, startDay, endDay);
    const total = Array.from(dayCounts.values()).reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      scan_count: total,
      source_totals: getSourceTotals(
        restaurantId,
        total,
        undefined,
        startDay,
        endDay,
      ),
    };
  };

  const getMonthDetails = (
    restaurantId: number,
    summary: ScanMonthSummary,
    metadata: { startedOn: string },
    currentDay: string,
  ): ScanMonthStatistics => {
    const status = summary.daily_status;
    if (status === "unavailable") {
      return {
        ...summary,
        daily_tracking_started_on: metadata.startedOn,
        daily_scan_count: 0,
        tracked_days: 0,
        active_days: 0,
        average_daily_scans: 0,
        days: [],
      };
    }

    const firstDay = firstDayOfMonth(summary.month_key);
    const lastDay = lastDayOfMonth(summary.month_key);
    const trackingStartDay = dateFromDayKey(metadata.startedOn);
    const currentDayDate = dateFromDayKey(currentDay);

    let rangeStart = firstDay;
    let rangeEnd = lastDay;

    if (status === "partial" && trackingStartDay > rangeStart) {
      rangeStart = trackingStartDay;
    }
    if (
      summary.month_key === currentDay.slice(0, 7) &&
      currentDayDate < rangeEnd
    ) {
      rangeEnd = currentDayDate;
    }

    if (rangeStart > rangeEnd) {
      return {
        ...summary,
        daily_tracking_started_on: metadata.startedOn,
        daily_scan_count: 0,
        tracked_days: 0,
        active_days: 0,
        average_daily_scans: 0,
        days: [],
      };
    }

    const rangeStartKey = dayKeyFromUtcDate(rangeStart);
    const rangeEndKey = dayKeyFromUtcDate(rangeEnd);
    const dayCounts = getDayCounts(restaurantId, rangeStartKey, rangeEndKey);
    const sourceCounts = getDaySourceCounts(
      restaurantId,
      rangeStartKey,
      rangeEndKey,
    );
    const days: ScanDayStatistics[] = [];

    for (
      let cursor = rangeStart;
      cursor <= rangeEnd;
      cursor = addCalendarDay(cursor)
    ) {
      const dayKey = dayKeyFromUtcDate(cursor);
      const scanCount = dayCounts.get(dayKey) || 0;
      const counts = sourceCounts.get(dayKey) || { qr: 0, direct: 0 };
      days.push({
        day_key: dayKey,
        scan_count: scanCount,
        source_totals: sourceTotals(scanCount, counts.qr, counts.direct),
      });
    }

    const dailyScanCount = days.reduce((total, day) => total + day.scan_count, 0);
    const activeDays = days.filter((day) => day.scan_count > 0).length;

    return {
      ...summary,
      daily_tracking_started_on: metadata.startedOn,
      daily_scan_count: dailyScanCount,
      tracked_days: days.length,
      active_days: activeDays,
      average_daily_scans: days.length ? dailyScanCount / days.length : 0,
      days,
    };
  };

  const getStatistics = (
    restaurantId: number,
    query: StatisticsQuery = {},
  ): ScanStatisticsResponse => {
    getRestaurant(restaurantId);
    const metadata = getMetadata();
    const currentDate = clock();
    const currentMonth = formatMonthKey(currentDate, timeZone);
    const currentDay = formatDayKey(currentDate, timeZone);
    const rows = getMonthRows(restaurantId);
    const monthlyCounts = new Map(
      rows.map((row) => [row.month_key, numericValue(row.scan_count)]),
    );

    if (!monthlyCounts.has(currentMonth)) {
      monthlyCounts.set(currentMonth, 0);
    }

    const months = Array.from(monthlyCounts.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([monthKey, scanCount]) => ({
        month_key: monthKey,
        scan_count: scanCount,
        daily_status: getDailyStatus(monthKey, metadata.startedOn),
        source_totals: getSourceTotals(restaurantId, scanCount, monthKey),
      }));

    const requestedMonth =
      query.monthKey !== undefined
        ? validateMonthKey(query.monthKey)
        : months[0]?.month_key || currentMonth;
    const selectedSummary = months.find(
      (month) => month.month_key === requestedMonth,
    );

    if (!selectedSummary) {
      throw new HttpError(404, "Month statistics not found.");
    }

    const selectedMonth = getMonthDetails(
      restaurantId,
      selectedSummary,
      metadata,
      currentDay,
    );

    let selectedDay: ScanDayStatistics | null = null;
    if (query.dayKey !== undefined) {
      const requestedDay = validateDayKey(query.dayKey);
      if (requestedDay.slice(0, 7) !== requestedMonth) {
        throw new HttpError(400, "day must belong to the selected month.");
      }
      selectedDay =
        selectedMonth.days.find((day) => day.day_key === requestedDay) || null;
      if (!selectedDay) {
        throw new HttpError(
          409,
          "Daily statistics are not available for that day.",
        );
      }
    }

    const allTimeScans = rows.reduce(
      (total, row) => total + numericValue(row.scan_count),
      0,
    );
    const allTimeSourceTotals = getSourceTotals(
      restaurantId,
      allTimeScans,
    );
    const weekStart = startOfWeek(currentDay);
    const weekEnd = addCalendarDays(weekStart, 6);
    const weekStartKey = dayKeyFromUtcDate(weekStart);
    const weekEndKey = dayKeyFromUtcDate(weekEnd);
    const today = getRangeTotals(restaurantId, currentDay, currentDay);
    const thisWeek = getRangeTotals(restaurantId, weekStartKey, weekEndKey);
    const previousMonth = previousMonthKey(currentMonth);
    const currentMonthCount = monthlyCounts.get(currentMonth) || 0;
    const previousMonthCount = monthlyCounts.get(previousMonth) || 0;
    const currentMonthTotals = sourceTotals(
      currentMonthCount,
      months.find((month) => month.month_key === currentMonth)?.source_totals.qr || 0,
      months.find((month) => month.month_key === currentMonth)?.source_totals.direct || 0,
    );
    const previousMonthTotals = sourceTotals(
      previousMonthCount,
      months.find((month) => month.month_key === previousMonth)?.source_totals.qr || 0,
      months.find((month) => month.month_key === previousMonth)?.source_totals.direct || 0,
    );
    const currentMonthDetails = getMonthDetails(
      restaurantId,
      {
        month_key: currentMonth,
        scan_count: currentMonthCount,
        daily_status: getDailyStatus(currentMonth, metadata.startedOn),
        source_totals: currentMonthTotals,
      },
      metadata,
      currentDay,
    );
    const busiestDay =
      currentMonthDetails.days.reduce<ScanDayStatistics | null>(
        (best, day) => (!best || day.scan_count > best.scan_count ? day : best),
        null,
      );

    return {
      restaurant_id: restaurantId,
      time_zone: timeZone,
      all_time_scans: allTimeScans,
      all_time_source_totals: allTimeSourceTotals,
      daily_tracking_started_on: metadata.startedOn,
      overview: {
        today,
        this_week: {
          ...thisWeek,
          start_day_key: weekStartKey,
          end_day_key: weekEndKey,
        },
        current_month: {
          scan_count: currentMonthCount,
          source_totals: currentMonthTotals,
          month_key: currentMonth,
        },
        previous_month: {
          scan_count: previousMonthCount,
          source_totals: previousMonthTotals,
          month_key: previousMonth,
        },
        month_change_percent:
          previousMonthCount === 0
            ? null
            : ((currentMonthCount - previousMonthCount) / previousMonthCount) *
              100,
        busiest_day:
          busiestDay && busiestDay.scan_count > 0 ? busiestDay : null,
      },
      months,
      selected_month: selectedMonth,
      selected_day: selectedDay,
    };
  };

  const recordMenuScan = (
    restaurantId: number,
    date = clock(),
    source: ScanSourceInput = "direct",
  ): void => {
    const monthKey = formatMonthKey(date, timeZone);
    const dayKey = formatDayKey(date, timeZone);
    const transaction = db.transaction(
      (id: number, month: string, day: string, attribution: ScanSourceInput) => {
        db.prepare(
          "INSERT INTO menu_scans (restaurant_id, month_key, scan_count) " +
            "VALUES (?, ?, 1) " +
            "ON CONFLICT(restaurant_id, month_key) " +
            "DO UPDATE SET scan_count = scan_count + 1",
        ).run(id, month);

        db.prepare(
          "INSERT INTO menu_scan_days (restaurant_id, day_key, scan_count) " +
            "VALUES (?, ?, 1) " +
            "ON CONFLICT(restaurant_id, day_key) " +
            "DO UPDATE SET scan_count = scan_count + 1",
        ).run(id, day);

        db.prepare(
          "INSERT INTO menu_scan_sources " +
            "(restaurant_id, day_key, source, scan_count) VALUES (?, ?, ?, 1) " +
            "ON CONFLICT(restaurant_id, day_key, source) " +
            "DO UPDATE SET scan_count = scan_count + 1",
        ).run(id, day, attribution);
      },
    );

    transaction(restaurantId, monthKey, dayKey, source);
  };

  const exportStatistics = (
    restaurantId: number,
    scope: ScanStatisticsExportScope,
    query: StatisticsQuery = {},
  ): ExportResult => {
    const restaurant = getRestaurant(restaurantId);
    if (scope !== "all" && scope !== "month" && scope !== "day") {
      throw new HttpError(400, "scope must be all, month, or day.");
    }

    const includeSources = query.includeSources === true;
    const header = [
      "record_type",
      "month_key",
      "day_key",
      "scan_count",
      "daily_scan_count",
      "tracked_days",
      "active_days",
      "average_daily_scans",
      "daily_status",
    ];
    if (includeSources) {
      header.push(
        "qr_scan_count",
        "direct_scan_count",
        "unattributed_scan_count",
      );
    }

    const lines = [csvRow(header)];
    const sourceCells = (totals: ScanSourceTotals): unknown[] =>
      includeSources
        ? [totals.qr, totals.direct, totals.unattributed]
        : [];

    const addMonth = (month: ScanMonthStatistics) => {
      lines.push(
        csvRow([
          "month",
          month.month_key,
          "",
          month.scan_count,
          month.daily_scan_count,
          month.tracked_days,
          month.active_days,
          month.average_daily_scans.toFixed(2),
          month.daily_status,
          ...sourceCells(month.source_totals),
        ]),
      );
      for (const day of month.days) {
        lines.push(
          csvRow([
            "day",
            month.month_key,
            day.day_key,
            day.scan_count,
            "",
            "",
            "",
            "",
            month.daily_status,
            ...sourceCells(day.source_totals),
          ]),
        );
      }
    };

    let suffix = "-all";
    if (scope === "all") {
      const all = getStatistics(restaurantId);
      for (const summary of all.months) {
        const month = getStatistics(restaurantId, {
          monthKey: summary.month_key,
        }).selected_month;
        if (month) addMonth(month);
      }
    } else {
      if (!query.monthKey) {
        throw new HttpError(400, "month is required for this export.");
      }

      const selected = getStatistics(restaurantId, {
        monthKey: query.monthKey,
        dayKey: scope === "day" ? query.dayKey : undefined,
      });

      if (!selected.selected_month) {
        throw new HttpError(404, "Month statistics not found.");
      }

      if (scope === "day") {
        if (!query.dayKey || !selected.selected_day) {
          throw new HttpError(400, "day is required for a day export.");
        }
        lines.push(
          csvRow([
            "day",
            selected.selected_month.month_key,
            selected.selected_day.day_key,
            selected.selected_day.scan_count,
            "",
            "",
            "",
            "",
            selected.selected_month.daily_status,
            ...sourceCells(selected.selected_day.source_totals),
          ]),
        );
        suffix = "-" + selected.selected_day.day_key;
      } else {
        addMonth(selected.selected_month);
        suffix = "-" + selected.selected_month.month_key;
      }
    }

    return {
      content: "\uFEFF" + lines.join("\r\n") + "\r\n",
      filename:
        "qr-statistics-" +
        safeFilenamePart(restaurant.slug) +
        suffix +
        ".csv",
    };
  };

  return {
    recordMenuScan,
    getStatistics,
    exportStatistics,
  };
}