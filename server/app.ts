import express from "express";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import type Database from "better-sqlite3";
import type { Addition, ProductDraft, Restaurant, Product } from "../shared/types.js";

import { openDatabase } from "./db/connection.js";
import { loadConfig } from "./config.js";
import { PublicMenuCache } from "./domains/menu/cache.js";
import { apiErrorHandler } from "./http/asyncRoute.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerPublicMenuRoute } from "./routes/publicMenu.js";
import { registerMediaRoutes } from "./routes/media.js";
import { buildMenu } from "./domains/menu/service.js";
import {
  formatMonthKey,
  getCurrentPeriodKey,
} from "./domains/popularity/periods.js";
import {
  createAdminSession,
  isAdminSessionValid,
  setAdminCookie,
  clearAdminCookie,
  type AdminSessionConfig,
} from "./domains/auth/session.js";
import { createPopularityService } from "./domains/popularity/service.js";
import { createScanStatisticsService } from "./domains/popularity/scanStats.js";
import { toJSON } from "./http/json.js";
import { HttpError, errorMessage } from "./http/errors.js";
import type { ScanStatisticsExportScope } from "../shared/types.js";
import type { RestaurantDbRow } from "./domains/restaurants/types.js";
import { MediaStorage, dataUrlBuffer } from "./domains/media/storage.js";
import {
  publicMediaUrl,
  type MediaTarget,
} from "./domains/media/references.js";
// Prefer local-only secrets file if present.
dotenv.config({ path: ".env.local" });
dotenv.config();

// Database setup is performed by the explicit migration runner in server.ts.
const openDatabases = new Set<Database.Database>();
type ReviewSettingsRow = { id: number; reviews_enabled: number };
type CategoryDbRow = {
  id: number;
  name: string;
  name_en?: string | null;
  name_bg?: string | null;
  image_url?: string | null;
};

export function closeDatabaseForTests() {
  for (const database of openDatabases) {
    if (database.open) database.close();
  }
  openDatabases.clear();
}
export async function startServer(options: { listen?: boolean } = {}) {
  const app = express();
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const mediaStorage = new MediaStorage(config.mediaDir);
  openDatabases.add(db);
  const PORT = config.port;

  const GEMINI_API_KEY = config.geminiApiKey;
  const ai = GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    : null;
  const translationCache = new Map<string, string>();
  const ADMIN_PASSWORD = config.adminPassword;
  const ADMIN_SESSION_SECRET = config.adminSessionSecret;
  const ADMIN_COOKIE = "menu_admin_session";
  const ADMIN_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const publicMenuCache = new PublicMenuCache();
  const sessionConfig: AdminSessionConfig = {
    cookieName: ADMIN_COOKIE,
    secret: ADMIN_SESSION_SECRET,
    maxAgeMs: ADMIN_SESSION_MAX_AGE_MS,
    secure: config.isProduction,
  };
  const POPULARITY_TIME_ZONE = config.popularityTimeZone;
  const POPULARITY_CUTOFF_HOUR = 3;
  const {
    getCategoryById,
    refreshPopularCategory,
    getPopularCategoryStats,
    applyPopularCategory,
  } = createPopularityService(db, {
    timeZone: POPULARITY_TIME_ZONE,
    cutoffHour: POPULARITY_CUTOFF_HOUR,
  });
  const {
    recordMenuScan,
    getStatistics: getScanStatistics,
    exportStatistics: exportScanStatistics,
  } = createScanStatisticsService(db, {
    timeZone: POPULARITY_TIME_ZONE,
  });
  if (!config.adminPassword) {
    console.warn(
      config.isProduction
        ? "[auth] ADMIN_PASSWORD is not set. Admin login is disabled."
        : "[auth] ADMIN_PASSWORD is not set. Using development password: admin",
    );
  }

  const isBlank = (v: unknown) => v == null || String(v).trim() === "";
  const optionalText = (v: unknown) => (isBlank(v) ? null : String(v).trim());
  const clampInteger = (
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  };
  const normalizeLogoFit = (value: unknown) =>
    value === "cover" ? "cover" : "contain";

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

  app.use(compression());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api/")) return;
      const durationMs = Date.now() - startedAt;
      if (res.statusCode >= 400 || durationMs >= 500) {
        console.log("[api] " + req.method + " " + req.originalUrl + " " + res.statusCode + " " + durationMs + "ms");
      }
    });
    next();
  });

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/") && req.method !== "GET") {
      res.once("finish", () => {
        if (res.statusCode < 400) publicMenuCache.clear();
      });
    }
    next();
  });

  registerHealthRoute(app, db);
  registerAuthRoutes(app, {
    password: ADMIN_PASSWORD,
    sessionConfig,
  });

  app.use("/api", (req, res, next) => {
    const publicApi =
      req.path.startsWith("/auth/") ||
      req.path.startsWith("/public-menu/") ||
      req.path.startsWith("/popularity/category-view") ||
      (req.method === "GET" && req.path.startsWith("/images/")) ||
      (req.path.startsWith("/reviews/") && req.method !== "DELETE");

    if (publicApi || isAdminSessionValid(req.headers.cookie, sessionConfig)) {
      return next();
    }

    res.status(401).json({ error: "Admin login required." });
  });
  registerMediaRoutes(app, { db, storage: mediaStorage });

  const normalizeImageValue = async (
    raw: unknown,
    target: MediaTarget,
    current: string | null | undefined,
  ): Promise<string | null> => {
    if (isBlank(raw)) return null;
    const value = String(raw).trim();
    if (value === publicMediaUrl(target, current) || value.startsWith("media:")) {
      return current || null;
    }
    if (value.startsWith("data:image/")) {
      return mediaStorage.store(dataUrlBuffer(value), target);
    }
    return value;
  };

  const getOrCreateRestaurantBySlug = (slug: string): RestaurantDbRow => {
    let restaurant = db
      .prepare("SELECT * FROM restaurants WHERE slug = ?")
      .get(slug) as RestaurantDbRow | undefined;

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
        search_enabled: 1,
        popular_category_id: null,
        popular_category_period_key: null,
        popular_category_updated_at: null,
      };
    }

    if (!restaurant) throw new Error("Could not create restaurant.");
    return restaurant;
  };

  // Get or create restaurant by slug
  app.get("/api/restaurant/:slug", (req, res) => {
    const { slug } = req.params;
    const restaurant = getOrCreateRestaurantBySlug(slug);

    // Fetch current month's scans
    try {
      const scanRow = db.prepare("SELECT scan_count FROM menu_scans WHERE restaurant_id = ? AND month_key = ?").get(restaurant.id, formatMonthKey(new Date(), POPULARITY_TIME_ZONE)) as { scan_count?: number | bigint } | undefined;
      restaurant.current_month_scans = scanRow ? Number(scanRow.scan_count || 0) : 0;
    } catch(e) {
      console.error("Error fetching scan count", e);
      restaurant.current_month_scans = 0;
    }

    res.json(
      toJSON({
        ...restaurant,
        background_url: publicMediaUrl(
          { kind: "restaurants", id: restaurant.id, field: "background" },
          restaurant.background_url,
        ),
        logo_url: publicMediaUrl(
          { kind: "restaurants", id: restaurant.id, field: "logo" },
          restaurant.logo_url,
        ),
        takeover_image_url: publicMediaUrl(
          { kind: "restaurants", id: restaurant.id, field: "takeover" },
          restaurant.takeover_image_url,
        ),
      }),
    );
  });

  const readScanQuery = (value: unknown, name: string): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      throw new HttpError(400, name + " must be a single value.");
    }
    return value;
  };

  app.get("/api/restaurant/:id/scan-statistics", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new HttpError(400, "Invalid restaurant ID.");
      }

      res.json(
        toJSON(
          getScanStatistics(id, {
            monthKey: readScanQuery(req.query.month, "month"),
            dayKey: readScanQuery(req.query.day, "day"),
          }),
        ),
      );
    } catch (error: unknown) {
      const status = error instanceof HttpError ? error.status : 500;
      if (!(error instanceof HttpError)) console.error("[api] Error loading scan statistics:", error);
      res
        .status(status)
        .json({ error: errorMessage(error, "Could not load scan statistics.") });
    }
  });

  app.get("/api/restaurant/:id/scan-statistics/export", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new HttpError(400, "Invalid restaurant ID.");
      }

      const scopeValue = readScanQuery(req.query.scope, "scope");
      if (
        scopeValue !== "all" &&
        scopeValue !== "month" &&
        scopeValue !== "day"
      ) {
        throw new HttpError(400, "scope must be all, month, or day.");
      }

      const scope = scopeValue as ScanStatisticsExportScope;
      const breakdown = readScanQuery(req.query.breakdown, "breakdown");
      if (breakdown !== undefined && breakdown !== "source") {
        throw new HttpError(400, "breakdown must be source.");
      }
      const exportResult = exportScanStatistics(id, scope, {
        monthKey: readScanQuery(req.query.month, "month"),
        dayKey: readScanQuery(req.query.day, "day"),
        includeSources: breakdown === "source",
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=\"" + exportResult.filename + "\"",
      );
      res.send(Buffer.from(exportResult.content, "utf8"));
    } catch (error: unknown) {
      const status = error instanceof HttpError ? error.status : 500;
      if (!(error instanceof HttpError)) console.error("[api] Error exporting scan statistics:", error);
      res
        .status(status)
        .json({ error: errorMessage(error, "Could not export scan statistics.") });
    }
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
    } catch (error: unknown) {
      console.error("[api] Error updating restaurant slug:", error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // Update Restaurant
  app.put("/api/restaurant/:id", async (req, res) => {
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

      const current = db
        .prepare(
          "SELECT background_url, logo_url, takeover_image_url FROM restaurants WHERE id = ?",
        )
        .get(id) as {
        background_url?: string | null;
        logo_url?: string | null;
        takeover_image_url?: string | null;
      } | undefined;
      const [finalBackground, finalLogo, finalTakeover] = await Promise.all([
        normalizeImageValue(
          background_url,
          { kind: "restaurants", id, field: "background" },
          current?.background_url,
        ),
        normalizeImageValue(
          logo_url,
          { kind: "restaurants", id, field: "logo" },
          current?.logo_url,
        ),
        normalizeImageValue(
          takeover_image_url,
          { kind: "restaurants", id, field: "takeover" },
          current?.takeover_image_url,
        ),
      ]);

      const result = db
        .prepare(
          "UPDATE restaurants SET name = ?, background_url = ?, logo_url = ?, logo_size = ?, logo_fit = ?, logo_position_x = ?, logo_position_y = ?, phone = ?, address = ?, wifi_password = ?, opening_hours = ?, facebook_url = ?, instagram_url = ?, takeover_enabled = ?, takeover_title = ?, takeover_message = ?, takeover_price = ?, takeover_allergens = ?, takeover_image_url = ?, footer_text = ?, footer_link = ? WHERE id = ?",
        )
        .run(
          String(name ?? "").trim(),
          finalBackground,
          finalLogo,
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
          finalTakeover,
          optionalText(footer_text),
          optionalText(footer_link),
          id,
        );

      if (finalBackground !== current?.background_url) {
        mediaStorage.remove(current?.background_url);
      }
      if (finalLogo !== current?.logo_url) mediaStorage.remove(current?.logo_url);
      if (finalTakeover !== current?.takeover_image_url) {
        mediaStorage.remove(current?.takeover_image_url);
      }

      res.json({ success: true, changes: result.changes });
    } catch (error: unknown) {
      console.error("[api] Error updating restaurant:", error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // ─── MENU ──────────────────────────────────────────────────────────────────

  registerPublicMenuRoute(app, {
    db,
    cache: publicMenuCache,
    getRestaurantBySlug: getOrCreateRestaurantBySlug,
    refreshPopularCategory: (restaurant) =>
      refreshPopularCategory(restaurant) as RestaurantDbRow,
    recordMenuScan,
    applyPopularCategory: (menu, restaurant) =>
      applyPopularCategory(menu, restaurant),
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
        getCurrentPeriodKey(new Date(), { timeZone: POPULARITY_TIME_ZONE, cutoffHour: POPULARITY_CUTOFF_HOUR }),
        new Date().toISOString(),
      );

      res.json({ success: true });
    } catch (error: unknown) {
      console.error("[api] Error tracking category view:", error);
      res.status(500).json({ error: errorMessage(error) || "Could not track view." });
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
    } catch (error: unknown) {
      console.error("[api] Error loading category popularity:", error);
      res
        .status(500)
        .json({ error: errorMessage(error) || "Could not load popularity." });
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
      publicMenuCache.clear();
      res.json({ success: true, enabled: enabled === 1 });
    } catch (error: unknown) {
      console.error("[api] Error updating popular badges setting:", error);
      res.status(500).json({ error: errorMessage(error) });
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
        .get(restaurantId) as ReviewSettingsRow | undefined;
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
    } catch (error: unknown) {
      console.error("[api] Error fetching reviews:", error);
      res
        .status(500)
        .json({ error: errorMessage(error) || "Could not load reviews." });
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
        .get(restaurantId) as ReviewSettingsRow | undefined;
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
    } catch (error: unknown) {
      console.error("[api] Error submitting review:", error);
      res
        .status(500)
        .json({ error: errorMessage(error) || "Could not submit review." });
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
    } catch (error: unknown) {
      console.error("[api] Error deleting review:", error);
      res
        .status(500)
        .json({ error: errorMessage(error) || "Could not delete review." });
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
      publicMenuCache.clear();
      res.json({ success: true, enabled: enabled === 1 });
    } catch (error: unknown) {
      console.error("[api] Error updating reviews setting:", error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // PUT toggle search_enabled (admin only)
  app.put("/api/restaurant/:id/search-enabled", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new HttpError(400, "Invalid restaurant ID.");
      }
      if (typeof req.body?.enabled !== "boolean") {
        throw new HttpError(400, "enabled must be a boolean.");
      }
      const enabled = req.body.enabled ? 1 : 0;
      const result = db
        .prepare("UPDATE restaurants SET search_enabled = ? WHERE id = ?")
        .run(enabled, id);
      if (result.changes === 0) {
        return res.status(404).json({ error: "Restaurant not found." });
      }
      publicMenuCache.clear();
      res.json({ success: true, enabled: enabled === 1 });
    } catch (error: unknown) {
      console.error("[api] Error updating search setting:", error);
      const status = error instanceof HttpError ? error.status : 500;
      res.status(status).json({ error: errorMessage(error) });
    }
  });
  app.patch("/api/products/:id(\\d+)/image", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const current = db
        .prepare("SELECT image_url FROM products WHERE id = ?")
        .get(id) as { image_url?: string | null } | undefined;
      const imageUrl = await normalizeImageValue(
        req.body?.image_url,
        { kind: "products", id },
        current?.image_url,
      );
      db.prepare("UPDATE products SET image_url = ? WHERE id = ?").run(
        imageUrl,
        id,
      );
      if (imageUrl !== current?.image_url) mediaStorage.remove(current?.image_url);
      res.json(
        toJSON({
          id,
          image_url: publicMediaUrl({ kind: "products", id }, imageUrl),
        }),
      );
    } catch (error: unknown) {
      console.error("Product image update error:", error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.patch("/api/categories/:id(\\d+)/image", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const current = db
        .prepare("SELECT image_url FROM categories WHERE id = ?")
        .get(id) as { image_url?: string | null } | undefined;
      const imageUrl = await normalizeImageValue(
        req.body?.image_url,
        { kind: "categories", id },
        current?.image_url,
      );
      db.prepare("UPDATE categories SET image_url = ? WHERE id = ?").run(
        imageUrl,
        id,
      );
      if (imageUrl !== current?.image_url) mediaStorage.remove(current?.image_url);
      res.json(
        toJSON({
          id,
          image_url: publicMediaUrl({ kind: "categories", id }, imageUrl),
        }),
      );
    } catch (error: unknown) {
      console.error("Category image update error:", error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get("/api/menu/:restaurantId", (req, res) => {
    try {
      res.json(toJSON(buildMenu(db, req.params.restaurantId)));
    } catch (error: unknown) {
      console.error("[api] Error loading menu:", error);
      res.status(500).json({ error: errorMessage(error) || "Could not load menu." });
    }
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
          null,
          parent_id || null,
          sort_order,
        );

      const categoryId = Number(result.lastInsertRowid);
      const storedImage = await normalizeImageValue(
        image_url,
        { kind: "categories", id: categoryId },
        null,
      );
      if (storedImage) {
        db.prepare("UPDATE categories SET image_url = ? WHERE id = ?").run(
          storedImage,
          categoryId,
        );
      }

      res.json(
        toJSON({
          id: categoryId,
          restaurant_id,
          name,
          name_en: nameTr.en,
          name_bg: nameTr.bg,
          image_url: publicMediaUrl(
            { kind: "categories", id: categoryId },
            storedImage,
          ),
          parent_id,
          sort_order,
          products: [],
          subcategories: [],
        }),
      );
    } catch (error: unknown) {
      console.error("Error adding category:", error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.put("/api/categories/:id(\\d+)", async (req, res) => {
    const { name, name_en, name_bg, image_url } = req.body;
    const { id } = req.params;

    const existing = db
      .prepare("SELECT * FROM categories WHERE id = ?")
      .get(id) as CategoryDbRow | undefined;
    const baseName = !isBlank(name)
      ? String(name)
      : String(existing?.name ?? "");
    const nameTr = await ensureTranslations(baseName, {
      en: name_en ?? existing?.name_en,
      bg: name_bg ?? existing?.name_bg,
    });
    const numericId = Number(id);
    const finalImage = !isBlank(image_url)
      ? await normalizeImageValue(
          image_url,
          { kind: "categories", id: numericId },
          existing?.image_url,
        )
      : existing?.image_url || null;

    db.prepare(
      "UPDATE categories SET name = ?, name_en = ?, name_bg = ?, image_url = ? WHERE id = ?",
    ).run(baseName, nameTr.en, nameTr.bg, finalImage, id);
    if (finalImage !== existing?.image_url) mediaStorage.remove(existing?.image_url);
    res.json(
      toJSON({
        id,
        name: baseName,
        name_en: nameTr.en,
        name_bg: nameTr.bg,
        image_url: publicMediaUrl(
          { kind: "categories", id: numericId },
          finalImage,
        ),
      }),
    );
  });

  app.delete("/api/categories/:id(\\d+)", (req, res) => {
    const categoryImages = db
      .prepare("SELECT image_url FROM categories WHERE id = ? OR parent_id = ?")
      .all(req.params.id, req.params.id) as Array<{ image_url?: string | null }>;
    const productImages = db
      .prepare(
        "SELECT p.image_url FROM products p JOIN categories c ON c.id = p.category_id WHERE c.id = ? OR c.parent_id = ?",
      )
      .all(req.params.id, req.params.id) as Array<{ image_url?: string | null }>;
    db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
    for (const image of [...categoryImages, ...productImages]) {
      mediaStorage.remove(image.image_url);
    }
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
          null,
          is_available ?? 1,
          tags || null,
          allergens || null,
          calories || null,
          is_featured ?? 0,
          is_new ?? 0,
        );

      const productId = Number(result.lastInsertRowid);
      const storedImage = await normalizeImageValue(
        image_url,
        { kind: "products", id: productId },
        null,
      );
      if (storedImage) {
        db.prepare("UPDATE products SET image_url = ? WHERE id = ?").run(
          storedImage,
          productId,
        );
      }

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
          image_url: publicMediaUrl(
            { kind: "products", id: productId },
            storedImage,
          ),
          is_available: is_available ?? 1,
          tags,
          allergens,
          calories,
          is_featured: is_featured ?? 0,
          is_new: is_new ?? 0,
          additions: savedAdditions,
        }),
      );
    } catch (error: unknown) {
      console.error("Error adding product:", error);
      res.status(500).json({ error: errorMessage(error) });
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
      const numericProductId = Number(productId);

      const existing = db
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(productId) as Product | undefined;

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
      const finalImage =
        image_url === undefined
          ? existing?.image_url || null
          : await normalizeImageValue(
              image_url,
              { kind: "products", id: numericProductId },
              existing?.image_url,
            );

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
        finalImage,
        is_available ?? 1,
        tags || null,
        allergens || null,
        calories || null,
        is_featured ?? 0,
        is_new ?? 0,
        productId,
      );
      if (finalImage !== existing?.image_url) mediaStorage.remove(existing?.image_url);

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
          image_url: publicMediaUrl(
            { kind: "products", id: numericProductId },
            finalImage,
          ),
          is_available: is_available ?? 1,
          tags,
          allergens,
          calories,
          is_featured: is_featured ?? 0,
          is_new: is_new ?? 0,
          additions: savedAdditions,
        }),
      );
    } catch (error: unknown) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: errorMessage(error) });
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
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.delete("/api/products/:id(\\d+)", (req, res) => {
    const existing = db
      .prepare("SELECT image_url FROM products WHERE id = ?")
      .get(req.params.id) as { image_url?: string | null } | undefined;
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    mediaStorage.remove(existing?.image_url);
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

    const transaction = db.transaction((productList: ProductDraft[]) => {
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
    } catch (error: unknown) {
      console.error("Bulk import error:", error);
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // ─── CSV EXPORT ────────────────────────────────────────────────────────────

  app.get("/api/categories/:categoryId/products/export", (req, res) => {
    try {
      const { categoryId } = req.params;

      const category = db
        .prepare("SELECT * FROM categories WHERE id = ?")
        .get(categoryId) as CategoryDbRow | undefined;
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      const escapeDelimited = (val: unknown, delimiter: string) => {
        const s = val === null || val === undefined ? "" : String(val);
        const needsQuotes =
          s.includes('"') ||
          s.includes(delimiter) ||
          s.includes("\n") ||
          s.includes("\r");
        const escaped = s.replace(/"/g, '""');
        return needsQuotes ? `"${escaped}"` : escaped;
      };

      const escapeTsv = (val: unknown) =>
        (val === null || val === undefined ? "" : String(val))
          .replace(/\t/g, " ")
          .replace(/\r?\n|\r/g, " ")
          .trim();

      const exportImageValue = (value: unknown) => {
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
        .all(categoryId) as Product[];
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
        const additions = getAdditions.all(p.id) as Addition[];
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
    } catch (error: unknown) {
      console.error("CSV export error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: errorMessage(error) || "Export failed" });
      }
    }
  });

  // ─── CATCH-ALL API 404 ─────────────────────────────────────────────────────

  app.use("/api", (req, res) => {
    res
      .status(404)
      .json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // ─── VITE / STATIC ────────────────────────────────────────────────────────

  app.use("/api", apiErrorHandler);

  if (!config.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(
      express.static(distPath, {
        immutable: true,
        maxAge: "1y",
        index: false,
        setHeaders: (res, filename) => {
          if (path.basename(filename) === "index.html") {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (options.listen === false) return app;

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("Menu QR Server running on http://localhost:" + PORT);
  });
  const shutdown = () => {
    server.close(() => {
      if (db.open) {
        db.close();
        openDatabases.delete(db);
      }
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.once("close", () => {
    if (db.open) {
      db.close();
      openDatabases.delete(db);
    }
  });
  return app;
}

if (process.env.NODE_ENV !== "test" && process.env.MENU_QR_NO_LISTEN !== "1") {
  startServer().catch(console.error);
}
