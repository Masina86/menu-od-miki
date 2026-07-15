import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import sharp from "sharp";

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
    console.log(
      `[db] migrated slug to dismak-oil (${slugMigration.changes} row(s))`,
    );
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
tryAlter("ALTER TABLE restaurants ADD COLUMN logo_size INTEGER DEFAULT 100");
tryAlter("ALTER TABLE restaurants ADD COLUMN logo_fit TEXT DEFAULT 'contain'");
tryAlter(
  "ALTER TABLE restaurants ADD COLUMN logo_position_x INTEGER DEFAULT 50",
);
tryAlter(
  "ALTER TABLE restaurants ADD COLUMN logo_position_y INTEGER DEFAULT 50",
);
tryAlter("ALTER TABLE restaurants ADD COLUMN phone TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN address TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN wifi_password TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN opening_hours TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN facebook_url TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN instagram_url TEXT");
tryAlter(
  "ALTER TABLE restaurants ADD COLUMN popular_badges_enabled INTEGER DEFAULT 1",
);
tryAlter("ALTER TABLE restaurants ADD COLUMN popular_category_id INTEGER");
tryAlter("ALTER TABLE restaurants ADD COLUMN popular_category_period_key TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN popular_category_updated_at TEXT");
tryAlter(
  "ALTER TABLE restaurants ADD COLUMN reviews_enabled INTEGER DEFAULT 1",
);
tryAlter(
  "ALTER TABLE restaurants ADD COLUMN takeover_enabled INTEGER DEFAULT 0",
);
tryAlter("ALTER TABLE restaurants ADD COLUMN takeover_title TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN takeover_message TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN takeover_price TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN takeover_allergens TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN takeover_image_url TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN footer_text TEXT");
tryAlter("ALTER TABLE restaurants ADD COLUMN footer_link TEXT");

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

db.exec(`
  CREATE TABLE IF NOT EXISTS category_view_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    period_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_category_view_events_period
    ON category_view_events (restaurant_id, period_key, category_id);

  CREATE TABLE IF NOT EXISTS menu_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    month_key TEXT NOT NULL,
    scan_count INTEGER DEFAULT 1,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    UNIQUE (restaurant_id, month_key)
  );
`);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const ai = GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    : null;
  const translationCache = new Map<string, string>();
  const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    (process.env.NODE_ENV === "production" ? "" : "admin");
  const ADMIN_SESSION_SECRET =
    process.env.ADMIN_SESSION_SECRET ||
    ADMIN_PASSWORD ||
    "dev-admin-session-secret";
  const ADMIN_COOKIE = "menu_admin_session";
  const ADMIN_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const POPULARITY_TIME_ZONE =
    process.env.POPULARITY_TIME_ZONE || "Europe/Skopje";
  const POPULARITY_CUTOFF_HOUR = 3;

  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      process.env.NODE_ENV === "production"
        ? "[auth] ADMIN_PASSWORD is not set. Admin login is disabled."
        : "[auth] ADMIN_PASSWORD is not set. Using development password: admin",
    );
  }

  const isBlank = (v: any) => v == null || String(v).trim() === "";
  const optionalText = (v: any) => (isBlank(v) ? null : String(v).trim());
  const clampInteger = (
    value: any,
    min: number,
    max: number,
    fallback: number,
  ) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  };
  const normalizeLogoFit = (value: any) =>
    value === "cover" ? "cover" : "contain";

  const localDateTimeParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: POPULARITY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: string) =>
      Number(parts.find((item) => item.type === type)?.value || 0);
    return {
      year: part("year"),
      month: part("month"),
      day: part("day"),
      hour: part("hour"),
      minute: part("minute"),
      second: part("second"),
    };
  };

  const formatPeriodKey = (date: Date) => {
    const { year, month, day } = localDateTimeParts(date);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const formatMonthKey = (date: Date) => {
    const { year, month } = localDateTimeParts(date);
    return `${year}-${String(month).padStart(2, "0")}`;
  };

  const getCurrentPeriodKey = (date = new Date()) => {
    const local = localDateTimeParts(date);
    if (local.hour >= POPULARITY_CUTOFF_HOUR) return formatPeriodKey(date);
    return formatPeriodKey(new Date(date.getTime() - 24 * 60 * 60 * 1000));
  };

  const getPreviousPeriodKey = (periodKey: string) => {
    const periodNoon = new Date(`${periodKey}T12:00:00Z`);
    return formatPeriodKey(
      new Date(periodNoon.getTime() - 24 * 60 * 60 * 1000),
    );
  };

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
    const en = !isBlank(current.en)
      ? String(current.en)
      : await translateText(sourceText, "EN");
    const bg = !isBlank(current.bg)
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

  const parseCookies = (cookieHeader?: string) => {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(";").forEach((part) => {
      const [rawName, ...rawValue] = part.trim().split("=");
      if (!rawName) return;
      cookies[rawName] = decodeURIComponent(rawValue.join("=") || "");
    });
    return cookies;
  };

  const signSession = (payload: string) =>
    crypto
      .createHmac("sha256", ADMIN_SESSION_SECRET)
      .update(payload)
      .digest("base64url");

  const createAdminSession = () => {
    const payload = Buffer.from(
      JSON.stringify({
        role: "admin",
        exp: Date.now() + ADMIN_SESSION_MAX_AGE_MS,
      }),
    ).toString("base64url");
    return `${payload}.${signSession(payload)}`;
  };

  const isAdminSessionValid = (cookieHeader?: string) => {
    const token = parseCookies(cookieHeader)[ADMIN_COOKIE];
    if (!token) return false;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;

    const expected = signSession(payload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return false;
    }

    try {
      const session = JSON.parse(Buffer.from(payload, "base64url").toString());
      return session.role === "admin" && Number(session.exp) > Date.now();
    } catch {
      return false;
    }
  };

  const setAdminCookie = (res: any, token: string) => {
    res.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
        ADMIN_SESSION_MAX_AGE_MS / 1000,
      )}`,
    );
  };

  const clearAdminCookie = (res: any) => {
    res.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    );
  };

  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    if (!ADMIN_PASSWORD) {
      return res.status(503).json({ error: "Admin login is not configured." });
    }

    const submitted = Buffer.from(String(password || ""));
    const expected = Buffer.from(ADMIN_PASSWORD);
    const isValid =
      submitted.length === expected.length &&
      crypto.timingSafeEqual(submitted, expected);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid password." });
    }

    setAdminCookie(res, createAdminSession());
    res.json({ authenticated: true });
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearAdminCookie(res);
    res.json({ authenticated: false });
  });

  app.get("/api/auth/session", (req, res) => {
    res.json({ authenticated: isAdminSessionValid(req.headers.cookie) });
  });

  app.use("/api", (req, res, next) => {
    const publicApi =
      req.path.startsWith("/auth/") ||
      req.path.startsWith("/public-menu/") ||
      req.path.startsWith("/popularity/category-view") ||
      (req.method === "GET" && req.path.startsWith("/images/")) ||
      (req.path.startsWith("/reviews/") && req.method !== "DELETE");

    if (publicApi || isAdminSessionValid(req.headers.cookie)) {
      return next();
    }

    res.status(401).json({ error: "Admin login required." });
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

  const parseDataImage = (imageUrl: string) => {
    const match = imageUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) return null;
    const contentType = match[1] || "application/octet-stream";
    const isBase64 = !!match[2];
    const raw = match[3] || "";
    return {
      contentType,
      buffer: isBase64
        ? Buffer.from(raw, "base64")
        : Buffer.from(decodeURIComponent(raw)),
    };
  };

  const resolveImageBuffer = async (
    imageUrl: string | null | undefined,
  ): Promise<Buffer> => {
    if (!imageUrl) throw new Error("Image is required.");

    if (imageUrl.startsWith("data:")) {
      const parsed = parseDataImage(imageUrl);
      if (!parsed || !parsed.contentType.startsWith("image/")) {
        throw new Error("Image must be a valid image data URL.");
      }
      return parsed.buffer;
    }

    const url = new URL(imageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Image URL must use http or https.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Could not download image (HTTP ${response.status}).`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType && !contentType.startsWith("image/")) {
        throw new Error("URL did not return an image.");
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 12 * 1024 * 1024) {
        throw new Error("Image is too large to process.");
      }
      return bytes;
    } finally {
      clearTimeout(timeout);
    }
  };

  const isTransparentBackgroundCandidate = (
    r: number,
    g: number,
    b: number,
    a: number,
    edgeColor: { r: number; g: number; b: number; count: number },
  ) => {
    if (a <= 8) return true;
    const brightness = (r + g + b) / 3;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const edgeBrightness = (edgeColor.r + edgeColor.g + edgeColor.b) / 3;
    const edgeSaturation =
      Math.max(edgeColor.r, edgeColor.g, edgeColor.b) -
      Math.min(edgeColor.r, edgeColor.g, edgeColor.b);
    const distance = Math.hypot(
      r - edgeColor.r,
      g - edgeColor.g,
      b - edgeColor.b,
    );
    const channelDistance = Math.max(
      Math.abs(r - edgeColor.r),
      Math.abs(g - edgeColor.g),
      Math.abs(b - edgeColor.b),
    );
    const brightnessDistance = Math.abs(brightness - edgeBrightness);
    const tolerance = edgeBrightness < 70 ? 54 : edgeBrightness > 210 ? 66 : 82;

    return (
      distance <= tolerance ||
      (channelDistance <= 48 && brightnessDistance <= 64) ||
      (edgeBrightness >= 230 &&
        edgeSaturation <= 36 &&
        brightness >= 232 &&
        saturation <= 42)
    );
  };

  const buildEdgePalette = (
    data: Buffer,
    width: number,
    height: number,
    channels: number,
  ) => {
    const buckets = new Map<
      string,
      { r: number; g: number; b: number; count: number }
    >();
    const addSample = (x: number, y: number) => {
      const offset = (y * width + x) * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const key = `${Math.round(r / 24)}:${Math.round(g / 24)}:${Math.round(b / 24)}`;
      const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
      buckets.set(key, bucket);
    };

    for (let x = 0; x < width; x += 1) {
      addSample(x, 0);
      addSample(x, height - 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
      addSample(0, y);
      addSample(width - 1, y);
    }

    return [...buckets.values()]
      .filter((bucket) => bucket.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 18)
      .map((bucket) => ({
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count,
        count: bucket.count,
      }));
  };

  const makeBackgroundTransparent = async (input: Buffer) => {
    const { data, info } = await sharp(input, { limitInputPixels: 36_000_000 })
      .rotate()
      .resize({
        width: 1400,
        height: 1400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const pixelCount = width * height;
    const background = new Uint8Array(pixelCount);
    const queue = new Uint32Array(pixelCount);
    const edgePalette = buildEdgePalette(data, width, height, channels);

    const fillBackgroundCluster = (edgeColor: {
      r: number;
      g: number;
      b: number;
      count: number;
    }) => {
      const visited = new Uint8Array(pixelCount);
      let head = 0;
      let tail = 0;
      const enqueue = (x: number, y: number) => {
        const idx = y * width + x;
        if (visited[idx] || background[idx]) return;
        visited[idx] = 1;
        const offset = idx * channels;
        if (
          !isTransparentBackgroundCandidate(
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
            edgeColor,
          )
        ) {
          return;
        }
        background[idx] = 1;
        queue[tail] = idx;
        tail += 1;
      };

      for (let x = 0; x < width; x += 1) {
        enqueue(x, 0);
        enqueue(x, height - 1);
      }
      for (let y = 1; y < height - 1; y += 1) {
        enqueue(0, y);
        enqueue(width - 1, y);
      }

      while (head < tail) {
        const idx = queue[head];
        head += 1;
        const x = idx % width;
        const y = Math.floor(idx / width);
        if (x > 0) enqueue(x - 1, y);
        if (x < width - 1) enqueue(x + 1, y);
        if (y > 0) enqueue(x, y - 1);
        if (y < height - 1) enqueue(x, y + 1);
      }
    };

    for (const edgeColor of edgePalette) {
      fillBackgroundCluster(edgeColor);
    }

    const fillAlreadyTransparentEdges = () => {
      let head = 0;
      let tail = 0;
      const enqueue = (x: number, y: number) => {
        const idx = y * width + x;
        if (background[idx]) return;
        const offset = idx * channels;
        if (data[offset + 3] > 8) return;
        background[idx] = 1;
        queue[tail] = idx;
        tail += 1;
      };

      for (let x = 0; x < width; x += 1) {
        enqueue(x, 0);
        enqueue(x, height - 1);
      }
      for (let y = 1; y < height - 1; y += 1) {
        enqueue(0, y);
        enqueue(width - 1, y);
      }

      while (head < tail) {
        const idx = queue[head];
        head += 1;
        const x = idx % width;
        const y = Math.floor(idx / width);
        if (x > 0) enqueue(x - 1, y);
        if (x < width - 1) enqueue(x + 1, y);
        if (y > 0) enqueue(x, y - 1);
        if (y < height - 1) enqueue(x, y + 1);
      }
    };

    fillAlreadyTransparentEdges();

    for (let idx = 0; idx < pixelCount; idx += 1) {
      const offset = idx * channels;
      if (background[idx]) {
        data[offset + 3] = 0;
        continue;
      }

      const x = idx % width;
      const y = Math.floor(idx / width);
      let neighboringBackground = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          neighboringBackground += background[ny * width + nx];
        }
      }
      if (neighboringBackground > 0) {
        data[offset + 3] = Math.max(
          120,
          data[offset + 3] - neighboringBackground * 18,
        );
      }
    }

    return sharp(data, { raw: { width, height, channels } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  };

  const getStoredImage = (type: string, id: any) => {
    if (type === "product") {
      const row = db
        .prepare("SELECT image_url FROM products WHERE id = ?")
        .get(id) as any;
      return row?.image_url as string | null | undefined;
    }
    if (type === "category") {
      const row = db
        .prepare("SELECT image_url FROM categories WHERE id = ?")
        .get(id) as any;
      return row?.image_url as string | null | undefined;
    }
    throw new Error("Unsupported image type.");
  };

  const imageVersion = (imageUrl: string) =>
    crypto.createHash("sha1").update(imageUrl).digest("hex").slice(0, 12);

  const compactImageUrl = (
    type: "categories" | "products" | "restaurants",
    id: number,
    imageUrl: string | null | undefined,
    field = "image",
  ) => {
    if (!imageUrl) return imageUrl;
    if (!imageUrl.startsWith("data:") || imageUrl.length < 2048)
      return imageUrl;
    if (type === "categories" && imageUrl.length > 500_000) return null;
    const version = imageVersion(imageUrl);
    return type === "restaurants"
      ? `/api/images/restaurants/${id}/${field}?v=${version}`
      : `/api/images/${type}/${id}?v=${version}`;
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
        logo_size: 100,
        logo_fit: "contain",
        logo_position_x: 50,
        logo_position_y: 50,
        phone: null,
        address: null,
        wifi_password: null,
        opening_hours: null,
        facebook_url: null,
        instagram_url: null,
        popular_badges_enabled: 1,
        popular_category_id: null,
        popular_category_period_key: null,
        popular_category_updated_at: null,
      };
    }

    return restaurant;
  };

  const getCategoryById = (categoryId: number, restaurantId: number) =>
    db
      .prepare(
        "SELECT id, name, name_en, name_bg FROM categories WHERE id = ? AND restaurant_id = ?",
      )
      .get(categoryId, restaurantId) as any;

  const getPopularCategoryWinner = (restaurantId: number, periodKey: string) =>
    db
      .prepare(
        `SELECT
           c.id,
           c.name,
           c.name_en,
           c.name_bg,
           COUNT(e.id) AS views
         FROM category_view_events e
         JOIN categories c ON c.id = e.category_id
         WHERE e.restaurant_id = ?
           AND e.period_key = ?
         GROUP BY c.id
         ORDER BY views DESC, c.sort_order ASC, c.id ASC
         LIMIT 1`,
      )
      .get(restaurantId, periodKey) as any;

  const refreshPopularCategory = (restaurant: any) => {
    const restaurantId = Number(restaurant.id);
    const currentPeriodKey = getCurrentPeriodKey();
    const targetPopularPeriodKey = getPreviousPeriodKey(currentPeriodKey);

    if (restaurant.popular_category_period_key === targetPopularPeriodKey) {
      return restaurant;
    }

    const winner = getPopularCategoryWinner(
      restaurantId,
      targetPopularPeriodKey,
    );
    db.prepare(
      `UPDATE restaurants
       SET popular_category_id = ?,
           popular_category_period_key = ?,
           popular_category_updated_at = ?
       WHERE id = ?`,
    ).run(
      winner?.id || null,
      targetPopularPeriodKey,
      new Date().toISOString(),
      restaurantId,
    );

    return {
      ...restaurant,
      popular_category_id: winner?.id || null,
      popular_category_period_key: targetPopularPeriodKey,
      popular_category_updated_at: new Date().toISOString(),
    };
  };

  const getPopularCategoryStats = (restaurantId: number) => {
    const restaurant = refreshPopularCategory(
      db
        .prepare("SELECT * FROM restaurants WHERE id = ?")
        .get(restaurantId) as any,
    );
    const currentPeriodKey = getCurrentPeriodKey();
    const previousPeriodKey = getPreviousPeriodKey(currentPeriodKey);
    const activeCategory = restaurant.popular_category_id
      ? getCategoryById(Number(restaurant.popular_category_id), restaurantId)
      : null;
    const currentLeader = getPopularCategoryWinner(
      restaurantId,
      currentPeriodKey,
    );
    const previousWinner = getPopularCategoryWinner(
      restaurantId,
      previousPeriodKey,
    );
    const currentViews = db
      .prepare(
        `SELECT COUNT(*) AS views
         FROM category_view_events
         WHERE restaurant_id = ? AND period_key = ?`,
      )
      .get(restaurantId, currentPeriodKey) as any;

    return {
      enabled: restaurant.popular_badges_enabled !== 0,
      current_period_key: currentPeriodKey,
      popular_period_key: previousPeriodKey,
      cutoff_hour: POPULARITY_CUTOFF_HOUR,
      time_zone: POPULARITY_TIME_ZONE,
      active_category: activeCategory,
      current_leader: currentLeader || null,
      previous_winner: previousWinner || null,
      current_period_views: Number(currentViews?.views || 0),
    };
  };

  const applyPopularCategory = (menu: any[], restaurant: any) => {
    if (restaurant.popular_badges_enabled === 0) return menu;
    const popularCategoryId = Number(restaurant.popular_category_id || 0);
    const markCategory = (category: any): any => ({
      ...category,
      is_popular: category.id === popularCategoryId ? 1 : 0,
      subcategories: (category.subcategories || []).map(markCategory),
    });
    return menu.map(markCategory);
  };

  const buildMenu = (restaurantId: string | number, compactImages = false) => {
    const allCategories = db
      .prepare(
        "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order, id",
      )
      .all(restaurantId) as any[];

    const categoryIds = allCategories.map((cat) => cat.id);
    const products = categoryIds.length
      ? (db
          .prepare(
            `SELECT * FROM products
             WHERE category_id IN (${categoryIds.map(() => "?").join(",")})
             ORDER BY category_id, sort_order, id`,
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
      (a.sort_order || 0) - (b.sort_order || 0) || (a.id || 0) - (b.id || 0);
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

    // Fetch current month's scans
    try {
      const scanRow = db.prepare("SELECT scan_count FROM menu_scans WHERE restaurant_id = ? AND month_key = ?").get(restaurant.id, formatMonthKey(new Date())) as any;
      restaurant.current_month_scans = scanRow ? scanRow.scan_count : 0;
    } catch(e) {
      console.error("Error fetching scan count", e);
      restaurant.current_month_scans = 0;
    }

    res.json(toJSON(restaurant));
  });

  // Update Restaurant Slug
  app.put("/api/restaurant/:id/slug", (req, res) => {
    try {
      const id = Number(req.params.id);
      const { slug } = req.body;
      if (isNaN(id)) throw new Error("Invalid restaurant ID");
      if (!slug || typeof slug !== "string") throw new Error("Invalid slug");
      const existing = db
        .prepare("SELECT id FROM restaurants WHERE slug = ? AND id != ?")
        .get(slug, id);
      if (existing)
        throw new Error("Slug already in use by another restaurant");
      const result = db
        .prepare("UPDATE restaurants SET slug = ? WHERE id = ?")
        .run(slug, id);
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
        logo_size,
        logo_fit,
        logo_position_x,
        logo_position_y,
        phone,
        address,
        wifi_password,
        opening_hours,
        facebook_url,
        instagram_url,
        takeover_enabled,
        takeover_title,
        takeover_message,
        takeover_price,
        takeover_allergens,
        takeover_image_url,
        footer_text,
        footer_link,
      } = req.body;
      const id = Number(req.params.id);

      if (isNaN(id)) throw new Error("Invalid restaurant ID");

      const result = db
        .prepare(
          "UPDATE restaurants SET name = ?, background_url = ?, logo_url = ?, logo_size = ?, logo_fit = ?, logo_position_x = ?, logo_position_y = ?, phone = ?, address = ?, wifi_password = ?, opening_hours = ?, facebook_url = ?, instagram_url = ?, takeover_enabled = ?, takeover_title = ?, takeover_message = ?, takeover_price = ?, takeover_allergens = ?, takeover_image_url = ?, footer_text = ?, footer_link = ? WHERE id = ?",
        )
        .run(
          String(name ?? "").trim(),
          optionalText(background_url),
          optionalText(logo_url),
          clampInteger(logo_size, 60, 180, 100),
          normalizeLogoFit(logo_fit),
          clampInteger(logo_position_x, 0, 100, 50),
          clampInteger(logo_position_y, 0, 100, 50),
          optionalText(phone),
          optionalText(address),
          optionalText(wifi_password),
          optionalText(opening_hours),
          optionalText(facebook_url),
          optionalText(instagram_url),
          Number(takeover_enabled ?? 0),
          optionalText(takeover_title),
          optionalText(takeover_message),
          optionalText(takeover_price),
          optionalText(takeover_allergens),
          optionalText(takeover_image_url),
          optionalText(footer_text),
          optionalText(footer_link),
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
    const restaurant = refreshPopularCategory(
      getOrCreateRestaurantBySlug(req.params.slug),
    );

    // Track scan for the current month
    try {
      db.prepare(
        `INSERT INTO menu_scans (restaurant_id, month_key, scan_count) 
         VALUES (?, ?, 1) 
         ON CONFLICT(restaurant_id, month_key) DO UPDATE SET scan_count = scan_count + 1`,
      ).run(restaurant.id, formatMonthKey(new Date()));
    } catch (e) {
      console.error("[api] Error tracking scan:", e);
    }

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
    const menu = applyPopularCategory(
      buildMenu(restaurant.id, true),
      restaurant,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(toJSON({ restaurant: publicRestaurant, menu }));
  });

  app.post("/api/popularity/category-view", (req, res) => {
    try {
      const restaurantId = Number(req.body?.restaurant_id);
      const categoryId = Number(req.body?.category_id);
      if (!Number.isFinite(restaurantId) || !Number.isFinite(categoryId)) {
        return res.status(400).json({ error: "Invalid category view." });
      }
      const category = getCategoryById(categoryId, restaurantId);
      if (!category)
        return res.status(404).json({ error: "Category not found." });

      db.prepare(
        `INSERT INTO category_view_events
           (restaurant_id, category_id, period_key, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        restaurantId,
        categoryId,
        getCurrentPeriodKey(),
        new Date().toISOString(),
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("[api] Error tracking category view:", error);
      res.status(500).json({ error: error.message || "Could not track view." });
    }
  });

  app.get("/api/popularity/category/:restaurantId", (req, res) => {
    try {
      const restaurantId = Number(req.params.restaurantId);
      if (!Number.isFinite(restaurantId)) {
        return res.status(400).json({ error: "Invalid restaurant ID." });
      }
      const restaurant = db
        .prepare("SELECT id FROM restaurants WHERE id = ?")
        .get(restaurantId);
      if (!restaurant)
        return res.status(404).json({ error: "Restaurant not found." });
      res.json(toJSON(getPopularCategoryStats(restaurantId)));
    } catch (error: any) {
      console.error("[api] Error loading category popularity:", error);
      res
        .status(500)
        .json({ error: error.message || "Could not load popularity." });
    }
  });

  app.put("/api/restaurant/:id/popular-badges", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new Error("Invalid restaurant ID");
      const enabled = req.body?.enabled ? 1 : 0;
      const result = db
        .prepare(
          "UPDATE restaurants SET popular_badges_enabled = ? WHERE id = ?",
        )
        .run(enabled, id);
      if (result.changes === 0) {
        return res.status(404).json({ error: "Restaurant not found." });
      }
      res.json({ success: true, enabled: enabled === 1 });
    } catch (error: any) {
      console.error("[api] Error updating popular badges setting:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── REVIEWS ───────────────────────────────────────────────────────────────

  // Simple in-memory rate limiter: max 1 review per IP per 60s
  const reviewRateLimit = new Map<string, number>();

  // GET reviews for a restaurant (public)
  app.get("/api/reviews/:restaurantId", (req, res) => {
    try {
      const restaurantId = Number(req.params.restaurantId);
      if (!Number.isFinite(restaurantId)) {
        return res.status(400).json({ error: "Invalid restaurant ID." });
      }
      const restaurant = db
        .prepare("SELECT id, reviews_enabled FROM restaurants WHERE id = ?")
        .get(restaurantId) as any;
      if (!restaurant)
        return res.status(404).json({ error: "Restaurant not found." });
      if (restaurant.reviews_enabled === 0) {
        return res.json({ reviews: [], reviews_enabled: false });
      }
      const reviews = db
        .prepare(
          `SELECT id, author_name, rating, comment, created_at
           FROM reviews
           WHERE restaurant_id = ?
           ORDER BY created_at DESC
           LIMIT 100`,
        )
        .all(restaurantId);
      res.json({ reviews: toJSON(reviews), reviews_enabled: true });
    } catch (error: any) {
      console.error("[api] Error fetching reviews:", error);
      res
        .status(500)
        .json({ error: error.message || "Could not load reviews." });
    }
  });

  // POST a new review (public, rate-limited)
  app.post("/api/reviews/:restaurantId", (req, res) => {
    try {
      const restaurantId = Number(req.params.restaurantId);
      if (!Number.isFinite(restaurantId)) {
        return res.status(400).json({ error: "Invalid restaurant ID." });
      }
      const restaurant = db
        .prepare("SELECT id, reviews_enabled FROM restaurants WHERE id = ?")
        .get(restaurantId) as any;
      if (!restaurant)
        return res.status(404).json({ error: "Restaurant not found." });
      if (restaurant.reviews_enabled === 0) {
        return res
          .status(403)
          .json({ error: "Reviews are disabled for this restaurant." });
      }

      // Rate limiting
      const ip = String(
        req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
      );
      const now = Date.now();
      const lastReview = reviewRateLimit.get(ip);
      if (lastReview && now - lastReview < 60_000) {
        return res
          .status(429)
          .json({
            error: "Please wait a moment before submitting another review.",
          });
      }
      reviewRateLimit.set(ip, now);
      if (reviewRateLimit.size > 5000) {
        reviewRateLimit.forEach((ts, key) => {
          if (now - ts > 60_000) reviewRateLimit.delete(key);
        });
      }

      const { author_name, rating, comment } = req.body;
      const ratingNum = Number(rating);
      if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res
          .status(400)
          .json({ error: "Rating must be between 1 and 5." });
      }
      const trimmedAuthor = String(author_name || "")
        .trim()
        .slice(0, 100);
      const trimmedComment = String(comment || "")
        .trim()
        .slice(0, 1000);

      const result = db
        .prepare(
          `INSERT INTO reviews (restaurant_id, author_name, rating, comment)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          restaurantId,
          trimmedAuthor || "Anonymous",
          ratingNum,
          trimmedComment || null,
        );

      const newReview = db
        .prepare(
          "SELECT id, author_name, rating, comment, created_at FROM reviews WHERE id = ?",
        )
        .get(
          typeof result.lastInsertRowid === "bigint"
            ? Number(result.lastInsertRowid)
            : result.lastInsertRowid,
        );

      res.status(201).json({ review: toJSON(newReview) });
    } catch (error: any) {
      console.error("[api] Error submitting review:", error);
      res
        .status(500)
        .json({ error: error.message || "Could not submit review." });
    }
  });

  // DELETE a review (admin only)
  app.delete("/api/reviews/:restaurantId/:reviewId", (req, res) => {
    try {
      const restaurantId = Number(req.params.restaurantId);
      const reviewId = Number(req.params.reviewId);
      if (!Number.isFinite(restaurantId) || !Number.isFinite(reviewId)) {
        return res.status(400).json({ error: "Invalid IDs." });
      }
      const result = db
        .prepare("DELETE FROM reviews WHERE id = ? AND restaurant_id = ?")
        .run(reviewId, restaurantId);
      if (result.changes === 0) {
        return res.status(404).json({ error: "Review not found." });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[api] Error deleting review:", error);
      res
        .status(500)
        .json({ error: error.message || "Could not delete review." });
    }
  });

  // PUT toggle reviews_enabled (admin only)
  app.put("/api/restaurant/:id/reviews-enabled", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new Error("Invalid restaurant ID");
      const enabled = req.body?.enabled ? 1 : 0;
      const result = db
        .prepare("UPDATE restaurants SET reviews_enabled = ? WHERE id = ?")
        .run(enabled, id);
      if (result.changes === 0) {
        return res.status(404).json({ error: "Restaurant not found." });
      }
      res.json({ success: true, enabled: enabled === 1 });
    } catch (error: any) {
      console.error("[api] Error updating reviews setting:", error);
      res.status(500).json({ error: error.message });
    }
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

  app.post("/api/images/transparent-preview", async (req, res) => {
    try {
      const { image_url, type, id } = req.body || {};
      const source =
        image_url || (type && id ? getStoredImage(type, id) : null);
      const input = await resolveImageBuffer(source);
      const output = await makeBackgroundTransparent(input);
      res.json({
        image_url: `data:image/png;base64,${output.toString("base64")}`,
      });
    } catch (error: any) {
      console.error("Transparent preview error:", error);
      res.status(400).json({
        error: error?.message || "Could not make this image transparent.",
      });
    }
  });

  app.patch("/api/products/:id(\\d+)/image", (req, res) => {
    try {
      const imageUrl = optionalText(req.body?.image_url);
      db.prepare("UPDATE products SET image_url = ? WHERE id = ?").run(
        imageUrl,
        req.params.id,
      );
      res.json(toJSON({ id: Number(req.params.id), image_url: imageUrl }));
    } catch (error: any) {
      console.error("Product image update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/categories/:id(\\d+)/image", (req, res) => {
    try {
      const imageUrl = optionalText(req.body?.image_url);
      db.prepare("UPDATE categories SET image_url = ? WHERE id = ?").run(
        imageUrl,
        req.params.id,
      );
      res.json(toJSON({ id: Number(req.params.id), image_url: imageUrl }));
    } catch (error: any) {
      console.error("Category image update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/menu/:restaurantId", (req, res) => {
    const { restaurantId } = req.params;

    const allCategories = db
      .prepare(
        "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order, id",
      )
      .all(restaurantId) as any[];

    const getProductsForCategory = (categoryId: number) => {
      const products = db
        .prepare(
          "SELECT * FROM products WHERE category_id = ? ORDER BY sort_order, id",
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
      (a.sort_order || 0) - (b.sort_order || 0) || (a.id || 0) - (b.id || 0);
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
    const baseName = !isBlank(name)
      ? String(name)
      : String(existing?.name ?? "");
    const nameTr = await ensureTranslations(baseName, {
      en: name_en ?? existing?.name_en,
      bg: name_bg ?? existing?.name_bg,
    });
    const finalImage = !isBlank(image_url)
      ? image_url
      : existing?.image_url || null;

    db.prepare(
      "UPDATE categories SET name = ?, name_en = ?, name_bg = ?, image_url = ? WHERE id = ?",
    ).run(baseName, nameTr.en, nameTr.bg, finalImage, id);
    res.json(
      toJSON({
        id,
        name: baseName,
        name_en: nameTr.en,
        name_bg: nameTr.bg,
        image_url: finalImage,
      }),
    );
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
          insertAddition.run(productId, addName, addTr.en, addTr.bg, add.price);
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

      const baseName =
        name !== undefined ? String(name) : String(existing?.name ?? "");
      const baseDesc =
        description !== undefined
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
          insertAddition.run(productId, addName, addTr.en, addTr.bg, add.price);
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
    try {
      const { categoryId } = req.params;

      const category = db
        .prepare("SELECT * FROM categories WHERE id = ?")
        .get(categoryId) as any;
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      const escapeDelimited = (val: any, delimiter: string) => {
        const s = val === null || val === undefined ? "" : String(val);
        const needsQuotes =
          s.includes('"') ||
          s.includes(delimiter) ||
          s.includes("\n") ||
          s.includes("\r");
        const escaped = s.replace(/"/g, '""');
        return needsQuotes ? `"${escaped}"` : escaped;
      };

      const escapeTsv = (val: any) =>
        (val === null || val === undefined ? "" : String(val))
          .replace(/\t/g, " ")
          .replace(/\r?\n|\r/g, " ")
          .trim();

      const exportImageValue = (value: any) => {
        const image =
          value === null || value === undefined ? "" : String(value).trim();
        return image.startsWith("data:image/") ? "" : image;
      };

      const sanitizeAsciiFilename = (filename: string) =>
        filename
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\x20-\x7e]+/g, "")
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, " ")
          .trim();

      const encodeHeaderFilename = (filename: string) =>
        encodeURIComponent(filename)
          .replace(
            /['()]/g,
            (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
          )
          .replace(/\*/g, "%2A");

      const filenameBase =
        String(category.name || `category-${category.id}`)
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, " ") || `category-${category.id}`;
      const asciiFilenameBase =
        sanitizeAsciiFilename(filenameBase) || `category-${category.id}`;
      const filename = `${filenameBase}.tsv`;
      const asciiFilename = `${asciiFilenameBase}.tsv`;

      const delimiter = "\t";
      const products = db
        .prepare(
          "SELECT * FROM products WHERE category_id = ? ORDER BY sort_order, id",
        )
        .all(categoryId) as any[];
      const getAdditions = db.prepare(
        "SELECT * FROM additions WHERE product_id = ? ORDER BY id",
      );

      const lines: string[] = [];
      lines.push(
        [
          "title",
          "title_en",
          "title_bg",
          "description",
          "description_en",
          "description_bg",
          "price",
          "image",
          "additions",
        ].join(delimiter),
      );

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
          .join(";");
        lines.push(
          [
            escapeTsv(p.name),
            escapeTsv(p.name_en || ""),
            escapeTsv(p.name_bg || ""),
            escapeTsv(p.description || ""),
            escapeTsv(p.description_en || ""),
            escapeTsv(p.description_bg || ""),
            escapeTsv(p.price ?? 0),
            escapeTsv(exportImageValue(p.image_url)),
            escapeDelimited(additionsStr, delimiter),
          ].join(delimiter),
        );
      }

      const tsv = lines.join("\r\n");

      res.setHeader(
        "Content-Type",
        "text/tab-separated-values; charset=utf-16le",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeHeaderFilename(filename)}`,
      );
      res.send(
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tsv, "utf16le")]),
      );
    } catch (error: any) {
      console.error("CSV export error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Export failed" });
      }
    }
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
