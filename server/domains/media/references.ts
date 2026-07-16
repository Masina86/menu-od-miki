import path from "node:path";

export type MediaKind = "categories" | "products" | "restaurants";
export type RestaurantMediaField = "background" | "logo" | "takeover";

export interface MediaTarget {
  kind: MediaKind;
  id: number;
  field?: RestaurantMediaField;
}

export interface ParsedMediaReference extends MediaTarget {
  hash: string;
}

const MEDIA_REFERENCE =
  /^media:(categories|products)\/(\d+)\/([a-f0-9]{16})$|^media:restaurants\/(\d+)\/(background|logo|takeover)\/([a-f0-9]{16})$/;

export function mediaTargetKey(target: MediaTarget): string {
  if (!Number.isInteger(target.id) || target.id <= 0) {
    throw new Error("Media target ID must be a positive integer.");
  }
  if (target.kind === "restaurants") {
    if (!target.field) throw new Error("Restaurant media requires a field.");
    return path.posix.join(target.kind, String(target.id), target.field);
  }
  return path.posix.join(target.kind, String(target.id));
}

export function createMediaReference(target: MediaTarget, hash: string): string {
  if (!/^[a-f0-9]{16}$/.test(hash)) throw new Error("Invalid media hash.");
  return `media:${mediaTargetKey(target)}/${hash}`;
}

export function parseMediaReference(
  value: string | null | undefined,
): ParsedMediaReference | null {
  if (!value) return null;
  const match = MEDIA_REFERENCE.exec(value);
  if (!match) return null;
  if (match[1]) {
    return {
      kind: match[1] as "categories" | "products",
      id: Number(match[2]),
      hash: match[3],
    };
  }
  return {
    kind: "restaurants",
    id: Number(match[4]),
    field: match[5] as RestaurantMediaField,
    hash: match[6],
  };
}

export function publicMediaUrl(
  target: MediaTarget,
  value: string | null | undefined,
): string | null | undefined {
  if (!value) return value;
  const parsed = parseMediaReference(value);
  if (!parsed) return value;
  const base =
    target.kind === "restaurants"
      ? `/api/images/restaurants/${target.id}/${target.field}`
      : `/api/images/${target.kind}/${target.id}`;
  return `${base}?v=${parsed.hash}`;
}

export function mediaUrlWithWidth(
  value: string | null | undefined,
  width: number,
): string | null | undefined {
  if (!value || !value.startsWith("/api/images/")) return value;
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}w=${width}`;
}
