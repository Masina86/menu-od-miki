const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.env.DB_PATH
  ? path.isAbsolute(process.env.DB_PATH)
    ? process.env.DB_PATH
    : path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(__dirname, "menu.db");

const db = new Database(dbPath);

// Remove empty duplicate demo-restaurant rows (no categories).
const deleted = db
  .prepare(
    `DELETE FROM restaurants
     WHERE slug IN ('demo-restaurant', 'Dismak-Oil')
       AND id NOT IN (SELECT DISTINCT restaurant_id FROM categories WHERE restaurant_id IS NOT NULL)`,
  )
  .run();
console.log("Deleted empty duplicates:", deleted.changes);

const updated = db
  .prepare(
    "UPDATE restaurants SET slug = 'dismak-oil' WHERE slug IN ('demo-restaurant', 'Dismak-Oil')",
  )
  .run();
console.log("Updated slug rows:", updated.changes);

console.log(
  "Restaurants:",
  db.prepare("SELECT id, name, slug FROM restaurants").all(),
);

db.close();
