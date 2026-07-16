import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { buildMenu } from "../dist-server/server/domains/menu/service.js";

const dbPath = path.resolve("data", "seed", "menu.db");
const databaseBytes = fs.statSync(dbPath).size;
// A database left in WAL mode may create read-only sidecar files even when it
// is only inspected. Benchmark an isolated copy so the tracked seed remains
// byte-for-byte untouched by the acceptance check.
const benchmarkDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "menu-perf-"));
const benchmarkDbPath = path.join(benchmarkDirectory, "menu.db");
fs.copyFileSync(dbPath, benchmarkDbPath);
const db = new Database(benchmarkDbPath);
const restaurant = db
  .prepare("SELECT id FROM restaurants WHERE slug = ?")
  .get("dismak-oil");
if (!restaurant) throw new Error("Performance fixture restaurant is missing.");

const durations = [];
let payloadBytes = 0;
for (let index = 0; index < 20; index += 1) {
  const started = performance.now();
  const body = JSON.stringify(buildMenu(db, restaurant.id, true));
  durations.push(performance.now() - started);
  payloadBytes = Buffer.byteLength(body);
}
db.close();
fs.rmSync(benchmarkDirectory, { recursive: true, force: true });

durations.sort((left, right) => left - right);
const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
const backgrounds = fs
  .readdirSync(path.resolve("data", "seed", "media", "restaurants", "1", "background"))
  .filter((file) => file.endsWith("-640.webp"));
const heroBytes = Math.max(
  ...backgrounds.map((file) =>
    fs.statSync(
      path.resolve("data", "seed", "media", "restaurants", "1", "background", file),
    ).size,
  ),
);

const failures = [];
if (p95 > 50) failures.push(`public menu p95 is ${p95.toFixed(1)} ms`);
if (payloadBytes >= 100_000) failures.push(`menu payload is ${payloadBytes} bytes`);
if (databaseBytes > 2 * 1024 * 1024) {
  failures.push(`seed database is ${(databaseBytes / 1024 / 1024).toFixed(2)} MiB`);
}
if (heroBytes > 200_000) failures.push(`640 px hero is ${heroBytes} bytes`);
if (failures.length) {
  console.error(`Performance budget exceeded: ${failures.join("; ")}.`);
  process.exit(1);
}

console.log(
  `Performance budget OK: menu p95 ${p95.toFixed(1)} ms, payload ${(payloadBytes / 1024).toFixed(1)} KiB, seed ${(databaseBytes / 1024).toFixed(1)} KiB, 640 px hero ${(heroBytes / 1024).toFixed(1)} KiB.`,
);
