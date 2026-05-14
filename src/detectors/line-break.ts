import type { DetectorIssue } from "../types/index.js";
import type { OcrCompareResult, OcrBlock } from "../types/index.js";

/**
 * 换行异常检测器。检测同一段文字在基准与当前版本之间换行位置是否异常。
 *
 * 规则：对于已匹配的文字对，如果 baseline 文字的边界框高度明显小于 current
 * 文字的边界框高度（>1.5倍），说明可能发生了换行异常（文字被折行/压缩）。
 *
 * 后续可用 OpenCV 做更精确的行级检测。
 */
export function lineBreakDetect(
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
): DetectorIssue[] {
  if (!ocrCompareResult) return [];

  const issues: DetectorIssue[] = [];
  for (const pair of ocrCompareResult.pairs) {
    if (!pair.current) continue;
    const bH = bboxHeight(pair.baseline.bbox);
    const cH = bboxHeight(pair.current.bbox);
    if (bH <= 0 || cH <= 0) continue;

    const ratio = cH / bH;
    // 当前版本高度超过基准 1.5 倍，可能是文字换行导致高度增加
    if (ratio < 1.5) continue;

    issues.push({
      category: "line_break_anomaly",
      severity: "warning",
      pageName,
      viewportName,
      description: `疑似换行异常: "${truncate(pair.baseline.text, 40)}" 当前高度 ${Math.round(cH)}px 远超基准 ${Math.round(bH)}px（倍数 ${ratio.toFixed(1)}）`,
      detail: {
        baselineText: pair.baseline.text,
        currentText: pair.current.text,
        baselineBbox: pair.baseline.bbox,
        currentBbox: pair.current.bbox,
        heightRatio: Math.round(ratio * 10) / 10,
      },
    });
  }
  return issues;
}

function bboxHeight(bbox: [number, number, number, number]): number {
  return bbox[3] - bbox[1];
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
