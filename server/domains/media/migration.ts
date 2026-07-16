import fs from "node:fs";
import type Database from "better-sqlite3";
import { MediaStorage, dataUrlBuffer } from "./storage.js";
import type { MediaTarget, RestaurantMediaField } from "./references.js";

interface LegacyAsset {
  table: "restaurants" | "categories" | "products";
  column: string;
  id: number;
  value: string;
  target: MediaTarget;
}

function legacyAssets(db: Database.Database): LegacyAsset[] {
  const assets: LegacyAsset[] = [];
  const addRows = (
    table: LegacyAsset["table"],
    column: string,
    target: (id: number) => MediaTarget,
  ) => {
    const rows = db
      .prepare(
        `SELECT id, ${column} AS value FROM ${table} WHERE ${column} LIKE 'data:image/%'`,
      )
      .all() as Array<{ id: number; value: string }>;
    for (const row of rows) {
      assets.push({ table, column, id: row.id, value: row.value, target: target(row.id) });
    }
  };
  for (const field of ["background", "logo", "takeover"] as RestaurantMediaField[]) {
    const column = field === "takeover" ? "takeover_image_url" : `${field}_url`;
    addRows("restaurants", column, (id) => ({
      kind: "restaurants",
      id,
      field,
    }));
  }
  addRows("categories", "image_url", (id) => ({ kind: "categories", id }));
  addRows("products", "image_url", (id) => ({ kind: "products", id }));
  return assets;
}

export async function migrateEmbeddedMedia(options: {
  db: Database.Database;
  dbPath: string;
  storage: MediaStorage;
  createBackup?: boolean;
}): Promise<{ converted: number; failed: number }> {
  const assets = legacyAssets(options.db);
  if (!assets.length) return { converted: 0, failed: 0 };

  if (options.createBackup !== false) {
    const backupPath = `${options.dbPath}.pre-media-v5.bak`;
    if (!fs.existsSync(backupPath)) await options.db.backup(backupPath);
  }

  let converted = 0;
  let failed = 0;
  for (const asset of assets) {
    try {
      const reference = await options.storage.store(
        dataUrlBuffer(asset.value),
        asset.target,
      );
      options.db
        .prepare(`UPDATE ${asset.table} SET ${asset.column} = ? WHERE id = ?`)
        .run(reference, asset.id);
      converted += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[media] Could not migrate ${asset.table}.${asset.column} for ${asset.id}:`,
        error,
      );
    }
  }

  const integrity = options.db.pragma("integrity_check", { simple: true });
  const foreignKeys = options.db.pragma("foreign_key_check") as unknown[];
  if (integrity !== "ok" || foreignKeys.length) {
    throw new Error("Database integrity check failed after media migration.");
  }
  if (failed === 0 && converted > 0) options.db.exec("VACUUM");
  return { converted, failed };
}
