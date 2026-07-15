import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../server/db/migrations";
import { openDatabase } from "../../server/db/connection";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-qr-import-test-"));
const databasePath = path.join(tempDir, "menu.db");
process.env.NODE_ENV = "production";
process.env.DB_PATH = databasePath;
process.env.ADMIN_PASSWORD = "import-password";
process.env.ADMIN_SESSION_SECRET = "import-session-secret";
process.env.MENU_QR_NO_LISTEN = "1";

let app: Express;
let closeDatabase: (() => void) | undefined;

describe("bulk import and export compatibility", () => {
  beforeAll(async () => {
    const database = openDatabase(databasePath);
    migrateDatabase(database);
    database.close();

    const server = await import("../../server/index");
    app = await server.startServer({ listen: false });
    closeDatabase = server.closeDatabaseForTests;
    await request(app).get("/api/public-menu/import-restaurant");
  });

  afterAll(() => {
    closeDatabase?.();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("imports products, reorders them, and exports TSV", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ password: "import-password" });
    const cookie = login.headers["set-cookie"]?.[0] || "";

    const category = await request(app)
      .post("/api/categories")
      .set("Cookie", cookie)
      .send({ restaurant_id: 1, name: "Imported Products" });
    expect(category.status).toBe(200);

    const imported = await request(app)
      .post("/api/categories/" + category.body.id + "/products/bulk")
      .set("Cookie", cookie)
      .send({
        products: [
          {
            name: "Imported Salad",
            price: 12,
            description: "Fresh",
            additions: [{ name: "Extra cheese", price: 2 }],
          },
          { name: "Imported Soup", price: 8, description: "Warm" },
        ],
      });
    expect(imported.status).toBe(200);

    const menu = await request(app)
      .get("/api/menu/1")
      .set("Cookie", cookie);
    const products = menu.body
      .flatMap((item: { products: unknown[] }) => item.products)
      .filter((item: { name: string }) => item.name.startsWith("Imported"));
    expect(products).toHaveLength(2);

    const reorder = await request(app)
      .put("/api/products/reorder")
      .set("Cookie", cookie)
      .send({ ids: products.map((item: { id: number }) => item.id).reverse() });
    expect(reorder.body).toEqual({ success: true });

    const exported = await request(app)
      .get("/api/categories/" + category.body.id + "/products/export")
      .set("Cookie", cookie);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/tab-separated-values");
    expect(exported.headers["content-disposition"]).toContain(".tsv");
  });
});
