import { describe, expect, it } from "vitest";
import {
  PublicMenuCache,
  PUBLIC_MENU_CACHE_CONTROL,
} from "../../server/domains/menu/cache";

describe("public menu cache", () => {
  it("expires entries and invalidates restaurant edits", () => {
    const cache = new PublicMenuCache(60_000);
    const entry = cache.set(7, '{"menu":[]}');

    expect(cache.get(7)?.etag).toBe(entry.etag);
    expect(cache.get(7, entry.expiresAt)).toBeUndefined();

    cache.set(7, '{"menu":[1]}');
    cache.invalidateRestaurant(7);
    expect(cache.get(7)).toBeUndefined();
  });

  it("uses the documented browser cache policy", () => {
    expect(PUBLIC_MENU_CACHE_CONTROL).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
  });
});
