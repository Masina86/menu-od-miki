import dotenv from "dotenv";
import { loadConfig } from "./server/config.js";
import { initializeDatabase } from "./server/db/migrations.js";
import { prepareMedia } from "./server/domains/media/bootstrap.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const config = loadConfig();
initializeDatabase(config.dbPath);
await prepareMedia(config);
await import("./server/index.js");
