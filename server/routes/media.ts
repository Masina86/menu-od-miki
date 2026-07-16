import express, { type Express, type Response } from "express";
import type Database from "better-sqlite3";
import { MediaStorage } from "../domains/media/storage.js";
import {
  publicMediaUrl,
  type MediaTarget,
  type RestaurantMediaField,
} from "../domains/media/references.js";
import { MAX_MEDIA_UPLOAD_BYTES } from "../domains/media/optimization.js";
import {
  dataUrlToResponse,
  makeBackgroundTransparent,
  resolveImageBuffer,
} from "../domains/images/processing.js";
import { errorMessage } from "../http/errors.js";
import { toJSON } from "../http/json.js";

type ImageRow = { image_url?: string | null };

function restaurantColumn(field: string): string | null {
  if (field === "background") return "background_url";
  if (field === "logo") return "logo_url";
  if (field === "takeover") return "takeover_image_url";
  return null;
}

export function registerMediaRoutes(
  app: Express,
  options: { db: Database.Database; storage: MediaStorage },
): void {
  const { db, storage } = options;
  const rawImage = express.raw({
    type: "image/*",
    limit: MAX_MEDIA_UPLOAD_BYTES,
  });

  const sendImage = (
    value: string | null | undefined,
    reqWidth: unknown,
    res: Response,
  ) => {
    if (!value) return res.status(404).end();
    if (storage.send(value, reqWidth, res)) return;
    dataUrlToResponse(value, res);
  };

  app.get("/api/images/categories/:id", (req, res) => {
    const row = db
      .prepare("SELECT image_url FROM categories WHERE id = ?")
      .get(req.params.id) as ImageRow | undefined;
    sendImage(row?.image_url, req.query.w, res);
  });

  app.get("/api/images/products/:id", (req, res) => {
    const row = db
      .prepare("SELECT image_url FROM products WHERE id = ?")
      .get(req.params.id) as ImageRow | undefined;
    sendImage(row?.image_url, req.query.w, res);
  });

  app.get("/api/images/restaurants/:id/:field", (req, res) => {
    const column = restaurantColumn(req.params.field);
    if (!column) return res.status(404).end();
    const row = db
      .prepare(`SELECT ${column} AS image_url FROM restaurants WHERE id = ?`)
      .get(req.params.id) as ImageRow | undefined;
    sendImage(row?.image_url, req.query.w, res);
  });

  const upload = (
    readCurrent: (id: number) => string | null | undefined,
    update: (id: number, reference: string) => number,
    target: (id: number) => MediaTarget,
  ) => async (req: express.Request, res: express.Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0 || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: "A valid image and target ID are required." });
      }
      const previous = readCurrent(id);
      const reference = await storage.store(req.body, target(id));
      const changes = update(id, reference);
      if (changes === 0) {
        storage.remove(reference);
        return res.status(404).json({ error: "Media target was not found." });
      }
      storage.remove(previous);
      res.json(toJSON({ image_url: publicMediaUrl(target(id), reference) }));
    } catch (error) {
      res.status(400).json({ error: errorMessage(error, "Could not store image.") });
    }
  };

  app.put(
    "/api/images/categories/:id",
    rawImage,
    upload(
      (id) =>
        (db.prepare("SELECT image_url FROM categories WHERE id = ?").get(id) as ImageRow | undefined)
          ?.image_url,
      (id, reference) => {
        return db
          .prepare("UPDATE categories SET image_url = ? WHERE id = ?")
          .run(reference, id).changes;
      },
      (id) => ({ kind: "categories", id }),
    ),
  );

  app.put(
    "/api/images/products/:id",
    rawImage,
    upload(
      (id) =>
        (db.prepare("SELECT image_url FROM products WHERE id = ?").get(id) as ImageRow | undefined)
          ?.image_url,
      (id, reference) => {
        return db
          .prepare("UPDATE products SET image_url = ? WHERE id = ?")
          .run(reference, id).changes;
      },
      (id) => ({ kind: "products", id }),
    ),
  );

  app.put("/api/images/restaurants/:id/:field", rawImage, async (req, res) => {
    const column = restaurantColumn(req.params.field);
    if (!column) return res.status(404).json({ error: "Unknown restaurant image field." });
    const field = req.params.field as RestaurantMediaField;
    return upload(
      (id) =>
        (db.prepare(`SELECT ${column} AS image_url FROM restaurants WHERE id = ?`).get(id) as ImageRow | undefined)
          ?.image_url,
      (id, reference) => {
        return db
          .prepare(`UPDATE restaurants SET ${column} = ? WHERE id = ?`)
          .run(reference, id).changes;
      },
      (id) => ({ kind: "restaurants", id, field }),
    )(req, res);
  });

  app.post("/api/images/transparent-preview", async (req, res) => {
    try {
      const { image_url, type, id } = req.body || {};
      let source = typeof image_url === "string" ? image_url : null;
      if (!source && type && id) {
        const table = type === "product" ? "products" : type === "category" ? "categories" : null;
        if (table) {
          source =
            (db.prepare(`SELECT image_url FROM ${table} WHERE id = ?`).get(id) as ImageRow | undefined)
              ?.image_url ?? null;
        }
      }
      const stored = source ? storage.read(source) : null;
      const input = stored ?? (await resolveImageBuffer(source));
      const output = await makeBackgroundTransparent(input);
      res.json({ image_url: `data:image/png;base64,${output.toString("base64")}` });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error, "Could not make this image transparent.") });
    }
  });
}
