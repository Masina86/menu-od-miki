import crypto from "node:crypto";
import sharp from "sharp";
import type { MediaTarget } from "./references.js";

export const MAX_MEDIA_UPLOAD_BYTES = 12 * 1024 * 1024;

export interface MediaProfile {
  widths: number[];
  quality: number;
}

export interface OptimizedVariant {
  width: number;
  bytes: Buffer;
}

export function mediaProfile(target: MediaTarget): MediaProfile {
  if (target.kind === "restaurants" && target.field === "logo") {
    return { widths: [256, 512, 1000], quality: 85 };
  }
  if (
    target.kind === "restaurants" &&
    (target.field === "background" || target.field === "takeover")
  ) {
    return { widths: [640, 1024, 1600], quality: 80 };
  }
  return { widths: [320, 640, 1000], quality: 80 };
}

export async function optimizeImage(
  input: Buffer,
  target: MediaTarget,
): Promise<{ hash: string; variants: OptimizedVariant[] }> {
  if (!input.length || input.length > MAX_MEDIA_UPLOAD_BYTES) {
    throw new Error("Image must be between 1 byte and 12 MB.");
  }
  const probe = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
  const metadata = await probe.metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Image could not be decoded.");
  }

  const profile = mediaProfile(target);
  const hash = crypto
    .createHash("sha256")
    .update(input)
    .update(JSON.stringify(profile))
    .digest("hex")
    .slice(0, 16);
  const variants = await Promise.all(
    profile.widths.map(async (width) => ({
      width,
      bytes: await sharp(input, {
        limitInputPixels: 40_000_000,
        failOn: "error",
      })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: profile.quality, effort: 5, smartSubsample: true })
        .toBuffer(),
    })),
  );
  return { hash, variants };
}
