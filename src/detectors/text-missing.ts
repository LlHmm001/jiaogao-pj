import type { DetectorIssue, Detector } from "../types/index.js";
import type { OcrCompareResult, OcrOutcome } from "../types/index.js";

export function textMissingDetect(
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
): DetectorIssue[] {
  if (!ocrCompareResult) return [];

  return ocrCompareResult.unmatchedBaseline.map((block) => ({
    category: "text_missing" as const,
    severity: "warning" as const,
    pageName,
    viewportName,
    description: `文字 "${truncate(block.text, 60)}" 在基准中存在，但当前版本中缺失`,
    detail: {
      baselineText: block.text,
      baselineBbox: block.bbox,
      baselineConfidence: block.confidence,
    },
  }));
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
