import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig, PageConfig, ViewportConfig } from "../types/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

export function loadConfig(): AppConfig {
  const pages = loadJson<PageConfig[]>(resolve(ROOT, "config", "pages.json"), "pages.json");
  const viewports = loadJson<ViewportConfig[]>(resolve(ROOT, "config", "viewports.json"), "viewports.json");

  validatePages(pages);
  validateViewports(viewports);

  const browserType = parseBrowserType(process.env.BROWSER_TYPE);

  return { pages, viewports, browserType };
}

function loadJson<T>(path: string, label: string): T {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`加载 ${label} 失败: ${(err as Error).message}`);
  }
}

function validatePages(pages: PageConfig[]): void {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("config/pages.json 必须是一个非空数组");
  }
  const names = new Set<string>();
  for (const p of pages) {
    if (!p.name || typeof p.name !== "string") {
      throw new Error("每个页面必须有一个非空的 'name' 字段");
    }
    if (!/^[一-龥a-zA-Z0-9_-]+$/.test(p.name)) {
      throw new Error(`页面名称 "${p.name}" 包含非法字符（仅支持中英文、数字、连字符、下划线）`);
    }
    if (names.has(p.name)) {
      throw new Error(`重复的页面名称: "${p.name}"`);
    }
    names.add(p.name);

    const hasUrls = !!(p.baseline_url && p.current_url);
    const hasImages = !!(p.baseline_image && p.current_image);

    if (!hasUrls && !hasImages) {
      throw new Error(
        `页面 "${p.name}" 缺少对比源：请配置 baseline_url+current_url（URL 模式）或 baseline_image+current_image（本地图片模式）`,
      );
    }

    if (hasUrls) {
      if (!isValidUrl(p.baseline_url!)) {
        throw new Error(`页面 "${p.name}" 的 baseline_url 不合法: "${p.baseline_url}"`);
      }
      if (!isValidUrl(p.current_url!)) {
        throw new Error(`页面 "${p.name}" 的 current_url 不合法: "${p.current_url}"`);
      }
    }
  }
}

function validateViewports(viewports: ViewportConfig[]): void {
  if (!Array.isArray(viewports) || viewports.length === 0) {
    throw new Error("config/viewports.json 必须是一个非空数组");
  }
  const names = new Set<string>();
  for (const v of viewports) {
    if (!v.name || typeof v.name !== "string") {
      throw new Error("每个视口必须有一个非空的 'name' 字段");
    }
    if (!/^[一-龥a-zA-Z0-9_-]+$/.test(v.name)) {
      throw new Error(`视口名称 "${v.name}" 包含非法字符（仅支持中英文、数字、连字符、下划线）`);
    }
    if (names.has(v.name)) {
      throw new Error(`重复的视口名称: "${v.name}"`);
    }
    names.add(v.name);
    if (!Number.isInteger(v.width) || v.width < 1 || v.width > 7680) {
      throw new Error(`视口 "${v.name}" 的宽度不合法: ${v.width} (范围 1-7680)`);
    }
    if (!Number.isInteger(v.height) || v.height < 1 || v.height > 7680) {
      throw new Error(`视口 "${v.name}" 的高度不合法: ${v.height} (范围 1-7680)`);
    }
  }
}

function parseBrowserType(val: string | undefined): AppConfig["browserType"] {
  if (!val) return "chromium";
  if (val === "chromium" || val === "firefox" || val === "webkit") return val;
  throw new Error(`BROWSER_TYPE 必须为 chromium、firefox 或 webkit，当前值为: "${val}"`);
}

function isValidUrl(s: string): boolean {
  return /^https?:\/\/.+/.test(s);
}

export function getInputMode(page: PageConfig): "url" | "image" {
  if (page.baseline_image && page.current_image) return "image";
  return "url";
}
