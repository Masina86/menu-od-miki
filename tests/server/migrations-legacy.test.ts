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
        expect.objectContaining({ name: "search_enabled" }),
      ]),
    );
    expect(Number((db.pragma("user_version") as Array<{ user_version: number }>)[0].user_version)).toBe(4);
    db.close();
  });

  it("handles an existing canonical slug without losing legacy menu data", () => {
    const db = new Database(":memory:");
    migrateDatabase(db);

    db.prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)").run(
      "Current",
      "dismak-oil",
    );
    db.prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)").run(
      "Legacy",
      "Dismak-Oil",
    );
    db.prepare(
      "INSERT INTO categories (restaurant_id, name) VALUES (?, ?)",
    ).run(1, "Current category");
    db.prepare(
      "INSERT INTO categories (restaurant_id, name) VALUES (?, ?)",
    ).run(2, "Legacy category");
    db.prepare(
      "INSERT INTO menu_scans (restaurant_id, month_key, scan_count) VALUES (?, ?, ?)",
    ).run(2, "2026-07", 11);

    expect(() => migrateDatabase(db)).not.toThrow();

    expect(
      db
        .prepare("SELECT id, slug FROM restaurants ORDER BY id")
        .all(),
    ).toEqual([
      { id: 1, slug: "dismak-oil" },
      { id: 2, slug: "dismak-oil-legacy-2" },
    ]);
    expect(
      db
        .prepare("SELECT restaurant_id, name FROM categories ORDER BY id")
        .all(),
    ).toEqual([
      { restaurant_id: 1, name: "Current category" },
      { restaurant_id: 2, name: "Legacy category" },
    ]);
    expect(
      db
        .prepare(
          "SELECT restaurant_id, month_key, scan_count FROM menu_scans",
        )
        .all(),
    ).toEqual([{ restaurant_id: 2, month_key: "2026-07", scan_count: 11 }]);

    migrateDatabase(db);
    expect(
      db.prepare("SELECT id, slug FROM restaurants ORDER BY id").all(),
    ).toEqual([
      { id: 1, slug: "dismak-oil" },
      { id: 2, slug: "dismak-oil-legacy-2" },
    ]);
    db.close();
  });
});
