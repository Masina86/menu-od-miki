import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Download,
  Link2,
  Loader2,
  QrCode,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  Restaurant,
  ScanMonthStatistics,
  ScanStatisticsExportScope,
  ScanStatisticsResponse,
  ScanSourceTotals,
} from "../../../shared/types";
import AdminLoginView from "./AdminLoginView";
import { ApiError, apiRequest, downloadRequest, jsonRequest } from "../../lib/apiClient";

function formatMonthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(monthKey + "-01T12:00:00Z"));
}

function formatDayLabel(dayKey: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(dayKey + "T12:00:00Z"));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return "New";
  return (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
}

function sourcePercentage(totals: ScanSourceTotals, value: number): string {
  if (!totals.total) return "0% of visits";
  return Math.round((value / totals.total) * 100) + "% of visits";
}

function statusLabel(status: ScanMonthStatistics["daily_status"]): string {
  if (status === "unavailable") return "Monthly only";
  if (status === "partial") return "Partial daily data";
  return "Daily data";
}

function statusClasses(status: ScanMonthStatistics["daily_status"]): string {
  if (status === "unavailable") {
    return "bg-stone-100 text-stone-500";
  }
  if (status === "partial") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-emerald-100 text-emerald-700";
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ScanStatisticsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [authStatus, setAuthStatus] = useState<
    "checking" | "authenticated" | "unauthenticated"
  >("checking");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [statistics, setStatistics] = useState<ScanStatisticsResponse | null>(
    null,
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [downloading, setDownloading] =
    useState<ScanStatisticsExportScope | null>(null);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        const session = await apiRequest<{ authenticated: boolean }>(
          "/api/auth/session",
        );
        if (!active) return;
        setAuthStatus(
          session.authenticated ? "authenticated" : "unauthenticated",
        );
        setLoading(false);
      } catch (error: unknown) {
        if (!active) return;
        console.error("Could not check admin session:", error);
        setAuthStatus("unauthenticated");
        setLoading(false);
      }
    };

    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!slug || authStatus !== "authenticated") return;

    let active = true;
    const load = async () => {
      setLoading(true);
      setPageError("");
      try {
        const loadedRestaurant = await apiRequest<Restaurant>(
          "/api/restaurant/" + slug,
        );
        const loadedStatistics = await apiRequest<ScanStatisticsResponse>(
          "/api/restaurant/" + loadedRestaurant.id + "/scan-statistics",
        );
        if (!active) return;
        setRestaurant(loadedRestaurant);
        setStatistics(loadedStatistics);
        setSelectedMonthKey(
          loadedStatistics.selected_month?.month_key || null,
        );
        setSelectedDayKey(null);
      } catch (error: unknown) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setAuthStatus("unauthenticated");
          return;
        }
        console.error("Could not load scan statistics:", error);
        setPageError(errorText(error, "Could not load scan statistics."));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [authStatus, slug]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);

    try {
      await jsonRequest<{ authenticated: boolean }>(
        "/api/auth/login",
        "POST",
        { password },
      );
      setPassword("");
      setAuthStatus("authenticated");
    } catch (error: unknown) {
      const message = errorText(error, "Login failed.");
      setLoginError(
        message === "Admin login is not configured."
          ? "Admin login is not configured on this server."
          : message,
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const selectMonth = async (monthKey: string) => {
    if (!restaurant || monthKey === selectedMonthKey) return;

    setLoading(true);
    setPageError("");
    setSelectedDayKey(null);
    try {
      const loadedStatistics = await apiRequest<ScanStatisticsResponse>(
        "/api/restaurant/" +
          restaurant.id +
          "/scan-statistics?month=" +
          encodeURIComponent(monthKey),
      );
      setStatistics(loadedStatistics);
      setSelectedMonthKey(loadedStatistics.selected_month?.month_key || null);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthStatus("unauthenticated");
        return;
      }
      setPageError(errorText(error, "Could not load that month."));
    } finally {
      setLoading(false);
    }
  };

  const downloadStatistics = async (scope: ScanStatisticsExportScope) => {
    if (!restaurant) return;
    const selectedMonth = statistics?.selected_month;
    if (scope !== "all" && !selectedMonth) return;
    if (scope === "day" && !selectedDayKey) return;

    setDownloading(scope);
    setPageError("");
    try {
      const params = new URLSearchParams({ scope, breakdown: "source" });
      if (scope !== "all" && selectedMonth) {
        params.set("month", selectedMonth.month_key);
      }
      if (scope === "day" && selectedDayKey) {
        params.set("day", selectedDayKey);
      }

      const result = await downloadRequest(
        "/api/restaurant/" +
          restaurant.id +
          "/scan-statistics/export?" +
          params.toString(),
      );
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        result.filename || "qr-statistics-" + scope + ".csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthStatus("unauthenticated");
        return;
      }
      setPageError(errorText(error, "Could not download statistics."));
    } finally {
      setDownloading(null);
    }
  };

  const selectedMonth = statistics?.selected_month || null;
  const selectedDay = useMemo(
    () =>
      selectedMonth?.days.find((day) => day.day_key === selectedDayKey) || null,
    [selectedDayKey, selectedMonth],
  );
  const maximumDayCount = Math.max(
    1,
    ...(selectedMonth?.days.map((day) => day.scan_count) || []),
  );
  const overview = statistics?.overview;
  const allTimeSourceTotals = statistics?.all_time_source_totals;

  if (authStatus === "checking" || (loading && !statistics)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-700">
        Loading statistics...
      </div>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <AdminLoginView
        password={password}
        showPassword={showPassword}
        error={loginError}
        isLoggingIn={isLoggingIn}
        onPasswordChange={setPassword}
        onTogglePassword={() => setShowPassword((value) => !value)}
        onSubmit={login}
      />
    );
  }

  if (!restaurant || !statistics || !selectedMonth) {
    return (
      <div className="min-h-screen bg-stone-50 p-6 text-stone-900">
        <div className="mx-auto max-w-3xl space-y-4">
          <Link
            to={"/" + (slug || "") + "/admin"}
            className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900"
          >
            <ArrowLeft size={16} />
            Back to admin
          </Link>
          <div className="rounded-2xl border border-red-200 bg-white p-6 text-red-700">
            {pageError || "Statistics are not available."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-6 text-stone-900 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              to={"/" + restaurant.slug + "/admin"}
              className="mb-4 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900"
            >
              <ArrowLeft size={16} />
              Back to admin
            </Link>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">
              QR analytics
            </p>
            <h1 className="mt-2 text-3xl font-serif md:text-4xl">
              Menu scan statistics
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              {restaurant.name} � Time zone: {statistics.time_zone}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm">
            <BarChart3 size={18} className="text-stone-500" />
            <span>
              All time: <strong>{formatNumber(statistics.all_time_scans)}</strong>
            </span>
          </div>
        </header>

        {pageError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {pageError}
          </div>
        )}

        {overview && allTimeSourceTotals && (
          <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
            <div className="flex flex-col gap-2 border-b border-stone-100 pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">
                  At a glance
                </p>
                <h2 className="mt-1 text-2xl font-serif">What is happening now</h2>
              </div>
              <p className="text-xs text-stone-500">
                QR/direct attribution starts on{" "}
                {formatDayLabel(statistics.daily_tracking_started_on)}.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryCard label="Today" value={formatNumber(overview.today.scan_count)} />
              <SummaryCard label="This week" value={formatNumber(overview.this_week.scan_count)} />
              <SummaryCard
                label="This month"
                value={formatNumber(overview.current_month.scan_count)}
              />
              <SummaryCard
                label="Previous month"
                value={formatNumber(overview.previous_month.scan_count)}
              />
              <SummaryCard
                label="Change vs previous month"
                value={formatPercent(overview.month_change_percent)}
              />
              <SummaryCard
                label="Busiest day"
                value={
                  overview.busiest_day
                    ? formatNumber(overview.busiest_day.scan_count) +
                      " � " +
                      formatDayLabel(overview.busiest_day.day_key)
                    : ""
                }
              />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-stone-900 px-4 py-3 text-white">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/70">
                  <QrCode size={16} />
                  QR visits
                </div>
                <p className="mt-1 text-2xl font-mono">
                  {formatNumber(allTimeSourceTotals.qr)}
                </p>
                <p className="mt-1 text-xs text-white/70">
                  {sourcePercentage(allTimeSourceTotals, allTimeSourceTotals.qr)}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-800/70">
                  <Link2 size={16} />
                  Direct visits
                </div>
                <p className="mt-1 text-2xl font-mono">
                  {formatNumber(allTimeSourceTotals.direct)}
                </p>
                <p className="mt-1 text-xs text-amber-800/70">
                  {sourcePercentage(allTimeSourceTotals, allTimeSourceTotals.direct)}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-700">
                <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
                  Unattributed history
                </p>
                <p className="mt-1 text-2xl font-mono">
                  {formatNumber(allTimeSourceTotals.unattributed)}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Recorded before source tracking
                </p>
              </div>
            </div>
          </section>
        )}
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between px-2">
              <div>
                <h2 className="font-serif text-xl">Months</h2>
                <p className="text-xs text-stone-400">Newest first</p>
              </div>
              <CalendarDays size={20} className="text-stone-400" />
            </div>
            <div className="space-y-2">
              {statistics.months.map((month) => (
                <button
                  key={month.month_key}
                  type="button"
                  onClick={() => void selectMonth(month.month_key)}
                  className={
                    "w-full rounded-2xl border px-3 py-3 text-left transition-colors " +
                    (month.month_key === selectedMonthKey
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-100 bg-stone-50 hover:border-stone-300")
                  }
                  aria-current={
                    month.month_key === selectedMonthKey ? "true" : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {formatMonthLabel(month.month_key)}
                    </span>
                    <span className="font-mono text-sm">
                      {formatNumber(month.scan_count)}
                    </span>
                  </div>
                  <span
                    className={
                      "mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider " +
                      (month.month_key === selectedMonthKey
                        ? "bg-white/15 text-white"
                        : statusClasses(month.daily_status))
                    }
                  >
                    {statusLabel(month.daily_status)}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="space-y-6">
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
              <div className="flex flex-col gap-2 border-b border-stone-100 pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">
                    Selected month
                  </p>
                  <h2 className="mt-1 text-2xl font-serif">
                    {formatMonthLabel(selectedMonth.month_key)}
                  </h2>
                </div>
                <span
                  className={
                    "inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider " +
                    statusClasses(selectedMonth.daily_status)
                  }
                >
                  {statusLabel(selectedMonth.daily_status)}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label="Month total"
                  value={formatNumber(selectedMonth.scan_count)}
                />
                <SummaryCard
                  label="Daily total"
                  value={
                    selectedMonth.daily_status === "unavailable"
                      ? ""
                      : formatNumber(selectedMonth.daily_scan_count)
                  }
                />
                <SummaryCard
                  label="Average / day"
                  value={
                    selectedMonth.daily_status === "unavailable"
                      ? ""
                      : selectedMonth.average_daily_scans.toFixed(2)
                  }
                />
                <SummaryCard
                  label="Active days"
                  value={
                    selectedMonth.daily_status === "unavailable"
                      ? ""
                      : formatNumber(selectedMonth.active_days)
                  }
                />
              </div>

              {selectedMonth.daily_status === "unavailable" && (
                <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                  This month has a monthly total, but daily scan records were
                  not stored yet. No historical daily values were estimated.
                </div>
              )}

              {selectedMonth.daily_status === "partial" && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Daily tracking started on{" "}
                  {formatDayLabel(selectedMonth.daily_tracking_started_on)}.
                  Earlier scans remain included in the month total but cannot
                  be assigned to a day.
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">
                    Daily breakdown
                  </p>
                  <h2 className="mt-1 text-2xl font-serif">
                    Scans per day
                  </h2>
                </div>
                {selectedDay && (
                  <div className="rounded-xl bg-stone-100 px-3 py-2 text-sm">
                    {formatDayLabel(selectedDay.day_key)}:{" "}
                    <strong>{formatNumber(selectedDay.scan_count)}</strong>
                    <span className="ml-2 text-xs text-stone-500">
                      QR {formatNumber(selectedDay.source_totals.qr)} � Direct{" "}
                      {formatNumber(selectedDay.source_totals.direct)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-stone-900" />
                  QR
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Direct
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-stone-300" />
                  Unattributed
                </span>
              </div>

              {selectedMonth.days.length === 0 ? (
                <p className="mt-6 rounded-2xl bg-stone-50 px-4 py-5 text-sm text-stone-500">
                  Daily statistics are not available for this month.
                </p>
              ) : (
                <div className="mt-6 space-y-2">
                  {selectedMonth.days.map((day) => {
                    const isSelected = day.day_key === selectedDayKey;
                    const width =
                      day.scan_count > 0
                        ? Math.max(
                            8,
                            (day.scan_count / maximumDayCount) * 100,
                          )
                        : 0;
                    const qrWidth =
                      day.scan_count > 0
                        ? (day.source_totals.qr / maximumDayCount) * 100
                        : 0;
                    const directWidth =
                      day.scan_count > 0
                        ? (day.source_totals.direct / maximumDayCount) * 100
                        : 0;
                    const unattributedWidth = Math.max(
                      0,
                      width - qrWidth - directWidth,
                    );
                    return (
                      <button
                        key={day.day_key}
                        type="button"
                        onClick={() => setSelectedDayKey(day.day_key)}
                        className={
                          "w-full rounded-2xl border px-3 py-3 text-left transition-colors " +
                          (isSelected
                            ? "border-stone-900 bg-stone-50"
                            : "border-transparent hover:border-stone-200 hover:bg-stone-50")
                        }
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-[8rem]">
                            {formatDayLabel(day.day_key)}
                          </span>
                          <span className="font-mono font-bold">
                            {formatNumber(day.scan_count)}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                          <div
                            className="flex h-full rounded-full transition-all"
                            style={{ width: width + "%" }}
                          >
                            <div
                              className="h-full bg-stone-900"
                              style={{ width: qrWidth + "%" }}
                            />
                            <div
                              className="h-full bg-amber-400"
                              style={{ width: directWidth + "%" }}
                            />
                            <div
                              className="h-full bg-stone-300"
                              style={{ width: unattributedWidth + "%" }}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
              <div className="flex items-center gap-3">
                <Download size={20} className="text-stone-500" />
                <div>
                  <h2 className="text-xl font-serif">Download statistics</h2>
                  <p className="text-sm text-stone-500">
                    CSV files include QR, direct, and historical unattributed totals.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <DownloadButton
                  label="Whole history"
                  description="All available months"
                  loading={downloading === "all"}
                  onClick={() => void downloadStatistics("all")}
                />
                <DownloadButton
                  label="Selected month"
                  description={formatMonthLabel(selectedMonth.month_key)}
                  loading={downloading === "month"}
                  onClick={() => void downloadStatistics("month")}
                />
                <DownloadButton
                  label="Selected day"
                  description={
                    selectedDay
                      ? formatDayLabel(selectedDay.day_key)
                      : "Choose a day first"
                  }
                  loading={downloading === "day"}
                  disabled={!selectedDay}
                  onClick={() => void downloadStatistics("day")}
                />
              </div>
            </section>
          </main>
        </div>

        {loading && (
          <div className="fixed bottom-5 right-5 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
            <Loader2 size={15} className="animate-spin" />
            Loading
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-mono text-stone-900">{value}</p>
    </div>
  );
}

function DownloadButton({
  label,
  description,
  loading,
  disabled = false,
  onClick,
}: {
  label: string;
  description: string;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-stone-900 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-stone-500">{description}</span>
      </span>
      {loading ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <Download size={18} className="text-stone-500" />
      )}
    </button>
  );
}