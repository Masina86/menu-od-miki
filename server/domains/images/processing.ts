import type { Response } from "express";
import sharp from "sharp";
const dataUrlToResponse = (imageUrl: string | null | undefined, res: Response) => {
  if (!imageUrl) {
    res.status(404).end();
    return;
  }

  if (!imageUrl.startsWith("data:")) {
    res.redirect(imageUrl);
    return;
  }

  const match = imageUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) {
    res.status(404).end();
    return;
  }

  const contentType = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const raw = match[3] || "";
  const body = isBase64
    ? Buffer.from(raw, "base64")
    : Buffer.from(decodeURIComponent(raw));

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(body);
};

const parseDataImage = (imageUrl: string) => {
  const match = imageUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const raw = match[3] || "";
  return {
    contentType,
    buffer: isBase64
      ? Buffer.from(raw, "base64")
      : Buffer.from(decodeURIComponent(raw)),
  };
};

const resolveImageBuffer = async (
  imageUrl: string | null | undefined,
): Promise<Buffer> => {
  if (!imageUrl) throw new Error("Image is required.");

  if (imageUrl.startsWith("data:")) {
    const parsed = parseDataImage(imageUrl);
    if (!parsed || !parsed.contentType.startsWith("image/")) {
      throw new Error("Image must be a valid image data URL.");
    }
    return parsed.buffer;
  }

  const url = new URL(imageUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Image URL must use http or https.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Could not download image (HTTP ${response.status}).`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.startsWith("image/")) {
      throw new Error("URL did not return an image.");
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 12 * 1024 * 1024) {
      throw new Error("Image is too large to process.");
    }
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
};

const isTransparentBackgroundCandidate = (
  r: number,
  g: number,
  b: number,
  a: number,
  edgeColor: { r: number; g: number; b: number; count: number },
) => {
  if (a <= 8) return true;
  const brightness = (r + g + b) / 3;
  const saturation = Math.max(r, g, b) - Math.min(r, g, b);
  const edgeBrightness = (edgeColor.r + edgeColor.g + edgeColor.b) / 3;
  const edgeSaturation =
    Math.max(edgeColor.r, edgeColor.g, edgeColor.b) -
    Math.min(edgeColor.r, edgeColor.g, edgeColor.b);
  const distance = Math.hypot(
    r - edgeColor.r,
    g - edgeColor.g,
    b - edgeColor.b,
  );
  const channelDistance = Math.max(
    Math.abs(r - edgeColor.r),
    Math.abs(g - edgeColor.g),
    Math.abs(b - edgeColor.b),
  );
  const brightnessDistance = Math.abs(brightness - edgeBrightness);
  const tolerance = edgeBrightness < 70 ? 54 : edgeBrightness > 210 ? 66 : 82;

  return (
    distance <= tolerance ||
    (channelDistance <= 48 && brightnessDistance <= 64) ||
    (edgeBrightness >= 230 &&
      edgeSaturation <= 36 &&
      brightness >= 232 &&
      saturation <= 42)
  );
};

const buildEdgePalette = (
  data: Buffer,
  width: number,
  height: number,
  channels: number,
) => {
  const buckets = new Map<
    string,
    { r: number; g: number; b: number; count: number }
  >();
  const addSample = (x: number, y: number) => {
    const offset = (y * width + x) * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const key = `${Math.round(r / 24)}:${Math.round(g / 24)}:${Math.round(b / 24)}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  };

  for (let x = 0; x < width; x += 1) {
    addSample(x, 0);
    addSample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 18)
    .map((bucket) => ({
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count,
      count: bucket.count,
    }));
};

const makeBackgroundTransparent = async (input: Buffer) => {
  const { data, info } = await sharp(input, { limitInputPixels: 36_000_000 })
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixelCount = width * height;
  const background = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  const edgePalette = buildEdgePalette(data, width, height, channels);

  const fillBackgroundCluster = (edgeColor: {
    r: number;
    g: number;
    b: number;
    count: number;
  }) => {
    const visited = new Uint8Array(pixelCount);
    let head = 0;
    let tail = 0;
    const enqueue = (x: number, y: number) => {
      const idx = y * width + x;
      if (visited[idx] || background[idx]) return;
      visited[idx] = 1;
      const offset = idx * channels;
      if (
        !isTransparentBackgroundCandidate(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          data[offset + 3],
          edgeColor,
        )
      ) {
        return;
      }
      background[idx] = 1;
      queue[tail] = idx;
      tail += 1;
    };

    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x > 0) enqueue(x - 1, y);
      if (x < width - 1) enqueue(x + 1, y);
      if (y > 0) enqueue(x, y - 1);
      if (y < height - 1) enqueue(x, y + 1);
    }
  };

  for (const edgeColor of edgePalette) {
    fillBackgroundCluster(edgeColor);
  }

  const fillAlreadyTransparentEdges = () => {
    let head = 0;
    let tail = 0;
    const enqueue = (x: number, y: number) => {
      const idx = y * width + x;
      if (background[idx]) return;
      const offset = idx * channels;
      if (data[offset + 3] > 8) return;
      background[idx] = 1;
      queue[tail] = idx;
      tail += 1;
    };

    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x > 0) enqueue(x - 1, y);
      if (x < width - 1) enqueue(x + 1, y);
      if (y > 0) enqueue(x, y - 1);
      if (y < height - 1) enqueue(x, y + 1);
    }
  };

  fillAlreadyTransparentEdges();

  for (let idx = 0; idx < pixelCount; idx += 1) {
    const offset = idx * channels;
    if (background[idx]) {
      data[offset + 3] = 0;
      continue;
    }

    const x = idx % width;
    const y = Math.floor(idx / width);
    let neighboringBackground = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        neighboringBackground += background[ny * width + nx];
      }
    }
    if (neighboringBackground > 0) {
      data[offset + 3] = Math.max(
        120,
        data[offset + 3] - neighboringBackground * 18,
      );
    }
  }

  return sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
};


export { dataUrlToResponse, resolveImageBuffer, makeBackgroundTransparent };