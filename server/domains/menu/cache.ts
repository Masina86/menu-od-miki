import crypto from "node:crypto";

export interface CachedMenuResponse {
  body: string;
  etag: string;
  expiresAt: number;
}

export class PublicMenuCache {
  private readonly entries = new Map<number, CachedMenuResponse>();

  constructor(private readonly ttlMs = 60_000) {}

  get(restaurantId: number, now = Date.now()): CachedMenuResponse | undefined {
    const entry = this.entries.get(restaurantId);
    if (!entry || entry.expiresAt <= now) {
      this.entries.delete(restaurantId);
      return undefined;
    }
    return entry;
  }

  set(restaurantId: number, body: string, now = Date.now()): CachedMenuResponse {
    const etag = `"${crypto.createHash("sha1").update(body).digest("hex")}"`;
    const entry = { body, etag, expiresAt: now + this.ttlMs };
    this.entries.set(restaurantId, entry);
    return entry;
  }

  invalidateRestaurant(restaurantId: number): void {
    this.entries.delete(restaurantId);
  }

  clear(): void {
    this.entries.clear();
  }
}

export const PUBLIC_MENU_CACHE_CONTROL =
  "public, max-age=60, stale-while-revalidate=300";
