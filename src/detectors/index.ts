import type { DetectorIssue, DiffResult } from "../types/index.js";
import type { OcrOutcome, OcrCompareResult } from "../types/index.js";
import { textMissingDetect } from "./text-missing.js";
import { textChangedDetect } from "./text-changed.js";
import { layoutShiftDetect } from "./layout-shift.js";
import { textDirectionChangedDetect } from "./text-direction-changed.js";
import { textOverflowDetect } from "./text-overflow.js";
import { lineBreakDetect } from "./line-break.js";
import { imageDeformationDetect } from "./image-deformation.js";
import { elementOverlapDetect } from "./element-overlap.js";
import { llmSemanticDetectAsync } from "./llm-semantic.js";

type DetectFn = (
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
  diff: DiffResult,
) => DetectorIssue[];

interface DetectorEntry {
  category: string;
  detect: DetectFn;
  needsOcr: boolean;
  needsLlm: boolean;
}

/** 全部 9 个检测器，按原始需求顺序排列 */
const ALL_DETECTORS: DetectorEntry[] = [
  { category: "text_missing",           needsOcr: true,  needsLlm: false, detect: (ocr, pn, vn, _d) => textMissingDetect(ocr, pn, vn) },
  { category: "text_changed",           needsOcr: true,  needsLlm: false, detect: (ocr, pn, vn, _d) => textChangedDetect(ocr, pn, vn) },
  { category: "layout_shift",           needsOcr: true,  needsLlm: false, detect: (ocr, pn, vn, _d) => layoutShiftDetect(ocr, pn, vn) },
  { category: "text_direction_changed", needsOcr: false, needsLlm: false, detect: () => textDirectionChangedDetect() },
  { category: "text_overflow",          needsOcr: true,  needsLlm: false, detect: (ocr, pn, vn, d) => textOverflowDetect(ocr, d, pn, vn) },
  { category: "line_break_anomaly",     needsOcr: true,  needsLlm: false, detect: (ocr, pn, vn, _d) => lineBreakDetect(ocr, pn, vn) },
  { category: "image_deformation",      needsOcr: false, needsLlm: false, detect: (_ocr, pn, vn, d) => imageDeformationDetect(d, pn, vn) },
  { category: "element_overlap",        needsOcr: true,  needsLlm: false, detect: (ocr, pn, vn, _d) => elementOverlapDetect(ocr, pn, vn) },
  { category: "semantic_change",        needsOcr: true,  needsLlm: true,  detect: () => [] },
];

export function runAllDetectors(
  diff: DiffResult,
  _baselineOcr: OcrOutcome,
  _currentOcr: OcrOutcome,
  ocrCompareResult: OcrCompareResult | null,
): DetectorIssue[] {
  const issues: DetectorIssue[] = [];

  for (const entry of ALL_DETECTORS) {
    if (entry.needsLlm) continue; // LLM detector runs async
    try {
      const result = entry.detect(ocrCompareResult, diff.pageName, diff.viewportName, diff);
      issues.push(...result);
    } catch (err) {
      console.error(`[检测器:${entry.category}] 错误:`, (err as Error).message);
    }
  }

  return issues;
}

/** Run sync detectors + async LLM detector. Returns combined issues. */
export async function runAllDetectorsAsync(
  diff: DiffResult,
  baselineOcr: OcrOutcome,
  currentOcr: OcrOutcome,
  ocrCompareResult: OcrCompareResult | null,
): Promise<DetectorIssue[]> {
  const issues = runAllDetectors(diff, baselineOcr, currentOcr, ocrCompareResult);

  // Run LLM detector asynchronously
  try {
    const llmIssues = await llmSemanticDetectAsync(ocrCompareResult, diff.pageName, diff.viewportName);
    issues.push(...llmIssues);
  } catch (err) {
    console.error(`[检测器:semantic_change] LLM 错误:`, (err as Error).message);
  }

  return issues;
}

/** 导出检测器列表供报告使用 */
export function getDetectorList(): Array<{ category: string; needsOcr: boolean; needsLlm: boolean }> {
  return ALL_DETECTORS.map((d) => ({ category: d.category, needsOcr: d.needsOcr, needsLlm: d.needsLlm }));
}
