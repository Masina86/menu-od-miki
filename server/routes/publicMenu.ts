import type { Express } from "express";
import type Database from "better-sqlite3";
import type { Category } from "../../shared/types.js";
import { compactImageUrl } from "../domains/images/dataUrl.js";
import { PublicMenuCache, PUBLIC_MENU_CACHE_CONTROL } from "../domains/menu/cache.js";
import { buildMenu } from "../domains/menu/service.js";
import type { RestaurantDbRow } from "../domains/restaurants/types.js";
import { toJSON } from "../http/json.js";

interface PublicMenuRouteOptions {
  db: Database.Database;
  cache: PublicMenuCache;
  getRestaurantBySlug: (slug: string) => RestaurantDbRow;
  refreshPopularCategory: (restaurant: RestaurantDbRow) => RestaurantDbRow;
  recordMenuScan: (
    restaurantId: number,
    date?: Date,
    source?: "qr" | "direct",
  ) => void;
  applyPopularCategory: (
    menu: Category[],
    restaurant: RestaurantDbRow,
  ) => Category[];
}

function readScanSource(value: unknown): "qr" | "direct" {
  return value === "qr" ? "qr" : "direct";
}

export function registerPublicMenuRoute(
  app: Express,
  options: PublicMenuRouteOptions,
): void {
  app.get("/api/public-menu/:slug", (req, res) => {
    const restaurant = options.refreshPopularCategory(
      options.getRestaurantBySlug(req.params.slug),
    );

    try {
      options.recordMenuScan(
        restaurant.id,
        undefined,
        readScanSource(req.query.source),
      );
    } catch (error: unknown) {
      console.error("[api] Error tracking scan:", error);
    }

    const cached = options.cache.get(restaurant.id);
    res.setHeader("Cache-Control", PUBLIC_MENU_CACHE_CONTROL);
    if (cached) {
      res.setHeader("ETag", cached.etag);
      if (req.headers["if-none-match"] === cached.etag) {
        res.status(304).end();
        return;
      }
      res.type("json").send(cached.body);
      return;
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
      takeover_image_url: compactImageUrl(
        "restaurants",
        restaurant.id,
        restaurant.takeover_image_url,
        "takeover",
      ),
    };
    const menu = options.applyPopularCategory(
      buildMenu(options.db, restaurant.id, true),
      restaurant,
    );
    const body =
      JSON.stringify(toJSON({ restaurant: publicRestaurant, menu })) ?? "{}";
    const entry = options.cache.set(restaurant.id, body);
    res.setHeader("ETag", entry.etag);
    res.type("json").send(body);
  });
}
