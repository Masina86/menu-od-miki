import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../server/db/migrations";
import { openDatabase } from "../../server/db/connection";
import { createScanStatisticsService } from "../../server/domains/popularity/scanStats";
import { formatDayKey, formatMonthKey } from "../../server/domains/popularity/periods";

describe("scan statistics storage and service", () => {
  it("creates idempotent daily tracking tables without changing monthly data", () => {
    const db = new Database(":memory:");
    migrateDatabase(db);
    db.prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)").run(
      "Legacy",
      "legacy-stats",
    );
    db.prepare(
      "INSERT INTO menu_scans (restaurant_id, month_key, scan_count) VALUES (?, ?, ?)",
    ).run(1, "2024-01", 9);

    const metadataBefore = db
      .prepare(
        "SELECT daily_tracking_started_at FROM menu_scan_tracking_metadata WHERE id = 1",
      )
      .get() as { daily_tracking_started_at: string };
    migrateDatabase(db);
    const metadataAfter = db
      .prepare(
        "SELECT daily_tracking_started_at FROM menu_scan_tracking_metadata WHERE id = 1",
      )
      .get() as { daily_tracking_started_at: string };

    expect(metadataAfter).toEqual(metadataBefore);
    expect(
      db
        .prepare(
          "SELECT scan_count FROM menu_scans WHERE restaurant_id = 1 AND month_key = ?",
        )
        .get("2024-01"),
    ).toEqual({ scan_count: 9 });
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'menu_scan_days'",
        )
        .get(),
    ).toEqual({ name: "menu_scan_days" });
    expect(Number((db.pragma("user_version") as Array<{ user_version: number }>)[0].user_version)).toBe(4);
    db.close();
  });

  it("records monthly and daily counts using the configured timezone", () => {
    const db = new Database(":memory:");
    migrateDatabase(db);
    db.prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)").run(
      "Stats",
      "stats",
    );
    db.prepare(
      "UPDATE menu_scan_tracking_metadata SET daily_tracking_started_at = ? WHERE id = 1",
    ).run("2024-01-01T00:00:00.000Z");

    const service = createScanStatisticsService(db, {
      timeZone: "Europe/Skopje",
      now: () => new Date("2024-02-15T12:00:00.000Z"),
    });
    const boundary = new Date("2024-01-31T23:30:00.000Z");
    service.recordMenuScan(1, boundary, "qr");
    service.recordMenuScan(1, boundary, "direct");
    service.recordMenuScan(1, new Date("2024-02-01T12:00:00.000Z"), "direct");

    expect(
      db
        .prepare(
          "SELECT month_key, scan_count FROM menu_scans WHERE restaurant_id = 1 ORDER BY month_key",
        )
        .all(),
    ).toEqual([
      { month_key: "2024-02", scan_count: 3 },
    ]);
    expect(
      db
        .prepare(
          "SELECT day_key, scan_count FROM menu_scan_days WHERE restaurant_id = 1 ORDER BY day_key",
        )
        .all(),
    ).toEqual([{ day_key: "2024-02-01", scan_count: 3 }]);

    const stats = service.getStatistics(1, { monthKey: "2024-02" });
    expect(stats.selected_month?.daily_status).toBe("complete");
    expect(stats.selected_month?.daily_scan_count).toBe(3);
    expect(stats.selected_month?.active_days).toBe(1);
    expect(stats.selected_month?.days.find((day) => day.day_key === "2024-02-01")).toEqual({
      day_key: "2024-02-01",
      scan_count: 3,
      source_totals: {
        total: 3,
        qr: 1,
        direct: 2,
        unattributed: 0,
      },
    });
    expect(stats.overview.current_month.source_totals).toEqual({
      total: 3,
      qr: 1,
      direct: 2,
      unattributed: 0,
    });
    expect(stats.overview.busiest_day?.day_key).toBe("2024-02-01");
    db.close();
  });

  it("does not invent daily values for legacy months", () => {
    const db = new Database(":memory:");
    migrateDatabase(db);
    db.prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)").run(
      "Legacy",
      "legacy",
    );
    db.prepare(
      "INSERT INTO menu_scans (restaurant_id, month_key, scan_count) VALUES (?, ?, ?)",
    ).run(1, "2020-01", 12);

    const service = createScanStatisticsService(db, {
      timeZone: "Europe/Skopje",
      now: () => new Date("2024-02-15T12:00:00.000Z"),
    });
    const stats = service.getStatistics(1, { monthKey: "2020-01" });

    expect(stats.selected_month?.daily_status).toBe("unavailable");
    expect(stats.selected_month?.days).toEqual([]);
    expect(stats.selected_month?.scan_count).toBe(12);
    db.close();
  });
});

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-qr-scan-stats-"));
const databasePath = path.join(tempDir, "menu.db");
process.env.NODE_ENV = "production";
process.env.DB_PATH = databasePath;
process.env.ADMIN_PASSWORD = "stats-password";
process.env.ADMIN_SESSION_SECRET = "stats-session-secret";
process.env.MENU_QR_NO_LISTEN = "1";

let app: Express;
let closeDatabase: (() => void) | undefined;
let restaurantId = 0;

describe("scan statistics API", () => {
  beforeAll(async () => {
    const database = openDatabase(databasePath);
    migrateDatabase(database);
    const restaurantInsert = database
      .prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)")
      .run("Stats API", "stats-api");
    restaurantId = Number(restaurantInsert.lastInsertRowid);
    database.exec("DELETE FROM menu_scans; DELETE FROM menu_scan_days;");
    database
      .prepare(
        "INSERT INTO menu_scans (restaurant_id, month_key, scan_count) VALUES (?, ?, ?)",
      )
      .run(restaurantId, "2020-01", 12);
    database.close();

    const server = await import("../../server/index");
    app = await server.startServer({ listen: false });
    closeDatabase = server.closeDatabaseForTests;

    await request(app).get("/api/public-menu/stats-api");
    await request(app).get("/api/public-menu/stats-api?source=qr");
  });

  afterAll(() => {
    closeDatabase?.();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("protects statistics and exports behind admin authentication", async () => {
    const denied = await request(app).get(
      "/api/restaurant/" + restaurantId + "/scan-statistics",
    );
    expect(denied.status).toBe(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ password: "stats-password" });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"]?.[0] || "";

    const response = await request(app)
      .get("/api/restaurant/" + restaurantId + "/scan-statistics")
      .set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.all_time_scans).toBe(14);
    expect(response.body.selected_month.daily_status).toBe("partial");
    expect(response.body.selected_month.days.length).toBeGreaterThan(0);
    expect(response.body.all_time_source_totals).toEqual({
      total: 14,
      qr: 1,
      direct: 1,
      unattributed: 12,
    });
    expect(response.body.overview.current_month.source_totals).toEqual({
      total: 2,
      qr: 1,
      direct: 1,
      unattributed: 0,
    });

    const legacy = await request(app)
      .get("/api/restaurant/" + restaurantId + "/scan-statistics?month=2020-01")
      .set("Cookie", cookie);
    expect(legacy.status).toBe(200);
    expect(legacy.body.selected_month.daily_status).toBe("unavailable");
    expect(legacy.body.selected_month.days).toEqual([]);

    const allExport = await request(app)
      .get("/api/restaurant/" + restaurantId + "/scan-statistics/export?scope=all")
      .set("Cookie", cookie);
    expect(allExport.status).toBe(200);
    expect(allExport.headers["content-type"]).toContain("text/csv");
    expect(allExport.headers["content-disposition"]).toContain(
      "qr-statistics-stats-api-all.csv",
    );
    expect(allExport.text).toContain("record_type,month_key,day_key");

    const sourceExport = await request(app)
      .get(
        "/api/restaurant/" +
          restaurantId +
          "/scan-statistics/export?scope=month&month=" +
          formatMonthKey(new Date(), "Europe/Skopje") +
          "&breakdown=source",
      )
      .set("Cookie", cookie);
    expect(sourceExport.status).toBe(200);
    expect(sourceExport.text).toContain(
      "qr_scan_count,direct_scan_count,unattributed_scan_count",
    );

    const monthExport = await request(app)
      .get(
        "/api/restaurant/" + restaurantId + "/scan-statistics/export?scope=month&month=" +
          formatMonthKey(new Date(), "Europe/Skopje"),
      )
      .set("Cookie", cookie);
    expect(monthExport.status).toBe(200);
    expect(monthExport.text).toContain("record_type,month_key,day_key");

    const dayExport = await request(app)
      .get(
        "/api/restaurant/" + restaurantId + "/scan-statistics/export?scope=day&month=" +
          formatMonthKey(new Date(), "Europe/Skopje") +
          "&day=" +
          formatDayKey(new Date(), "Europe/Skopje"),
      )
      .set("Cookie", cookie);
    expect(dayExport.status).toBe(200);
    expect(dayExport.text).toContain("day,");

    const invalid = await request(app)
      .get("/api/restaurant/" + restaurantId + "/scan-statistics/export?scope=bad")
      .set("Cookie", cookie);
    expect(invalid.status).toBe(400);

    const invalidBreakdown = await request(app)
      .get(
        "/api/restaurant/" +
          restaurantId +
          "/scan-statistics/export?scope=all&breakdown=bad",
      )
      .set("Cookie", cookie);
    expect(invalidBreakdown.status).toBe(400);
  });
});