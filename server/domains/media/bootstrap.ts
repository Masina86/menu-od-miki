import { openDatabase } from "../../db/connection.js";
import type { AppConfig } from "../../config.js";
import { migrateEmbeddedMedia } from "./migration.js";
import { MediaStorage } from "./storage.js";

export async function prepareMedia(config: AppConfig): Promise<void> {
  const storage = new MediaStorage(config.mediaDir);
  storage.seedFrom(config.seedMediaDir);
  const db = openDatabase(config.dbPath);
  try {
    const result = await migrateEmbeddedMedia({
      db,
      dbPath: config.dbPath,
      storage,
    });
    if (result.converted || result.failed) {
      console.log(
        `[media] Migration finished: ${result.converted} converted, ${result.failed} retained.`,
      );
    }
  } finally {
    db.close();
  }
}
