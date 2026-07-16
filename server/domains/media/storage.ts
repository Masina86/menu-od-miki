import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import { optimizeImage, mediaProfile } from "./optimization.js";
import {
  createMediaReference,
  mediaTargetKey,
  parseMediaReference,
  type MediaTarget,
} from "./references.js";
import { parseDataUrl } from "../images/dataUrl.js";

function assertInside(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Media path escaped the configured media directory.");
  }
  return resolved;
}

export function dataUrlBuffer(value: string): Buffer {
  const parsed = parseDataUrl(value);
  if (!parsed || !parsed.contentType.startsWith("image/")) {
    throw new Error("Image must be a valid image data URL.");
  }
  return parsed.isBase64
    ? Buffer.from(parsed.data, "base64")
    : Buffer.from(decodeURIComponent(parsed.data));
}

export class MediaStorage {
  readonly root: string;

  constructor(mediaDir: string) {
    this.root = path.resolve(mediaDir);
    fs.mkdirSync(this.root, { recursive: true });
  }

  seedFrom(seedDir: string): void {
    const source = path.resolve(seedDir);
    if (!fs.existsSync(source) || source === this.root) return;
    fs.cpSync(source, this.root, { recursive: true, force: false });
  }

  async store(input: Buffer, target: MediaTarget): Promise<string> {
    const optimized = await optimizeImage(input, target);
    const directory = assertInside(
      this.root,
      path.join(this.root, ...mediaTargetKey(target).split("/")),
    );
    fs.mkdirSync(directory, { recursive: true });

    const written: string[] = [];
    const temporaryFiles: string[] = [];
    try {
      for (const variant of optimized.variants) {
        const destination = assertInside(
          this.root,
          path.join(directory, `${optimized.hash}-${variant.width}.webp`),
        );
        if (fs.existsSync(destination)) continue;
        const temporary = `${destination}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, variant.bytes, { flag: "wx" });
        temporaryFiles.push(temporary);
        fs.renameSync(temporary, destination);
        temporaryFiles.pop();
        written.push(destination);
      }
    } catch (error) {
      for (const filename of temporaryFiles) fs.rmSync(filename, { force: true });
      for (const filename of written) fs.rmSync(filename, { force: true });
      throw error;
    }
    return createMediaReference(target, optimized.hash);
  }

  remove(reference: string | null | undefined): void {
    const parsed = parseMediaReference(reference);
    if (!parsed) return;
    const directory = assertInside(
      this.root,
      path.join(this.root, ...mediaTargetKey(parsed).split("/")),
    );
    for (const width of mediaProfile(parsed).widths) {
      fs.rmSync(
        assertInside(this.root, path.join(directory, `${parsed.hash}-${width}.webp`)),
        { force: true },
      );
    }
  }

  read(reference: string, requestedWidth?: unknown): Buffer | null {
    const parsed = parseMediaReference(reference);
    if (!parsed) return null;
    const widths = mediaProfile(parsed).widths;
    const numeric = Number(requestedWidth);
    const desired = Number.isFinite(numeric) && numeric > 0 ? numeric : widths.at(-1)!;
    const width = widths.find((candidate) => candidate >= desired) ?? widths.at(-1)!;
    const filename = assertInside(
      this.root,
      path.join(
        this.root,
        ...mediaTargetKey(parsed).split("/"),
        `${parsed.hash}-${width}.webp`,
      ),
    );
    return fs.existsSync(filename) ? fs.readFileSync(filename) : null;
  }

  send(
    reference: string,
    requestedWidth: unknown,
    res: Response,
  ): boolean {
    const parsed = parseMediaReference(reference);
    if (!parsed) return false;
    const body = this.read(reference, requestedWidth);
    if (!body) return false;
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(body);
    return true;
  }
}
