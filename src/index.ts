import { loadConfig, getInputMode } from "./config/loader.js";
import { captureBothUrls, captureFromImages } from "./screenshot/capturer.js";
import { computeDiff } from "./diff/pixel-diff.js";
import { runAllDetectors } from "./detectors/index.js";
import { generateReports } from "./report/generator.js";
import type {
  AppConfig,
  PageConfig,
  ViewportConfig,
  ComparisonResult,
  ReportData,
  ReportPageConfig,
  ReportSummary,
} from "./types/index.js";

export async function main(): Promise<void> {
  console.log("=== 视觉校稿工具 Visual Proofreader ===\n");
  const cfg = loadConfig();

  const imagePages = cfg.pages.filter((p) => getInputMode(p) === "image");
  const urlPages = cfg.pages.filter((p) => getInputMode(p) === "url");

  console.log(`已加载 ${cfg.pages.length} 个页面对比（${urlPages.length} 个 URL 模式 + ${imagePages.length} 个本地图片模式）`);
  console.log(`视口尺寸: ${cfg.viewports.length} 个 (${cfg.viewports.map(v => v.name).join(", ")})`);
  if (urlPages.length > 0) console.log(`浏览器: ${cfg.browserType}`);
  if (imagePages.length > 0) console.log(`本地图片模式无需浏览器`);
  console.log();

  const comparisons: ComparisonResult[] = [];
  const combinations = buildCombinations(cfg.pages, cfg.viewports);
  console.log(`共 ${combinations.length} 项对比，开始处理...\n`);

  for (let idx = 0; idx < combinations.length; idx++) {
    const { page, viewport } = combinations[idx];
    const mode = getInputMode(page);
    const modeLabel = mode === "image" ? "本地图片" : "URL截图";
    console.log(`[${idx + 1}/${combinations.length}] ${page.name} @ ${viewport.name} [${modeLabel}]`);

    try {
      // 1. 获取图片
      let screenshotResult;
      if (mode === "image") {
        console.log(`  正在加载本地图片...`);
        console.log(`    基准: ${page.baseline_image}`);
        console.log(`    当前: ${page.current_image}`);
        screenshotResult = captureFromImages(page, viewport);
      } else {
        console.log(`  正在截图...`);
        screenshotResult = await captureBothUrls(cfg, page, viewport);
      }

      // 2. 像素对比
      console.log(`  正在计算像素差异...`);
      const diffResult = computeDiff(
        page.name,
        viewport.name,
        screenshotResult.baselinePath,
        screenshotResult.currentPath,
      );
      console.log(`  差异: ${diffResult.diffPercent.toFixed(2)}% (${diffResult.diffPixels.toLocaleString()} 像素)`);

      // 3. 检测器（仅图片变形）
      const issues = runAllDetectors(diffResult);
      if (issues.length > 0) {
        console.log(`  检测到 ${issues.length} 个问题`);
      }
      console.log();

      comparisons.push({
        pageName: page.name,
        viewportName: viewport.name,
        inputMode: mode,
        status: "ok",
        screenshot: screenshotResult,
        diff: diffResult,
        issues,
      });
    } catch (err) {
      console.error(`  失败: ${(err as Error).message}\n`);
      comparisons.push({
        pageName: page.name,
        viewportName: viewport.name,
        inputMode: mode,
        status: "failed",
        screenshot: {
          pageName: page.name,
          viewportName: viewport.name,
          baselinePath: "",
          currentPath: "",
          viewport: { width: viewport.width, height: viewport.height },
        },
        diff: {
          pageName: page.name,
          viewportName: viewport.name,
          diffPath: "",
          diffPercent: 0,
          diffPixels: 0,
          totalPixels: 0,
        },
        issues: [],
        error: (err as Error).message,
      });
    }
  }

  // 报告
  console.log("正在生成报告...");
  const summary = buildSummary(comparisons);
  const reportData: ReportData = {
    generatedAt: new Date().toISOString(),
    config: {
      pages: cfg.pages.map((p) => ({
        name: p.name,
        baseline_url: p.baseline_url ?? "",
        current_url: p.current_url ?? "",
        baseline_image: p.baseline_image ?? "",
        current_image: p.current_image ?? "",
        inputMode: getInputMode(p),
      })),
      viewports: cfg.viewports.map((v) => ({ name: v.name, width: v.width, height: v.height })),
      browserType: cfg.browserType,
    },
    summary,
    comparisons,
  };
  generateReports(reportData);
  console.log("报告已保存至 reports/index.html 和 reports/report.json");

  console.log("\n=== 汇总 ===");
  console.log(`对比总数: ${summary.totalComparisons}`);
  console.log(`问题总数: ${summary.totalIssues}`);
  console.log("问题分类:", JSON.stringify(summary.issuesByCategory));
  console.log("完成。\n");
}

function buildCombinations(
  pages: PageConfig[],
  viewports: ViewportConfig[],
): Array<{ page: PageConfig; viewport: ViewportConfig }> {
  const result: Array<{ page: PageConfig; viewport: ViewportConfig }> = [];
  for (const page of pages) {
    for (const viewport of viewports) {
      result.push({ page, viewport });
    }
  }
  return result;
}

function buildSummary(comparisons: ComparisonResult[]): ReportSummary {
  const summary: ReportSummary = {
    totalComparisons: comparisons.length,
    totalIssues: 0,
    issuesByCategory: {},
    issuesBySeverity: {},
  };
  for (const c of comparisons) {
    summary.totalIssues += c.issues.length;
    for (const issue of c.issues) {
      summary.issuesByCategory[issue.category] = (summary.issuesByCategory[issue.category] ?? 0) + 1;
      summary.issuesBySeverity[issue.severity] = (summary.issuesBySeverity[issue.severity] ?? 0) + 1;
    }
  }
  return summary;
}

const isMain = process.argv[1]?.includes("index.ts") || process.argv[1]?.includes("src/index");
if (isMain) {
  main().catch((err) => {
    console.error("致命错误:", err);
    process.exit(1);
  });
}
