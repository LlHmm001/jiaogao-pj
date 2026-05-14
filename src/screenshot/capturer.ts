import { chromium, firefox, webkit, type Browser, type BrowserContext } from "playwright";
import { writeFileSync, mkdirSync, existsSync, copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PageConfig, ViewportConfig, ScreenshotResult } from "../types/index.js";
import type { AppConfig } from "../types/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

// ========== URL 截图模式 ==========

export async function captureScreenshotUrl(
  cfg: AppConfig,
  page: PageConfig,
  viewport: ViewportConfig,
  variant: "baseline" | "current",
): Promise<ScreenshotResult> {
  const url = variant === "baseline" ? page.baseline_url! : page.current_url!;
  const outDir = resolve(ROOT, "screenshots", variant);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const filename = `${variant}_${page.name}_${viewport.name}.png`;
  const outPath = resolve(outDir, filename);

  let browser: Browser | null = null;
  try {
    const launcher = cfg.browserType === "firefox" ? firefox : cfg.browserType === "webkit" ? webkit : chromium;
    browser = await launcher.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const ctx: BrowserContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const pg = await ctx.newPage();
    await pg.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const buffer = await pg.screenshot({ fullPage: false, type: "png" });
    writeFileSync(outPath, buffer);
    await ctx.close();
  } finally {
    if (browser) await browser.close();
  }

  return {
    pageName: page.name,
    viewportName: viewport.name,
    baselinePath: variant === "baseline" ? outPath : "",
    currentPath: variant === "current" ? outPath : "",
    viewport: { width: viewport.width, height: viewport.height },
  };
}

export async function captureBothUrls(
  cfg: AppConfig,
  page: PageConfig,
  viewport: ViewportConfig,
): Promise<ScreenshotResult> {
  const [baselineResult, currentResult] = await Promise.all([
    captureScreenshotUrl(cfg, page, viewport, "baseline"),
    captureScreenshotUrl(cfg, page, viewport, "current"),
  ]);
  return {
    pageName: page.name,
    viewportName: viewport.name,
    baselinePath: baselineResult.baselinePath,
    currentPath: currentResult.currentPath,
    viewport: { width: viewport.width, height: viewport.height },
  };
}

// ========== 本地图片对比模式 ==========

export function captureFromImages(
  page: PageConfig,
  viewport: ViewportConfig,
): ScreenshotResult {
  const baselineSrc = resolvePath(page.baseline_image!);
  const currentSrc = resolvePath(page.current_image!);

  const baselineDir = resolve(ROOT, "screenshots", "baseline");
  const currentDir = resolve(ROOT, "screenshots", "current");
  if (!existsSync(baselineDir)) mkdirSync(baselineDir, { recursive: true });
  if (!existsSync(currentDir)) mkdirSync(currentDir, { recursive: true });

  const baselineDst = resolve(baselineDir, `baseline_${page.name}_${viewport.name}.png`);
  const currentDst = resolve(currentDir, `current_${page.name}_${viewport.name}.png`);

  copyFileSync(baselineSrc, baselineDst);
  copyFileSync(currentSrc, currentDst);

  return {
    pageName: page.name,
    viewportName: viewport.name,
    baselinePath: baselineDst,
    currentPath: currentDst,
    viewport: { width: viewport.width, height: viewport.height },
  };
}

function resolvePath(p: string): string {
  if (resolve(p) === p) return p; // absolute
  return resolve(ROOT, p);
}
