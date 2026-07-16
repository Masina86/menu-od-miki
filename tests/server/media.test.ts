import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../server/db/migrations";
import { migrateEmbeddedMedia } from "../../server/domains/media/migration";
import {
  createMediaReference,
  parseMediaReference,
  publicMediaUrl,
} from "../../server/domains/media/references";
import { MediaStorage } from "../../server/domains/media/storage";

const tempDirs: string[] = [];
const makeTempDir = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "menu-media-test-"));
  tempDirs.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("media storage and migration", () => {
  it("parses only confined media references and creates public URLs", () => {
    const target = { kind: "restaurants" as const, id: 7, field: "logo" as const };
    const reference = createMediaReference(target, "0123456789abcdef");
    expect(parseMediaReference(reference)).toEqual({
      ...target,
      hash: "0123456789abcdef",
    });
    expect(parseMediaReference("media:categories/../../secret/0123456789abcdef")).toBeNull();
    expect(publicMediaUrl(target, reference)).toBe(
      "/api/images/restaurants/7/logo?v=0123456789abcdef",
    );
  });

  it("writes balanced responsive WebP variants", async () => {
    const directory = makeTempDir();
    const storage = new MediaStorage(directory);
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#9a3412" },
    })
      .png()
      .toBuffer();
    const reference = await storage.store(input, {
      kind: "restaurants",
      id: 1,
      field: "background",
    });
    expect(parseMediaReference(reference)).not.toBeNull();
    for (const width of [640, 1024, 1600]) {
      const body = storage.read(reference, width);
      expect(body?.length).toBeGreaterThan(0);
      if (!body) throw new Error("Expected generated media variant.");
      expect((await sharp(body).metadata()).format).toBe("webp");
    }
  });

  it("migrates data URLs once and retains invalid legacy data", async () => {
    const directory = makeTempDir();
    const dbPath = path.join(directory, "menu.db");
    const db = new Database(dbPath);
    migrateDatabase(db);
    db.prepare("INSERT INTO restaurants (name, slug) VALUES (?, ?)").run("Test", "test");
    const restaurantId = Number(
      (db.prepare("SELECT id FROM restaurants WHERE slug = ?").get("test") as { id: number }).id,
    );
    const valid = await sharp({
      create: { width: 80, height: 80, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    db.prepare("UPDATE restaurants SET logo_url = ?, background_url = ? WHERE id = ?").run(
      `data:image/png;base64,${valid.toString("base64")}`,
      "data:image/png;base64,not-an-image",
      restaurantId,
    );
    const storage = new MediaStorage(path.join(directory, "media"));
    const first = await migrateEmbeddedMedia({
      db,
      dbPath,
      storage,
      createBackup: false,
    });
    expect(first).toEqual({ converted: 1, failed: 1 });
    const row = db
      .prepare("SELECT logo_url, background_url FROM restaurants WHERE id = ?")
      .get(restaurantId) as { logo_url: string; background_url: string };
    expect(row.logo_url).toMatch(/^media:/);
    expect(row.background_url).toBe("data:image/png;base64,not-an-image");

    db.prepare("UPDATE restaurants SET background_url = NULL WHERE id = ?").run(restaurantId);
    expect(
      await migrateEmbeddedMedia({ db, dbPath, storage, createBackup: false }),
    ).toEqual({ converted: 0, failed: 0 });
    db.close();
  });
});
