import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import type Database from "better-sqlite3";

import { openDatabase } from "./db/connection.js";
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
import { compactImageUrl } from "./domains/images/dataUrl.js";
import { createPopularityService } from "./domains/popularity/service.js";
import { createScanStatisticsService } from "./domains/popularity/scanStats.js";
import { toJSON } from "./http/json.js";
import { HttpError, errorMessage } from "./http/errors.js";
import type { ScanStatisticsExportScope } from "../shared/types.js";
import {
  dataUrlToResponse,
  resolveImageBuffer,
  makeBackgroundTransparent,
} from "./domains/images/processing.js";
// Prefer local-only secrets file if present.
dotenv.config({ path: ".env.local" });
dotenv.config();

// Database setup is performed by the explicit migration runner in server.ts.
const openDatabases = new Set<Database.Database>();

export function closeDatabaseForTests() {
  for (const database of openDatabases) {
    if (database.open) database.close();
  }
  openDatabases.clear();
}
export async function startServer(options: { listen?: boolean } = {}) {
  const app = express();
  const db = openDatabase();
  openDatabases.add(db);
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
  const sessionConfig: AdminSessionConfig = {
    cookieName: ADMIN_COOKIE,
    secret: ADMIN_SESSION_SECRET,
    maxAgeMs: ADMIN_SESSION_MAX_AGE_MS,
    secure: process.env.NODE_ENV === "production",
  };
  const POPULARITY_TIME_ZONE =
    process.env.POPULARITY_TIME_ZONE || "Europe/Skopje";
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

    setAdminCookie(res, sessionConfig, createAdminSession(sessionConfig));
    res.json({ authenticated: true });
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearAdminCookie(res, sessionConfig);
    res.json({ authenticated: false });
  });

  app.get("/api/auth/session", (req, res) => {
    res.json({ authenticated: isAdminSessionValid(req.headers.cookie, sessionConfig) });
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

  // Get or create restaurant by slug
  app.get("/api/restaurant/:slug", (req, res) => {
    const { slug } = req.params;
    const restaurant = getOrCreateRestaurantBySlug(slug);

    // Fetch current month's scans
    try {
      const scanRow = db.prepare("SELECT scan_count FROM menu_scans WHERE restaurant_id = ? AND month_key = ?").get(restaurant.id, formatMonthKey(new Date(), POPULARITY_TIME_ZONE)) as any;
      restaurant.current_month_scans = scanRow ? scanRow.scan_count : 0;
    } catch(e) {
      console.error("Error fetching scan count", e);
      restaurant.current_month_scans = 0;
    }

    res.json(toJSON(restaurant));
  });

  const readScanQuery = (value: unknown, name: string): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      throw new HttpError(400, name + " must be a single value.");
    }
    return value;
  };

  const readScanSource = (value: unknown): "qr" | "direct" =>
    value === "qr" ? "qr" : "direct";

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
      console.error("[api] Error loading scan statistics:", error);
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
      console.error("[api] Error exporting scan statistics:", error);
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

    // Track monthly and daily scan counts without changing the public response.
    try {
      recordMenuScan(restaurant.id, undefined, readScanSource(req.query.source));
    } catch (error: unknown) {
      console.error("[api] Error tracking scan:", error);
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
      buildMenu(db, restaurant.id, true),
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
        getCurrentPeriodKey(new Date(), { timeZone: POPULARITY_TIME_ZONE, cutoffHour: POPULARITY_CUTOFF_HOUR }),
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
    try {
      res.json(toJSON(buildMenu(db, req.params.restaurantId)));
    } catch (error: any) {
      console.error("[api] Error loading menu:", error);
      res.status(500).json({ error: error.message || "Could not load menu." });
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

  if (options.listen === false) return app;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🍽️  Menu QR Server running on http://localhost:${PORT}\n`);
  });
  return app;
}

if (process.env.NODE_ENV !== "test" && process.env.MENU_QR_NO_LISTEN !== "1") {
  startServer().catch(console.error);
}
