import crypto from "node:crypto";

export interface ParsedDataUrl {
  contentType: string;
  isBase64: boolean;
  data: string;
}

export function parseDataUrl(value: string): ParsedDataUrl | null {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  return {
    contentType: match[1] || "application/octet-stream",
    isBase64: Boolean(match[2]),
    data: match[3] || "",
  };
}

export function imageVersion(imageUrl: string): string {
  return crypto.createHash("sha1").update(imageUrl).digest("hex").slice(0, 12);
}

export function compactImageUrl(
  type: "categories" | "products" | "restaurants",
  id: number,
  imageUrl: string | null | undefined,
  field = "image",
): string | null | undefined {
  if (!imageUrl) return imageUrl;
  if (!imageUrl.startsWith("data:") || imageUrl.length < 2048) return imageUrl;
  if (type === "categories" && imageUrl.length > 500_000) return null;
  const version = imageVersion(imageUrl);
  return type === "restaurants"
    ? "/api/images/restaurants/" + id + "/" + field + "?v=" + version
    : "/api/images/" + type + "/" + id + "?v=" + version;
}