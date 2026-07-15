import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../server/db/migrations";
import { openDatabase } from "../../server/db/connection";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-qr-test-"));
const databasePath = path.join(tempDir, "menu.db");
process.env.NODE_ENV = "production";
process.env.DB_PATH = databasePath;
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_SESSION_SECRET = "test-session-secret";
process.env.MENU_QR_NO_LISTEN = '1';

let app: Express;
let closeDatabase: (() => void) | undefined;

describe("HTTP API compatibility", () => {
  beforeAll(async () => {
    const database = openDatabase(databasePath);
    migrateDatabase(database);
    database.close();

    const server = await import("../../server/index");
    app = await server.startServer({ listen: false });
    closeDatabase = server.closeDatabaseForTests;
  });

  afterAll(() => {
    closeDatabase?.();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("keeps public menu access unauthenticated", async () => {
    const response = await request(app).get("/api/public-menu/test-restaurant");
    expect(response.status).toBe(200);
    expect(response.body.menu).toEqual([]);
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    const etag = response.headers.etag;
    expect(etag).toMatch(/^".+"$/);

    const notModified = await request(app)
      .get("/api/public-menu/test-restaurant")
      .set("If-None-Match", etag);
    expect(notModified.status).toBe(304);

    const health = await request(app).get("/healthz");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok", database: "ok" });
  });

  it("protects admin mutations and supports session login", async () => {
    const denied = await request(app)
      .put("/api/restaurant/1")
      .send({ name: "Blocked" });
    expect(denied.status).toBe(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ password: "test-password" });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"]?.[0];
    expect(cookie).toContain("HttpOnly");

    const session = await request(app)
      .get("/api/auth/session")
      .set("Cookie", cookie);
    expect(session.body.authenticated).toBe(true);
    const menuBeforeSetting = await request(app).get("/api/public-menu/test-restaurant");
    const restaurantId = menuBeforeSetting.body.restaurant.id as number;
    const disabledSearch = await request(app)
      .put(`/api/restaurant/${restaurantId}/search-enabled`)
      .set("Cookie", cookie)
      .send({ enabled: false });
    expect(disabledSearch.status).toBe(200);
    expect(disabledSearch.body).toEqual({ success: true, enabled: false });

    const disabledMenu = await request(app).get("/api/public-menu/test-restaurant");
    expect(disabledMenu.body.restaurant.search_enabled).toBe(0);

    const enabledSearch = await request(app)
      .put(`/api/restaurant/${restaurantId}/search-enabled`)
      .set("Cookie", cookie)
      .send({ enabled: true });
    expect(enabledSearch.status).toBe(200);
    expect(enabledSearch.body).toEqual({ success: true, enabled: true });
  });
});
