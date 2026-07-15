import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../server/db/migrations";
import { openDatabase } from "../../server/db/connection";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-qr-crud-test-"));
const databasePath = path.join(tempDir, "menu.db");
process.env.NODE_ENV = "production";
process.env.DB_PATH = databasePath;
process.env.ADMIN_PASSWORD = "crud-password";
process.env.ADMIN_SESSION_SECRET = "crud-session-secret";
process.env.MENU_QR_NO_LISTEN = "1";

let app: Express;
let closeDatabase: (() => void) | undefined;
let cookie = "";
let categoryId = 0;
let productId = 0;

describe("menu CRUD compatibility", () => {
  beforeAll(async () => {
    const database = openDatabase(databasePath);
    migrateDatabase(database);
    database.close();

    const server = await import("../../server/index");
    app = await server.startServer({ listen: false });
    closeDatabase = server.closeDatabaseForTests;

    await request(app).get("/api/public-menu/crud-restaurant");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ password: "crud-password" });
    cookie = login.headers["set-cookie"]?.[0] || "";
  });

  afterAll(() => {
    closeDatabase?.();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a category and product and serves them through the shared menu builder", async () => {
    const category = await request(app)
      .post("/api/categories")
      .set("Cookie", cookie)
      .send({ restaurant_id: 1, name: "Test Category" });
    expect(category.status).toBe(200);
    categoryId = category.body.id;

    const product = await request(app)
      .post("/api/products")
      .set("Cookie", cookie)
      .send({ category_id: categoryId, name: "Test Product", price: 10, description: "Description" });
    expect(product.status).toBe(200);
    productId = product.body.id;

    const menu = await request(app).get("/api/menu/1").set("Cookie", cookie);
    expect(menu.status).toBe(200);
    expect(JSON.stringify(menu.body)).toContain("Test Product");
  });

  it("supports product availability updates and deletion", async () => {
    const availability = await request(app)
      .patch(`/api/products/${productId}/availability`)
      .set("Cookie", cookie)
      .send({ is_available: 0 });
    expect(availability.status).toBe(200);

    const deleted = await request(app)
      .delete(`/api/products/${productId}`)
      .set("Cookie", cookie);
    expect(deleted.status).toBe(200);
  });
});
