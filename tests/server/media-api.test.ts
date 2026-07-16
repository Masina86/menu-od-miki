import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../server/db/migrations";
import { openDatabase } from "../../server/db/connection";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-media-api-"));
const databasePath = path.join(tempDir, "menu.db");
process.env.NODE_ENV = "production";
process.env.DB_PATH = databasePath;
process.env.MEDIA_DIR = path.join(tempDir, "media");
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_SESSION_SECRET = "test-session-secret";
process.env.MENU_QR_NO_LISTEN = "1";

let app: Express;
let closeDatabase: (() => void) | undefined;
let categoryId = 0;
let cookie = "";

describe("media API", () => {
  beforeAll(async () => {
    const database = openDatabase(databasePath);
    migrateDatabase(database);
    const restaurantId = Number(
      database
        .prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)")
        .run("Media", "media").lastInsertRowid,
    );
    categoryId = Number(
      database
        .prepare("INSERT INTO categories (restaurant_id, name) VALUES (?, ?)")
        .run(restaurantId, "Food").lastInsertRowid,
    );
    database.close();
    const server = await import("../../server/index");
    app = await server.startServer({ listen: false });
    closeDatabase = server.closeDatabaseForTests;
    const login = await request(app)
      .post("/api/auth/login")
      .send({ password: "test-password" });
    cookie = login.headers["set-cookie"]?.[0] || "";
  });

  afterAll(() => {
    closeDatabase?.();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("protects uploads and serves immutable responsive media", async () => {
    const image = await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#14532d" },
    })
      .jpeg()
      .toBuffer();
    expect(
      (await request(app).put(`/api/images/categories/${categoryId}`).set("Content-Type", "image/jpeg").send(image))
        .status,
    ).toBe(401);

    const uploaded = await request(app)
      .put(`/api/images/categories/${categoryId}`)
      .set("Cookie", cookie)
      .set("Content-Type", "image/jpeg")
      .send(image);
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.image_url).toMatch(
      new RegExp(`^/api/images/categories/${categoryId}\\?v=`),
    );

    const delivered = await request(app).get(`${uploaded.body.image_url}&w=320`);
    expect(delivered.status).toBe(200);
    expect(delivered.headers["content-type"]).toMatch(/^image\/webp/);
    expect(delivered.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );

    const menu = await request(app)
      .get("/api/menu/1")
      .set("Cookie", cookie);
    expect(JSON.stringify(menu.body)).not.toContain("data:image/");
    expect(Buffer.byteLength(JSON.stringify(menu.body))).toBeLessThan(100_000);
  });
});
