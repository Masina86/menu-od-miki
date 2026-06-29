import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// Prefer local-only secrets file if present.
dotenv.config({ path: ".env.local" });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB path is configurable for hosting (e.g. Render persistent disk).
const DB_PATH = process.env.DB_PATH || "menu.db";
const resolvedDbPath = path.isAbsolute(DB_PATH)
  ? DB_PATH
  : path.resolve(process.cwd(), DB_PATH);

// If using an external path (e.g. mounted volume) and it doesn't exist yet,
// seed it from the repo's menu.db (if present).
try {
  const dbDir = path.dirname(resolvedDbPath);
  if (dbDir && !fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  if (!fs.existsSync(resolvedDbPath)) {
    const seedPath = path.resolve(process.cwd(), "menu.db");
    if (fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, resolvedDbPath);
      console.log(`[db] seeded database to: ${resolvedDbPath}`);
    } else {
      console.log(`[db] creating new database at: ${resolvedDbPath}`);
    }
  }
} catch (e) {
  console.warn("[db] init warning:", e);
}

const db = new Database(resolvedDbPath);

// One-time slug migration for deployed instances with old URLs.
try {
  db.prepare(
    `DELETE FROM restaurants
     WHERE slug IN ('demo-restaurant', 'Dismak-Oil')
       AND id NOT IN (SELECT DISTINCT restaurant_id FROM categories WHERE restaurant_id IS NOT NULL)`,
  ).run();
  const slugMigration = db
    .prepare(
      "UPDATE restaurants SET slug = 'dismak-oil' WHERE slug IN ('demo-restaurant', 'Dismak-Oil')",
    )
    .run();
  if (slugMigration.changes > 0) {
    console.log(`[db] migrated slug to dismak-oil (${slugMigration.changes} row(s))`);
  }
} catch (e) {
  console.warn("[db] slug migration warning:", e);
}

// Initialize Database
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
`);

// Safe ALTER TABLE helpers
const tryAlter = (sql: string) => {
  try {
    db.exec(sql);
  } catch (_) {}
};

tryAlter("ALTER TABLE restaurants ADD COLUMN background_url TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN logo_url TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN phone TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN address TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN wifi_password TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN opening_hours TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN facebook_url TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN instagram_url TEXT");

tryAlter(
  "ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE",
);
tryAlter("ALTER TABLE categories ADD COLUMN image_url TEXT");
tryAlter("ALTER TABLE categories ADD COLUMN name_en TEXT");
tryAlter("ALTER TABLE categories ADD COLUMN name_bg TEXT");

tryAlter("ALTER TABLE products ADD COLUMN name_en TEXT");
tryAlter("ALTER TABLE products ADD COLUMN name_bg TEXT");
tryAlter("ALTER TABLE products ADD COLUMN description_en TEXT");
tryAlter("ALTER TABLE products ADD COLUMN description_bg TEXT");
tryAlter("ALTER TABLE products ADD COLUMN is_available INTEGER DEFAULT 1");
tryAlter("ALTER TABLE products ADD COLUMN tags TEXT");
tryAlter("ALTER TABLE products ADD COLUMN allergens TEXT");
tryAlter("ALTER TABLE products ADD COLUMN calories INTEGER");
tryAlter("ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0");
tryAlter("ALTER TABLE products ADD COLUMN is_new INTEGER DEFAULT 0");

tryAlter("ALTER TABLE additions ADD COLUMN name_en TEXT");
tryAlter("ALTER TABLE additions ADD COLUMN name_bg TEXT");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_categories_restaurant_order
    ON categories (restaurant_id, parent_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_products_category_order
    ON products (category_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_additions_product
    ON additions (product_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    author_name TEXT,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
  );
`);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
  const translationCache = new Map<string, string>();

  const isBlank = (v: any) => v == null || String(v).trim() === "";

  const translateText = async (text: string, target: "EN" | "BG") => {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return "";

    const cacheKey = `${target}::${trimmed}`;
    const cached = translationCache.get(cacheKey);
    if (cached) return cached;

    if (!ai) return "";

    const targetName = target === "EN" ? "English" : "Bulgarian";
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Translate the following restaurant menu text to ${targetName}. Keep it natural and concise. Return only the translated text, no quotes.\n\nTEXT:\n${trimmed}`,
    });
    const out = (response.text ?? "").trim();
    if (!out) return "";
    translationCache.set(cacheKey, out);
    return out;
  };

  const ensureTranslations = async (
    sourceText: string,
    current: { en?: string | null; bg?: string | null },
  ) => {
    const en =
      !isBlank(current.en)
        ? String(current.en)
        : await translateText(sourceText, "EN");
    const bg =
      !isBlank(current.bg)
        ? String(current.bg)
        : await translateText(sourceText, "BG");
    return {
      en: en && en.trim() ? en : null,
      bg: bg && bg.trim() ? bg : null,
    };
  };

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use((req, _res, next) => {
    if (req.path.startsWith("/api/")) {
      console.log(`[api] ${req.method} ${req.originalUrl}`);
    }
    next();
  });

  // Helper to ensure IDs (BigInts from SQLite) are serializable
  const toJSON = (obj: any) => {
    return JSON.parse(
      JSON.stringify(obj, (_, value) =>
        typeof value === "bigint" ? Number(value) : value,
      ),
    );
  };

  const dataUrlToResponse = (imageUrl: string | null | undefined, res: any) => {
    if (!imageUrl) {
      res.status(404).end();
      return;
    }

    if (!imageUrl.startsWith("data:")) {
      res.redirect(imageUrl);
      return;
    }

    const match = imageUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) {
      res.status(404).end();
      return;
    }

    const contentType = match[1] || "application/octet-stream";
    const isBase64 = !!match[2];
    const raw = match[3] || "";
    const body = isBase64
      ? Buffer.from(raw, "base64")
      : Buffer.from(decodeURIComponent(raw));

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(body);
  };

  const compactImageUrl = (
    type: "categories" | "products" | "restaurants",
    id: number,
    imageUrl: string | null | undefined,
    field = "image",
  ) => {
    if (!imageUrl) return imageUrl;
    if (!imageUrl.startsWith("data:") || imageUrl.length < 2048) return imageUrl;
    if (type === "categories" && imageUrl.length > 500_000) return null;
    return type === "restaurants"
      ? `/api/images/restaurants/${id}/${field}`
      : `/api/images/${type}/${id}`;
  };

  const getOrCreateRestaurantBySlug = (slug: string) => {
    let restaurant = db
      .prepare("SELECT * FROM restaurants WHERE slug = ?")
      .get(slug) as any;

    if (!restaurant) {
      const name =
        slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
      const result = db
        .prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)")
        .run(name, slug);
      const newId =
        typeof result.lastInsertRowid === "bigint"
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid;
      restaurant = {
        id: newId,
        name,
        slug,
        background_url: null,
        logo_url: null,
        phone: null,
        address: null,
        wifi_password: null,
        opening_hours: null,
        facebook_url: null,
        instagram_url: null,
      };
    }

    return restaurant;
  };

  const buildMenu = (restaurantId: string | number, compactImages = false) => {
    const allCategories = db
      .prepare(
        "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order",
      )
      .all(restaurantId) as any[];

    const categoryIds = allCategories.map((cat) => cat.id);
    const products = categoryIds.length
      ? (db
          .prepare(
            `SELECT * FROM products
             WHERE category_id IN (${categoryIds.map(() => "?").join(",")})
             ORDER BY category_id, sort_order`,
          )
          .all(...categoryIds) as any[])
      : [];

    const productIds = products.map((prod) => prod.id);
    const additions = productIds.length
      ? (db
          .prepare(
            `SELECT * FROM additions
             WHERE product_id IN (${productIds.map(() => "?").join(",")})
             ORDER BY product_id, id`,
          )
          .all(...productIds) as any[])
      : [];

    const additionsByProduct = new Map<number, any[]>();
    additions.forEach((addition) => {
      const list = additionsByProduct.get(addition.product_id) || [];
      list.push(addition);
      additionsByProduct.set(addition.product_id, list);
    });

    const productsByCategory = new Map<number, any[]>();
    products.forEach((product) => {
      const productWithData = {
        ...product,
        image_url: compactImages
          ? compactImageUrl("products", product.id, product.image_url)
          : product.image_url,
        additions: additionsByProduct.get(product.id) || [],
      };
      const list = productsByCategory.get(product.category_id) || [];
      list.push(productWithData);
      productsByCategory.set(product.category_id, list);
    });

    const categoryMap = new Map();
    allCategories.forEach((cat) => {
      const catProducts = productsByCategory.get(cat.id) || [];

      categoryMap.set(cat.id, {
        ...cat,
        image_url: compactImages
          ? compactImageUrl("categories", cat.id, cat.image_url)
          : cat.image_url,
        products: catProducts,
        subcategories: [],
      });
    });

    const menu: any[] = [];
    allCategories.forEach((cat) => {
      const categoryWithData = categoryMap.get(cat.id);
      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.subcategories.push(categoryWithData);
        } else {
          menu.push(categoryWithData);
        }
      } else {
        menu.push(categoryWithData);
      }
    });

    const sortFn = (a: any, b: any) =>
      (a.sort_order || 0) - (b.sort_order || 0);
    menu.sort(sortFn);
    categoryMap.forEach((cat) => {
      if (cat.subcategories && cat.subcategories.length > 0) {
        cat.subcategories.sort(sortFn);
      }
    });

    return menu;
  };

  // ─── RESTAURANT ────────────────────────────────────────────────────────────

  // Get or create restaurant by slug
  app.get("/api/restaurant/:slug", (req, res) => {
    const { slug } = req.params;
    const restaurant = getOrCreateRestaurantBySlug(slug);

    res.json(toJSON(restaurant));
  });

  // Update Restaurant Slug
  app.put("/api/restaurant/:id/slug", (req, res) => {
    try {
      const id = Number(req.params.id);
      const { slug } = req.body;
      if (isNaN(id)) throw new Error("Invalid restaurant ID");
      if (!slug || typeof slug !== "string") throw new Error("Invalid slug");
      const existing = db.prepare("SELECT id FROM restaurants WHERE slug = ? AND id != ?").get(slug, id);
      if (existing) throw new Error("Slug already in use by another restaurant");
      const result = db.prepare("UPDATE restaurants SET slug = ? WHERE id = ?").run(slug, id);
      res.json({ success: true, changes: result.changes, slug });
    } catch (error: any) {
      console.error("[api] Error updating restaurant slug:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update Restaurant
  app.put("/api/restaurant/:id", (req, res) => {
    try {
      const {
        name,
        background_url,
        logo_url,
        phone,
        address,
        wifi_password,
        opening_hours,
        facebook_url,
        instagram_url,
      } = req.body;
      const id = Number(req.params.id);

      if (isNaN(id)) throw new Error("Invalid restaurant ID");

      const result = db
        .prepare(
          "UPDATE restaurants SET name = ?, background_url = ?, logo_url = ?, phone = ?, address = ?, wifi_password = ?, opening_hours = ?, facebook_url = ?, instagram_url = ? WHERE id = ?",
        )
        .run(
          name,
          background_url || null,
          logo_url || null,
          phone || null,
          address || null,
          wifi_password || null,
          opening_hours || null,
          facebook_url || null,
          instagram_url || null,
          id,
        );

      res.json({ success: true, changes: result.changes });
    } catch (error: any) {
      console.error("[api] Error updating restaurant:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── MENU ──────────────────────────────────────────────────────────────────

  app.get("/api/public-menu/:slug", (req, res) => {
    const restaurant = getOrCreateRestaurantBySlug(req.params.slug);
    const publicRestaurant = {
      ...restaurant,
      background_url: compactImageUrl(
        "restaurants",
        restaurant.id,
        restaurant.background_url,
        "background",
      ),
      logo_url: compactImageUrl(
        "restaurants",
        restaurant.id,
        restaurant.logo_url,
        "logo",
      ),
    };
    const menu = buildMenu(restaurant.id, true);
    res.setHeader(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=300",
    );
    res.json(toJSON({ restaurant: publicRestaurant, menu }));
  });

  app.get("/api/images/categories/:id", (req, res) => {
    const row = db
      .prepare("SELECT image_url FROM categories WHERE id = ?")
      .get(req.params.id) as any;
    dataUrlToResponse(row?.image_url, res);
  });

  app.get("/api/images/products/:id", (req, res) => {
    const row = db
      .prepare("SELECT image_url FROM products WHERE id = ?")
      .get(req.params.id) as any;
    dataUrlToResponse(row?.image_url, res);
  });

  app.get("/api/images/restaurants/:id/:field", (req, res) => {
    const field =
      req.params.field === "background" ? "background_url" : "logo_url";
    const row = db
      .prepare(`SELECT ${field} AS image_url FROM restaurants WHERE id = ?`)
      .get(req.params.id) as any;
    dataUrlToResponse(row?.image_url, res);
  });

  app.get("/api/menu/:restaurantId", (req, res) => {
    const { restaurantId } = req.params;

    const allCategories = db
      .prepare(
        "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order",
      )
      .all(restaurantId) as any[];

    const getProductsForCategory = (categoryId: number) => {
      const products = db
        .prepare(
          "SELECT * FROM products WHERE category_id = ? ORDER BY sort_order",
        )
        .all(categoryId) as any[];
      return products.map((prod) => {
        const additions = db
          .prepare("SELECT * FROM additions WHERE product_id = ?")
          .all(prod.id);
        return { ...prod, additions };
      });
    };

    const translationMap: Record<string, { en: string; bg: string }> = {
      салати: { en: "Salads", bg: "Салати" },
      salads: { en: "Salads", bg: "Салати" },
      предјадења: { en: "Appetizers", bg: "Предястия" },
      appetizers: { en: "Appetizers", bg: "Предястия" },
      "главни јадења": { en: "Main Courses", bg: "Основни ястия" },
      "main courses": { en: "Main Courses", bg: "Основни ястия" },
      десерти: { en: "Desserts", bg: "Десерти" },
      desserts: { en: "Desserts", bg: "Десерти" },
      пијалоци: { en: "Drinks", bg: "Напитки" },
      drinks: { en: "Drinks", bg: "Напитки" },
      "шопска салата": { en: "Shopska Salad", bg: "Шопска салата" },
      "shopska salad": { en: "Shopska Salad", bg: "Шопска салата" },
      "мешана салата": { en: "Mixed Salad", bg: "Мешана салата" },
      "mixed salad": { en: "Mixed Salad", bg: "Мешана салата" },
      скара: { en: "Grill", bg: "Скара" },
      grill: { en: "Grill", bg: "Скара" },
      пици: { en: "Pizzas", bg: "Пици" },
      pizzas: { en: "Pizzas", bg: "Пици" },
      паста: { en: "Pasta", bg: "Паста" },
      pasta: { en: "Pasta", bg: "Паста" },
    };

    const categoryMap = new Map();
    allCategories.forEach((cat) => {
      const catKey = cat.name.toLowerCase().trim();
      const trans = translationMap[catKey];
      if (trans) {
        if (!cat.name_en) cat.name_en = trans.en;
        if (!cat.name_bg) cat.name_bg = trans.bg;
      }

      const products = getProductsForCategory(cat.id).map((prod) => {
        const prodKey = prod.name.toLowerCase().trim();
        const prodTrans = translationMap[prodKey];
        if (prodTrans) {
          if (!prod.name_en) prod.name_en = prodTrans.en;
          if (!prod.name_bg) prod.name_bg = prodTrans.bg;
        }
        return prod;
      });

      categoryMap.set(cat.id, { ...cat, products, subcategories: [] });
    });

    const menu: any[] = [];
    allCategories.forEach((cat) => {
      const categoryWithData = categoryMap.get(cat.id);
      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.subcategories.push(categoryWithData);
        } else {
          menu.push(categoryWithData);
        }
      } else {
        menu.push(categoryWithData);
      }
    });

    const sortFn = (a: any, b: any) =>
      (a.sort_order || 0) - (b.sort_order || 0);
    menu.sort(sortFn);
    categoryMap.forEach((cat) => {
      if (cat.subcategories && cat.subcategories.length > 0) {
        cat.subcategories.sort(sortFn);
      }
    });

    res.json(toJSON(menu));
  });

  // ─── CATEGORIES ────────────────────────────────────────────────────────────

  app.post("/api/categories", async (req, res) => {
    try {
      const { restaurant_id, name, name_en, name_bg, image_url, parent_id } =
        req.body;

      const nameTr = await ensureTranslations(String(name ?? ""), {
        en: name_en,
        bg: name_bg,
      });

      const maxOrderRow = db
        .prepare(
          "SELECT MAX(sort_order) as maxOrder FROM categories WHERE restaurant_id = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))",
        )
        .get(restaurant_id, parent_id || null, parent_id || null) as {
        maxOrder: number | bigint;
      };
      const maxOrder =
        typeof maxOrderRow?.maxOrder === "bigint"
          ? Number(maxOrderRow.maxOrder)
          : maxOrderRow?.maxOrder || 0;
      const sort_order = maxOrder + 1;

      const result = db
        .prepare(
          "INSERT INTO categories (restaurant_id, name, name_en, name_bg, image_url, parent_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          restaurant_id,
          name,
          nameTr.en,
          nameTr.bg,
          image_url || null,
          parent_id || null,
          sort_order,
        );

      res.json(
        toJSON({
          id: result.lastInsertRowid,
          restaurant_id,
          name,
          name_en: nameTr.en,
          name_bg: nameTr.bg,
          image_url,
          parent_id,
          sort_order,
          products: [],
          subcategories: [],
        }),
      );
    } catch (error: any) {
      console.error("Error adding category:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/categories/:id(\\d+)", async (req, res) => {
    const { name, name_en, name_bg, image_url } = req.body;
    const { id } = req.params;

    const existing = db
      .prepare("SELECT * FROM categories WHERE id = ?")
      .get(id) as any;
    const baseName = !isBlank(name) ? String(name) : String(existing?.name ?? "");
    const nameTr = await ensureTranslations(baseName, {
      en: name_en ?? existing?.name_en,
      bg: name_bg ?? existing?.name_bg,
    });
    const finalImage = !isBlank(image_url) ? image_url : existing?.image_url || null;

    db.prepare(
      "UPDATE categories SET name = ?, name_en = ?, name_bg = ?, image_url = ? WHERE id = ?",
    ).run(baseName, nameTr.en, nameTr.bg, finalImage, id);
    res.json(toJSON({ id, name: baseName, name_en: nameTr.en, name_bg: nameTr.bg, image_url: finalImage }));
  });

  app.delete("/api/categories/:id(\\d+)", (req, res) => {
    db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.put("/api/categories/reorder", (req, res) => {
    const { ids } = req.body;
    const update = db.prepare(
      "UPDATE categories SET sort_order = ? WHERE id = ?",
    );
    const transaction = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => update.run(index, id));
    });
    transaction(ids);
    res.json({ success: true });
  });

  // ─── PRODUCTS ──────────────────────────────────────────────────────────────

  app.post("/api/products", async (req, res) => {
    try {
      const {
        category_id,
        name,
        name_en,
        name_bg,
        price,
        description,
        description_en,
        description_bg,
        image_url,
        additions,
        is_available,
        tags,
        allergens,
        calories,
        is_featured,
        is_new,
      } = req.body;

      const nameTr = await ensureTranslations(String(name ?? ""), {
        en: name_en,
        bg: name_bg,
      });
      const descBase = String(description ?? "");
      const descTr = descBase.trim()
        ? await ensureTranslations(descBase, {
            en: description_en,
            bg: description_bg,
          })
        : { en: description_en || null, bg: description_bg || null };

      const result = db
        .prepare(
          `INSERT INTO products
          (category_id, name, name_en, name_bg, price, description, description_en, description_bg,
           image_url, is_available, tags, allergens, calories, is_featured, is_new)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          category_id,
          name,
          nameTr.en,
          nameTr.bg,
          price,
          descBase,
          descTr.en,
          descTr.bg,
          image_url || null,
          is_available ?? 1,
          tags || null,
          allergens || null,
          calories || null,
          is_featured ?? 0,
          is_new ?? 0,
        );

      const productId = result.lastInsertRowid;

      if (additions && Array.isArray(additions)) {
        const insertAddition = db.prepare(
          "INSERT INTO additions (product_id, name, name_en, name_bg, price) VALUES (?, ?, ?, ?, ?)",
        );
        for (const add of additions) {
          const addName = String(add?.name ?? "");
          const addTr = await ensureTranslations(addName, {
            en: add?.name_en,
            bg: add?.name_bg,
          });
          insertAddition.run(
            productId,
            addName,
            addTr.en,
            addTr.bg,
            add.price,
          );
        }
      }

      const savedAdditions = db
        .prepare("SELECT * FROM additions WHERE product_id = ?")
        .all(productId);
      res.json(
        toJSON({
          id: productId,
          category_id,
          name,
          name_en: nameTr.en,
          name_bg: nameTr.bg,
          price,
          description: descBase,
          description_en: descTr.en,
          description_bg: descTr.bg,
          image_url,
          is_available: is_available ?? 1,
          tags,
          allergens,
          calories,
          is_featured: is_featured ?? 0,
          is_new: is_new ?? 0,
          additions: savedAdditions,
        }),
      );
    } catch (error: any) {
      console.error("Error adding product:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/products/:id(\\d+)", async (req, res) => {
    try {
      const {
        name,
        name_en,
        name_bg,
        price,
        description,
        description_en,
        description_bg,
        image_url,
        additions,
        is_available,
        tags,
        allergens,
        calories,
        is_featured,
        is_new,
      } = req.body;
      const productId = req.params.id;

      const existing = db
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(productId) as any;

      const baseName = !isBlank(name) ? String(name) : String(existing?.name ?? "");
      const baseDesc = !isBlank(description)
        ? String(description)
        : String(existing?.description ?? "");

      const nameTr = await ensureTranslations(baseName, {
        en: name_en ?? existing?.name_en,
        bg: name_bg ?? existing?.name_bg,
      });
      const descTr = baseDesc.trim()
        ? await ensureTranslations(baseDesc, {
            en: description_en ?? existing?.description_en,
            bg: description_bg ?? existing?.description_bg,
          })
        : {
            en: (description_en ?? existing?.description_en) || null,
            bg: (description_bg ?? existing?.description_bg) || null,
          };

      db.prepare(
        `UPDATE products SET
          name = ?, name_en = ?, name_bg = ?, price = ?,
          description = ?, description_en = ?, description_bg = ?,
          image_url = ?, is_available = ?, tags = ?, allergens = ?,
          calories = ?, is_featured = ?, is_new = ?
         WHERE id = ?`,
      ).run(
        baseName,
        nameTr.en,
        nameTr.bg,
        price,
        baseDesc,
        descTr.en,
        descTr.bg,
        image_url || null,
        is_available ?? 1,
        tags || null,
        allergens || null,
        calories || null,
        is_featured ?? 0,
        is_new ?? 0,
        productId,
      );

      db.prepare("DELETE FROM additions WHERE product_id = ?").run(productId);
      if (additions && Array.isArray(additions)) {
        const insertAddition = db.prepare(
          "INSERT INTO additions (product_id, name, name_en, name_bg, price) VALUES (?, ?, ?, ?, ?)",
        );
        for (const add of additions) {
          const addName = String(add?.name ?? "");
          const addTr = await ensureTranslations(addName, {
            en: add?.name_en,
            bg: add?.name_bg,
          });
          insertAddition.run(
            productId,
            addName,
            addTr.en,
            addTr.bg,
            add.price,
          );
        }
      }

      const savedAdditions = db
        .prepare("SELECT * FROM additions WHERE product_id = ?")
        .all(productId);
      res.json(
        toJSON({
          id: productId,
          name: baseName,
          name_en: nameTr.en,
          name_bg: nameTr.bg,
          price,
          description: baseDesc,
          description_en: descTr.en,
          description_bg: descTr.bg,
          image_url,
          is_available: is_available ?? 1,
          tags,
          allergens,
          calories,
          is_featured: is_featured ?? 0,
          is_new: is_new ?? 0,
          additions: savedAdditions,
        }),
      );
    } catch (error: any) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle product availability
  app.patch("/api/products/:id(\\d+)/availability", (req, res) => {
    try {
      const { is_available } = req.body;
      const productId = req.params.id;
      db.prepare("UPDATE products SET is_available = ? WHERE id = ?").run(
        is_available ? 1 : 0,
        productId,
      );
      res.json({ success: true, id: productId, is_available });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/products/:id(\\d+)", (req, res) => {
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.put("/api/products/reorder", (req, res) => {
    const { ids } = req.body;
    const update = db.prepare(
      "UPDATE products SET sort_order = ? WHERE id = ?",
    );
    const transaction = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => update.run(index, id));
    });
    transaction(ids);
    res.json({ success: true });
  });

  // ─── BULK IMPORT ───────────────────────────────────────────────────────────

  app.post("/api/categories/:categoryId/products/bulk", async (req, res) => {
    const { categoryId } = req.params;
    const { products } = req.body;

    const insertProduct = db.prepare(
      `INSERT INTO products
        (category_id, name, name_en, name_bg, price, description, description_en, description_bg,
         image_url, sort_order, is_available, tags, allergens, calories, is_featured, is_new)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAddition = db.prepare(
      "INSERT INTO additions (product_id, name, name_en, name_bg, price) VALUES (?, ?, ?, ?, ?)",
    );

    const transaction = db.transaction((productList: any[]) => {
      const maxOrderRow = db
        .prepare(
          "SELECT MAX(sort_order) as maxOrder FROM products WHERE category_id = ?",
        )
        .get(categoryId) as { maxOrder: number | bigint };
      let currentSortOrder =
        (typeof maxOrderRow?.maxOrder === "bigint"
          ? Number(maxOrderRow.maxOrder)
          : maxOrderRow?.maxOrder || 0) + 1;

      for (const prod of productList) {
        const result = insertProduct.run(
          categoryId,
          prod.name,
          prod.name_en || null,
          prod.name_bg || null,
          prod.price || 0,
          prod.description || "",
          prod.description_en || null,
          prod.description_bg || null,
          prod.image_url || null,
          currentSortOrder++,
          1,
          null,
          null,
          null,
          0,
          0,
        );

        const productId = result.lastInsertRowid;
        if (prod.additions && Array.isArray(prod.additions)) {
          for (const add of prod.additions) {
            insertAddition.run(
              productId,
              add.name,
              add.name_en || null,
              add.name_bg || null,
              add.price || 0,
            );
          }
        }
      }
    });

    try {
      const enriched = [];
      for (const p of products || []) {
        const baseName = String(p?.name ?? "");
        const baseDesc = String(p?.description ?? "");

        const nameTr = await ensureTranslations(baseName, {
          en: p?.name_en,
          bg: p?.name_bg,
        });
        const descTr = baseDesc.trim()
          ? await ensureTranslations(baseDesc, {
              en: p?.description_en,
              bg: p?.description_bg,
            })
          : { en: p?.description_en || null, bg: p?.description_bg || null };

        const additionsList = Array.isArray(p?.additions) ? p.additions : [];
        const newAdds = [];
        for (const a of additionsList) {
          const addName = String(a?.name ?? "");
          const addTr = await ensureTranslations(addName, {
            en: a?.name_en,
            bg: a?.name_bg,
          });
          newAdds.push({
            ...a,
            name: addName,
            name_en: addTr.en,
            name_bg: addTr.bg,
          });
        }

        enriched.push({
          ...p,
          name: baseName,
          name_en: nameTr.en,
          name_bg: nameTr.bg,
          description: baseDesc,
          description_en: descTr.en,
          description_bg: descTr.bg,
          additions: newAdds,
        });
      }

      transaction(enriched);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Bulk import error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── CSV EXPORT ────────────────────────────────────────────────────────────

  app.get("/api/categories/:categoryId/products/export", (req, res) => {
    const { categoryId } = req.params;

    const category = db
      .prepare("SELECT * FROM categories WHERE id = ?")
      .get(categoryId) as any;
    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const escapeCsv = (val: any, delimiter: string) => {
      const s = val === null || val === undefined ? "" : String(val);
      const needsQuotes =
        s.includes('"') ||
        s.includes(delimiter) ||
        s.includes("\n") ||
        s.includes("\r");
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const safeFilenameBase =
      String(category.name || `category-${category.id}`)
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ") || `category-${category.id}`;

    const delimiter = ";";
    const products = db
      .prepare(
        "SELECT * FROM products WHERE category_id = ? ORDER BY sort_order",
      )
      .all(categoryId) as any[];
    const getAdditions = db.prepare(
      "SELECT * FROM additions WHERE product_id = ? ORDER BY id",
    );

    const lines: string[] = [];
    lines.push('sep=,');
    lines.push('title,title_en,title_bg,description,description_en,description_bg,price,image,additions');

    for (const p of products) {
      const additions = getAdditions.all(p.id) as any[];
      const additionsStr = (additions || [])
        .map((a) => {
          const hasTranslations =
            (a.name_en && String(a.name_en).trim() !== "") ||
            (a.name_bg && String(a.name_bg).trim() !== "");
          const namePart = hasTranslations
            ? `${a.name}|${a.name_en || ""}|${a.name_bg || ""}`
            : `${a.name}`;
          return `${namePart}:${a.price}`;
        })
        .join(';');
      lines.push([
        escapeCsv(p.name, delimiter),
        escapeCsv(p.name_en || '', delimiter),
        escapeCsv(p.name_bg || '', delimiter),
        escapeCsv(p.description || '', delimiter),
        escapeCsv(p.description_en || '', delimiter),
        escapeCsv(p.description_bg || '', delimiter),
        escapeCsv(p.price ?? 0, delimiter),
        escapeCsv(p.image_url || '', delimiter),
        escapeCsv(additionsStr, delimiter),
      ].join(delimiter));
    }

    const bom = "\uFEFF";
    const csv = bom + lines.join("\r\n");

    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilenameBase}.csv"`,
    );
    res.send(Buffer.from(csv, "utf8"));
  });

  // ─── REVIEWS ───────────────────────────────────────────────────────────────

  app.get("/api/reviews/:restaurantId", (req, res) => {
    try {
      const { restaurantId } = req.params;
      const reviews = db
        .prepare(
          "SELECT * FROM reviews WHERE restaurant_id = ? ORDER BY created_at DESC",
        )
        .all(restaurantId);
      res.json(toJSON(reviews));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/reviews/:restaurantId", (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { author_name, rating, comment } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        res.status(400).json({ error: "Rating must be between 1 and 5" });
        return;
      }
      const result = db
        .prepare(
          "INSERT INTO reviews (restaurant_id, author_name, rating, comment) VALUES (?, ?, ?, ?)",
        )
        .run(restaurantId, author_name || "Anonymous", rating, comment || "");
      const review = db
        .prepare("SELECT * FROM reviews WHERE id = ?")
        .get(result.lastInsertRowid);
      res.json(toJSON(review));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── CATCH-ALL API 404 ─────────────────────────────────────────────────────

  app.use("/api", (req, res) => {
    res
      .status(404)
      .json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // ─── VITE / STATIC ────────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🍽️  Menu QR Server running on http://localhost:${PORT}\n`);
  });
}

startServer().catch(console.error);
