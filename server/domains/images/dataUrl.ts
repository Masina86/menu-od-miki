import crypto from "node:crypto";
import { publicMediaUrl } from "../media/references.js";

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
  const mediaUrl = publicMediaUrl(
    type === "restaurants"
      ? {
          kind: type,
          id,
          field: field as "background" | "logo" | "takeover",
        }
      : { kind: type, id },
    imageUrl,
  );
  if (mediaUrl !== imageUrl) return mediaUrl;
  if (!imageUrl.startsWith("data:") || imageUrl.length < 2048) return imageUrl;
  const version = imageVersion(imageUrl);
  return type === "restaurants"
    ? "/api/images/restaurants/" + id + "/" + field + "?v=" + version
    : "/api/images/" + type + "/" + id + "?v=" + version;
}
