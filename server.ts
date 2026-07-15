import dotenv from "dotenv";
import { initializeDatabase } from "./server/db/migrations.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

initializeDatabase();
await import("./server/index.js");
