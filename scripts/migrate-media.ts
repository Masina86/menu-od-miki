import { loadConfig } from "../server/config.js";
import { initializeDatabase } from "../server/db/migrations.js";
import { openDatabase } from "../server/db/connection.js";
import { MediaStorage } from "../server/domains/media/storage.js";
import { migrateEmbeddedMedia } from "../server/domains/media/migration.js";

const config = loadConfig();
initializeDatabase(config.dbPath);
const storage = new MediaStorage(config.mediaDir);
storage.seedFrom(config.seedMediaDir);
const db = openDatabase(config.dbPath);
try {
  const result = await migrateEmbeddedMedia({
    db,
    dbPath: config.dbPath,
    storage,
    createBackup: process.env.MEDIA_MIGRATION_BACKUP !== "0",
  });
  console.log(
    `Media migration complete: ${result.converted} converted, ${result.failed} retained.`,
  );
} finally {
  db.close();
}
