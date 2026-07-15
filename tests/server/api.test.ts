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
  });
});
