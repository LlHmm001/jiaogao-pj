import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG, type PNGWithMetadata } from "pngjs";
import pixelmatch from "pixelmatch";
import type { DiffResult } from "../types/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

export function computeDiff(
  pageName: string,
  viewportName: string,
  baselinePath: string,
  currentPath: string,
): DiffResult {
  const baselineBuf = readFileSync(baselinePath);
  const currentBuf = readFileSync(currentPath);

  let baselineImg: PNG | PNGWithMetadata = PNG.sync.read(baselineBuf);
  let currentImg: PNG | PNGWithMetadata = PNG.sync.read(currentBuf);

  // Normalize dimensions if they differ
  if (baselineImg.width !== currentImg.width || baselineImg.height !== currentImg.height) {
    const width = Math.max(baselineImg.width, currentImg.width);
    const height = Math.max(baselineImg.height, currentImg.height);
    baselineImg = padImage(baselineImg, width, height);
    currentImg = padImage(currentImg, width, height);
  }

  const { width, height } = baselineImg;

  const diffImg = new PNG({ width, height });
  const diffCount = pixelmatch(
    baselineImg.data,
    currentImg.data,
    diffImg.data,
    width,
    height,
    { threshold: 0.1 },
  );

  const outDir = resolve(ROOT, "screenshots", "diff");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const diffPath = resolve(outDir, `diff_${pageName}_${viewportName}.png`);
  writeFileSync(diffPath, PNG.sync.write(diffImg));

  const totalPixels = width * height;
  return {
    pageName,
    viewportName,
    diffPath,
    diffPercent: totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0,
    diffPixels: diffCount,
    totalPixels,
  };
}

function padImage(img: PNG | PNGWithMetadata, targetW: number, targetH: number): PNG {
  const padded = new PNG({ width: targetW, height: targetH });
  // Fill with transparent background
  padded.data.fill(0);
  PNG.bitblt(img, padded, 0, 0, img.width, img.height, 0, 0);
  return padded;
}
