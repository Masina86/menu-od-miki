import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../server/db/migrations";
import { openDatabase } from "../../server/db/connection";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-qr-reviews-test-"));
const databasePath = path.join(tempDir, "menu.db");
process.env.NODE_ENV = "production";
process.env.DB_PATH = databasePath;
process.env.ADMIN_PASSWORD = "reviews-password";
process.env.ADMIN_SESSION_SECRET = "reviews-session-secret";
process.env.MENU_QR_NO_LISTEN = "1";

let app: Express;
let closeDatabase: (() => void) | undefined;

describe("review API compatibility", () => {
  beforeAll(async () => {
    const database = openDatabase(databasePath);
    migrateDatabase(database);
    database.close();

    const server = await import("../../server/index");
    app = await server.startServer({ listen: false });
    closeDatabase = server.closeDatabaseForTests;
    await request(app).get("/api/public-menu/reviews-restaurant");
  });

  afterAll(() => {
    closeDatabase?.();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates, rate-limits, disables, moderates, and logs out safely", async () => {
    const created = await request(app)
      .post("/api/reviews/1")
      .set("X-Forwarded-For", "review-client")
      .send({ author_name: "Ana", rating: 5, comment: "Great food" });
    expect(created.status).toBe(201);
    const reviewId = created.body.review.id;

    const rateLimited = await request(app)
      .post("/api/reviews/1")
      .set("X-Forwarded-For", "review-client")
      .send({ author_name: "Second", rating: 4, comment: "Soon" });
    expect(rateLimited.status).toBe(429);

    const listed = await request(app).get("/api/reviews/1");
    expect(listed.body.reviews).toHaveLength(1);
    expect(listed.body.reviews[0].author_name).toBe("Ana");

    const deniedDelete = await request(app).delete("/api/reviews/1/" + reviewId);
    expect(deniedDelete.status).toBe(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ password: "reviews-password" });
    const cookie = login.headers["set-cookie"]?.[0] || "";

    const disabled = await request(app)
      .put("/api/restaurant/1/reviews-enabled")
      .set("Cookie", cookie)
      .send({ enabled: false });
    expect(disabled.body).toEqual({ success: true, enabled: false });

    const disabledList = await request(app).get("/api/reviews/1");
    expect(disabledList.body).toEqual({ reviews: [], reviews_enabled: false });

    const disabledPost = await request(app)
      .post("/api/reviews/1")
      .set("X-Forwarded-For", "another-client")
      .send({ rating: 5 });
    expect(disabledPost.status).toBe(403);

    const deleted = await request(app)
      .delete("/api/reviews/1/" + reviewId)
      .set("Cookie", cookie);
    expect(deleted.body).toEqual({ success: true });

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie);
    expect(logout.body).toEqual({ authenticated: false });

    const protectedAfterLogout = await request(app)
      .put("/api/restaurant/1")
      .send({ name: "Blocked after logout" });
    expect(protectedAfterLogout.status).toBe(401);
  });
});
