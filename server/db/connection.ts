import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDbPath, resolveSeedDbPath } from "../config.js";

export function ensureDatabaseFile(
  dbPath = resolveDbPath(),
  seedPath = resolveSeedDbPath(),
): string {
  const directory = path.dirname(dbPath);
  fs.mkdirSync(directory, { recursive: true });

  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(seedPath) && path.resolve(seedPath) !== path.resolve(dbPath)) {
      fs.copyFileSync(seedPath, dbPath);
    }
  }

  return dbPath;
}

export function openDatabase(dbPath = resolveDbPath()): Database.Database {
  const database = new Database(ensureDatabaseFile(dbPath));
  database.pragma("foreign_keys = ON");
  // Keep a busy web process from failing immediately when two writes overlap.
  database.pragma("busy_timeout = 5000");
  // WAL keeps readers stable while an admin edit is being written. In-memory
  // databases keep SQLite's default journal mode for fast isolated tests.
  if (database.name !== ":memory:") {
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = NORMAL");
  }
  return database;
}
