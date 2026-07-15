import fs from "node:fs";
import path from "node:path";

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
const failures = [];

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
  `Bundle budget OK: initial ${(initial?.bytes / 1024).toFixed(1)} KiB, total ${(totalBytes / 1024).toFixed(1)} KiB.`,
);
