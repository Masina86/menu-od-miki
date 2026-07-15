import Database from "better-sqlite3";
import { openDatabase } from "./connection.js";

const CURRENT_SCHEMA_VERSION = 4;

function existingColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  if (!existingColumns(db, table).has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function createBaseTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      parent_id INTEGER,
      name TEXT NOT NULL,
      image_url TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      image_url TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS additions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      author_name TEXT,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS category_view_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      period_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS menu_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      month_key TEXT NOT NULL,
      scan_count INTEGER DEFAULT 1,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      UNIQUE (restaurant_id, month_key)
    );
  `);
}

function createScanStatisticsTables(
  db: Database.Database,
  trackingStartedAt: string,
) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS menu_scan_days (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "restaurant_id INTEGER NOT NULL," +
      "day_key TEXT NOT NULL," +
      "scan_count INTEGER NOT NULL DEFAULT 1," +
      "FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE," +
      "UNIQUE (restaurant_id, day_key)" +
      ");" +
      "CREATE TABLE IF NOT EXISTS menu_scan_tracking_metadata (" +
      "id INTEGER PRIMARY KEY CHECK (id = 1)," +
      "daily_tracking_started_at TEXT NOT NULL" +
      ");",
  );

  db.prepare(
    "INSERT OR IGNORE INTO menu_scan_tracking_metadata " +
      "(id, daily_tracking_started_at) VALUES (1, ?)",
  ).run(trackingStartedAt);
}

function createScanAttributionTables(db: Database.Database) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS menu_scan_sources (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "restaurant_id INTEGER NOT NULL," +
      "day_key TEXT NOT NULL," +
      "source TEXT NOT NULL CHECK (source IN ('qr', 'direct'))," +
      "scan_count INTEGER NOT NULL DEFAULT 1," +
      "FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE," +
      "UNIQUE (restaurant_id, day_key, source)" +
      ");",
  );
}
function createScanStatisticsIndexes(db: Database.Database) {
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_menu_scan_days_restaurant_day " +
      "ON menu_scan_days (restaurant_id, day_key);",
  );
}

function addCurrentColumns(db: Database.Database) {
  const restaurantColumns: Array<[string, string]> = [
    ["background_url", "TEXT"],
    ["logo_url", "TEXT"],
    ["logo_size", "INTEGER DEFAULT 100"],
    ["logo_fit", "TEXT DEFAULT 'contain'"],
    ["logo_position_x", "INTEGER DEFAULT 50"],
    ["logo_position_y", "INTEGER DEFAULT 50"],
    ["phone", "TEXT"],
    ["address", "TEXT"],
    ["wifi_password", "TEXT"],
    ["opening_hours", "TEXT"],
    ["facebook_url", "TEXT"],
    ["instagram_url", "TEXT"],
    ["popular_badges_enabled", "INTEGER DEFAULT 1"],
    ["popular_category_id", "INTEGER"],
    ["popular_category_period_key", "TEXT"],
    ["popular_category_updated_at", "TEXT"],
    ["reviews_enabled", "INTEGER DEFAULT 1"],
    ["search_enabled", "INTEGER DEFAULT 1"],
    ["takeover_enabled", "INTEGER DEFAULT 0"],
    ["takeover_title", "TEXT"],
    ["takeover_message", "TEXT"],
    ["takeover_price", "TEXT"],
    ["takeover_allergens", "TEXT"],
    ["takeover_image_url", "TEXT"],
    ["footer_text", "TEXT"],
    ["footer_link", "TEXT"],
  ];
  const categoryColumns: Array<[string, string]> = [
    ["parent_id", "INTEGER"],
    ["image_url", "TEXT"],
    ["name_en", "TEXT"],
    ["name_bg", "TEXT"],
  ];
  const productColumns: Array<[string, string]> = [
    ["name_en", "TEXT"],
    ["name_bg", "TEXT"],
    ["description_en", "TEXT"],
    ["description_bg", "TEXT"],
    ["is_available", "INTEGER DEFAULT 1"],
    ["tags", "TEXT"],
    ["allergens", "TEXT"],
    ["calories", "INTEGER"],
    ["is_featured", "INTEGER DEFAULT 0"],
    ["is_new", "INTEGER DEFAULT 0"],
  ];
  const additionColumns: Array<[string, string]> = [
    ["name_en", "TEXT"],
    ["name_bg", "TEXT"],
  ];

  for (const [column, definition] of restaurantColumns) {
    addColumnIfMissing(db, "restaurants", column, definition);
  }
  for (const [column, definition] of categoryColumns) {
    addColumnIfMissing(db, "categories", column, definition);
  }
  for (const [column, definition] of productColumns) {
    addColumnIfMissing(db, "products", column, definition);
  }
  for (const [column, definition] of additionColumns) {
    addColumnIfMissing(db, "additions", column, definition);
  }
}

function createScanAttributionIndexes(db: Database.Database) {
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_menu_scan_sources_restaurant_day " +
      "ON menu_scan_sources (restaurant_id, day_key);" +
      "CREATE INDEX IF NOT EXISTS idx_menu_scan_sources_source " +
      "ON menu_scan_sources (restaurant_id, source, day_key);",
  );
}
function createIndexes(db: Database.Database) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_categories_restaurant_order
      ON categories (restaurant_id, parent_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_products_category_order
      ON products (category_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_additions_product
      ON additions (product_id);
    CREATE INDEX IF NOT EXISTS idx_category_view_events_period
      ON category_view_events (restaurant_id, period_key, category_id);
  `);
}

type RestaurantSlugRow = {
  id: number;
  slug: string;
};

function restaurantCategoryCount(db: Database.Database, restaurantId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM categories WHERE restaurant_id = ?")
    .get(restaurantId) as { count?: number } | undefined;
  return Number(row?.count || 0);
}

function nextLegacyRestaurantSlug(
  db: Database.Database,
  restaurantId: number,
): string {
  const base = `dismak-oil-legacy-${restaurantId}`;
  let candidate = base;
  let suffix = 2;

  while (
    db
      .prepare("SELECT 1 FROM restaurants WHERE slug = ? AND id != ?")
      .get(candidate, restaurantId)
  ) {
    candidate = `${base}-${suffix++}`;
  }

  return candidate;
}

function applyDataMigrations(db: Database.Database) {
  const legacyRestaurants = db
    .prepare(
      "SELECT id, slug FROM restaurants WHERE slug IN ('demo-restaurant', 'Dismak-Oil')",
    )
    .all() as RestaurantSlugRow[];
  let canonicalRestaurant = db
    .prepare("SELECT id, slug FROM restaurants WHERE slug = 'dismak-oil'")
    .get() as RestaurantSlugRow | undefined;

  const candidates = () =>
    legacyRestaurants.filter((restaurant) => restaurant.id !== canonicalRestaurant?.id);
  const choosePrimaryLegacy = () =>
    [...candidates()].sort((left, right) => {
      const categoryDifference =
        restaurantCategoryCount(db, right.id) - restaurantCategoryCount(db, left.id);
      if (categoryDifference !== 0) return categoryDifference;
      if (left.slug === "Dismak-Oil") return -1;
      if (right.slug === "Dismak-Oil") return 1;
      return left.id - right.id;
    })[0];

  if (!canonicalRestaurant) {
    const primaryLegacy = choosePrimaryLegacy();
    if (primaryLegacy) {
      db.prepare("UPDATE restaurants SET slug = 'dismak-oil' WHERE id = ?").run(
        primaryLegacy.id,
      );
      canonicalRestaurant = { id: primaryLegacy.id, slug: "dismak-oil" };
    }
  } else {
    const primaryLegacy = choosePrimaryLegacy();
    if (
      primaryLegacy &&
      restaurantCategoryCount(db, primaryLegacy.id) >
        restaurantCategoryCount(db, canonicalRestaurant.id)
    ) {
      // Keep the populated legacy menu at the canonical URL. The former
      // canonical row is retained under a unique slug so no data is lost.
      const displacedSlug = nextLegacyRestaurantSlug(db, canonicalRestaurant.id);
      db.prepare("UPDATE restaurants SET slug = ? WHERE id = ?").run(
        displacedSlug,
        canonicalRestaurant.id,
      );
      db.prepare("UPDATE restaurants SET slug = 'dismak-oil' WHERE id = ?").run(
        primaryLegacy.id,
      );
      canonicalRestaurant = { id: primaryLegacy.id, slug: "dismak-oil" };
    }
  }

  // A deployed database may contain both the old and new restaurant slugs.
  // Rename remaining legacy rows instead of deleting them or violating the
  // UNIQUE slug constraint. Their related menu and scan records remain intact.
  for (const legacyRestaurant of candidates()) {
    db.prepare("UPDATE restaurants SET slug = ? WHERE id = ?").run(
      nextLegacyRestaurantSlug(db, legacyRestaurant.id),
      legacyRestaurant.id,
    );
  }
}

export function migrateDatabase(db: Database.Database): void {
  const transaction = db.transaction(() => {
    createBaseTables(db);
    createScanStatisticsTables(db, new Date().toISOString());
    createScanAttributionTables(db);
    addCurrentColumns(db);
    createIndexes(db);
    createScanStatisticsIndexes(db);
    createScanAttributionIndexes(db);
    applyDataMigrations(db);
    db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
  });

  transaction();
}

export function initializeDatabase(dbPath?: string): string {
  const database = openDatabase(dbPath);
  try {
    migrateDatabase(database);
    return dbPath || database.name;
  } finally {
    database.close();
  }
}
