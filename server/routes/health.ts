import type { Express } from "express";
import type Database from "better-sqlite3";

export function registerHealthRoute(app: Express, db: Database.Database): void {
  app.get("/healthz", (_req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ status: "ok", database: "ok" });
    } catch (error: unknown) {
      console.error("[healthz] Database check failed:", error);
      res.status(503).json({ status: "error", database: "unavailable" });
    }
  });
}
