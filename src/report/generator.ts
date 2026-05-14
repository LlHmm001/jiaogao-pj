import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReportData } from "../types/index.js";
import { buildHtmlReport } from "./html-template.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

export function generateReports(data: ReportData): void {
  const outDir = resolve(ROOT, "reports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const html = buildHtmlReport(data);
  writeFileSync(resolve(outDir, "index.html"), html, "utf-8");

  const json = JSON.stringify(data, null, 2);
  writeFileSync(resolve(outDir, "report.json"), json, "utf-8");
}
