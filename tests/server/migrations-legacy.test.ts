import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateDatabase } from "../../server/db/migrations";

describe("legacy database migrations", () => {
  it("upgrades the original four-table schema without replacing data", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE restaurants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL);
      CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, restaurant_id INTEGER NOT NULL, parent_id INTEGER, name TEXT NOT NULL, image_url TEXT, sort_order INTEGER DEFAULT 0);
      CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, name TEXT NOT NULL, price REAL NOT NULL, description TEXT, image_url TEXT, sort_order INTEGER DEFAULT 0);
      CREATE TABLE additions (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, name TEXT NOT NULL, price REAL NOT NULL);
      INSERT INTO restaurants (name, slug) VALUES ('Legacy', 'legacy');
    `);

    migrateDatabase(db);

    expect(db.prepare("SELECT name FROM restaurants").get()).toEqual({ name: "Legacy" });
    expect(db.prepare("PRAGMA table_info(restaurants)").all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "footer_link" }),
        expect.objectContaining({ name: "reviews_enabled" }),
      ]),
    );
    expect(Number((db.pragma("user_version") as Array<{ user_version: number }>)[0].user_version)).toBe(3);
    db.close();
  });
});
