import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const assetsDir = path.resolve("dist/assets");
if (!fs.existsSync(assetsDir)) {
  console.error("Bundle budget check: dist/assets does not exist.");
  process.exit(1);
}

const assets = fs
  .readdirSync(assetsDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({
    file,
    bytes: fs.statSync(path.join(assetsDir, file)).size,
  }));

const totalBytes = assets.reduce((total, asset) => total + asset.bytes, 0);
const initial = assets.find((asset) => asset.file.startsWith("index-"));
const initialBudget = 280_000;
const totalBudget = 700_000;
const publicMenuGzipBudget = 110 * 1024;
const failures = [];

const manifestPath = path.resolve("dist", ".vite", "manifest.json");
let publicMenuGzipBytes = 0;
if (!fs.existsSync(manifestPath)) {
  failures.push("the Vite manifest is missing");
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
  const menuKey = Object.keys(manifest).find((key) =>
    key.endsWith("/features/menu/MenuPage.tsx"),
  );
  if (!entryKey || !menuKey) {
    failures.push("the public menu entries are missing from the Vite manifest");
  } else {
    const visited = new Set();
    const visit = (key) => {
      if (visited.has(key) || !manifest[key]) return;
      visited.add(key);
      for (const dependency of manifest[key].imports || []) visit(dependency);
    };
    visit(entryKey);
    visit(menuKey);
    publicMenuGzipBytes = [...visited].reduce((total, key) => {
      const file = manifest[key]?.file;
      if (!file?.endsWith(".js")) return total;
      const bytes = fs.readFileSync(path.resolve("dist", file));
      return total + zlib.gzipSync(bytes).length;
    }, 0);
    if (publicMenuGzipBytes > publicMenuGzipBudget) {
      failures.push(
        `public menu JavaScript is ${(publicMenuGzipBytes / 1024).toFixed(1)} KiB gzip (budget ${(publicMenuGzipBudget / 1024).toFixed(1)} KiB)`,
      );
    }
  }
}

if (!initial) failures.push("the initial index chunk is missing");
else if (initial.bytes > initialBudget) {
  failures.push(
    `initial chunk is ${(initial.bytes / 1024).toFixed(1)} KiB (budget ${(initialBudget / 1024).toFixed(1)} KiB)`,
  );
}
if (totalBytes > totalBudget) {
  failures.push(
    `all JavaScript is ${(totalBytes / 1024).toFixed(1)} KiB (budget ${(totalBudget / 1024).toFixed(1)} KiB)`,
  );
}

if (failures.length) {
  console.error(`Bundle budget exceeded: ${failures.join("; ")}.`);
  process.exit(1);
}

console.log(
  `Bundle budget OK: initial ${(initial?.bytes / 1024).toFixed(1)} KiB, public menu ${(publicMenuGzipBytes / 1024).toFixed(1)} KiB gzip, total ${(totalBytes / 1024).toFixed(1)} KiB.`,
);
