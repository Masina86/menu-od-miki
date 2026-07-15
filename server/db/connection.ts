import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDbPath } from "../config.js";

export function ensureDatabaseFile(dbPath = resolveDbPath()): string {
  const directory = path.dirname(dbPath);
  fs.mkdirSync(directory, { recursive: true });

  if (!fs.existsSync(dbPath)) {
    const seedPath = path.resolve(process.cwd(), "menu.db");
    if (fs.existsSync(seedPath) && path.resolve(seedPath) !== path.resolve(dbPath)) {
      fs.copyFileSync(seedPath, dbPath);
    }
  }

  return dbPath;
}

export function openDatabase(dbPath = resolveDbPath()): Database.Database {
  const database = new Database(ensureDatabaseFile(dbPath));
  database.pragma("foreign_keys = ON");
  return database;
}
