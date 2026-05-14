import { loadConfig, getInputMode } from "./config/loader.js";
import { captureBothUrls, captureFromImages } from "./screenshot/capturer.js";
import { computeDiff } from "./diff/pixel-diff.js";
import { recognizeText } from "./ocr/client.js";
import { compareOcrResults } from "./ocr/compare.js";
import { runAllDetectorsAsync } from "./detectors/index.js";
import { runProofreadAgent } from "./agents/proofread-agent.js";
import { generateReports } from "./report/generator.js";
import type {
  AppConfig,
  PageConfig,
  ViewportConfig,
  ComparisonResult,
  ReportData,
  ReportPageConfig,
  ReportSummary,
  OcrCompareResult,
  OcrResult,
} from "./types/index.js";

export async function main(): Promise<void> {
  console.log("=== 视觉校稿工具 Visual Proofreader ===\n");
  const cfg = loadConfig();

  const imagePages = cfg.pages.filter((p) => getInputMode(p) === "image");
  const urlPages = cfg.pages.filter((p) => getInputMode(p) === "url");

  console.log(`已加载 ${cfg.pages.length} 个页面对比（${urlPages.length} 个 URL 模式 + ${imagePages.length} 个本地图片模式）`);
  console.log(`视口尺寸: ${cfg.viewports.length} 个 (${cfg.viewports.map(v => v.name).join(", ")})`);
  console.log(`OCR 服务地址: ${cfg.ocrEndpoint}`);
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

      // 3. OCR
      console.log(`  正在 OCR 识别...`);
      const [baselineOcr, currentOcr] = await Promise.all([
        recognizeText(cfg.ocrEndpoint, cfg.ocrTimeout, screenshotResult.baselinePath, page.name, viewport.name, "baseline"),
        recognizeText(cfg.ocrEndpoint, cfg.ocrTimeout, screenshotResult.currentPath, page.name, viewport.name, "current"),
      ]);

      // 4. OCR 对比
      let ocrCompare: OcrCompareResult | null = null;
      if (baselineOcr.status === "ok" && currentOcr.status === "ok") {
        ocrCompare = compareOcrResults(baselineOcr as OcrResult, currentOcr as OcrResult);
        console.log(`  OCR: 基准 ${baselineOcr.blocks.length} 块, 当前 ${currentOcr.blocks.length} 块, ${ocrCompare.pairs.length} 已匹配`);
      } else {
        const failures = [
          baselineOcr.status === "OCR_FAILED" ? "基准" : null,
          currentOcr.status === "OCR_FAILED" ? "当前" : null,
        ].filter(Boolean);
        console.log(`  OCR: 失败 (${failures.join(", ")})`);
      }

      // 5. 检测器
      console.log(`  正在运行检测器...`);
      const rawIssues = await runAllDetectorsAsync(diffResult, baselineOcr, currentOcr, ocrCompare);
      console.log(`  检测器发现 ${rawIssues.length} 个问题`);

      // 5.5. Agent 审核（过滤 OCR 噪声）
      const agentReport = await runProofreadAgent(rawIssues, ocrCompare, page.name, viewport.name);
      const issues = agentReport.issues;
      if (agentReport.noiseCount > 0) {
        console.log(`  Agent 过滤了 ${agentReport.noiseCount} 个 OCR 噪声，保留 ${agentReport.realCount} 个真实问题`);
      }
      console.log(`  最终: ${issues.length} 个问题\n`);

      comparisons.push({
        pageName: page.name,
        viewportName: viewport.name,
        inputMode: mode,
        status: "ok",
        screenshot: screenshotResult,
        diff: diffResult,
        baselineOcr,
        currentOcr,
        ocrCompare,
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
        baselineOcr: {
          pageName: page.name,
          viewportName: viewport.name,
          variant: "baseline",
          status: "OCR_FAILED",
          error: (err as Error).message,
        },
        currentOcr: {
          pageName: page.name,
          viewportName: viewport.name,
          variant: "current",
          status: "OCR_FAILED",
          error: (err as Error).message,
        },
        ocrCompare: null,
        issues: [],
        error: (err as Error).message,
      });
    }
  }

  // 6. 报告
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
      ocrEndpoint: cfg.ocrEndpoint,
      browserType: cfg.browserType,
    },
    summary,
    comparisons,
  };
  generateReports(reportData);
  console.log("报告已保存至 reports/index.html 和 reports/report.json");

  // 最终汇总
  console.log("\n=== 汇总 ===");
  console.log(`对比总数: ${summary.totalComparisons}`);
  console.log(`问题总数: ${summary.totalIssues}`);
  console.log(`OCR 失败: ${summary.ocrFailures}`);
  if (summary.ocrFailures > 0) {
    console.log(`提示: OCR 失败可能是因为 PaddleOCR 服务未启动。`);
    console.log(`      启动命令: docker run -d -p 8866:8866 paddlecloud/paddleocr:latest`);
  }
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
    ocrFailures: 0,
  };
  for (const c of comparisons) {
    summary.totalIssues += c.issues.length;
    for (const issue of c.issues) {
      summary.issuesByCategory[issue.category] = (summary.issuesByCategory[issue.category] ?? 0) + 1;
      summary.issuesBySeverity[issue.severity] = (summary.issuesBySeverity[issue.severity] ?? 0) + 1;
    }
    if (c.baselineOcr.status === "OCR_FAILED") summary.ocrFailures++;
    if (c.currentOcr.status === "OCR_FAILED") summary.ocrFailures++;
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
