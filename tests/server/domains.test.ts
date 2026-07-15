import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { sessionCookie, parseCookies } from "../../server/domains/auth/cookies";
import { parseDataUrl, imageVersion } from "../../server/domains/images/dataUrl";
import { buildMenuTree } from "../../server/domains/menu/tree";
import { normalizeReviewInput } from "../../server/domains/reviews/validation";
import { migrateDatabase } from "../../server/db/migrations";
import type { Category, Product } from "../../shared/types";

describe("backend domain utilities", () => {
  it("builds and sorts a nested menu tree", () => {
    const categories: Category[] = [
      { id: 2, restaurant_id: 1, name: "Child", parent_id: 1, sort_order: 2, products: [] },
      { id: 1, restaurant_id: 1, name: "Root", sort_order: 1, products: [] },
    ];
    const products: Product[] = [
      { id: 4, category_id: 2, name: "B", description: "", price: 2, sort_order: 2 },
      { id: 3, category_id: 2, name: "A", description: "", price: 1, sort_order: 1 },
    ];

    const menu = buildMenuTree(categories, products);
    expect(menu).toHaveLength(1);
    expect(menu[0].subcategories?.[0].products.map((item) => item.name)).toEqual(["A", "B"]);
  });

  it("creates the current schema idempotently", () => {
    const db = new Database(":memory:");
    expect(() => migrateDatabase(db)).not.toThrow();
    expect(() => migrateDatabase(db)).not.toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "restaurants" })]),
    );
    db.close();
  });

  it("normalizes review input and rejects invalid ratings", () => {
    expect(normalizeReviewInput("4", { rating: 5, author_name: " Ana ", comment: " Nice " })).toEqual({
      restaurantId: 4,
      authorName: "Ana",
      rating: 5,
      comment: "Nice",
    });
    expect(() => normalizeReviewInput(4, { rating: 6 })).toThrow("at most 5");
  });

  it("parses data URLs and signs image versions deterministically", () => {
    expect(parseDataUrl("data:image/png;base64,QQ==")).toEqual({
      contentType: "image/png",
      isBase64: true,
      data: "QQ==",
    });
    expect(imageVersion("data:image/png;base64,QQ==")).toHaveLength(12);
  });

  it("handles signed cookie values safely", () => {
    const cookie = sessionCookie("session", "a.b", 60, true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(parseCookies("session=a.b; other=value")).toEqual({ session: "a.b", other: "value" });
  });
});
