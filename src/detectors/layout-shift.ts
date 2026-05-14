import type { DetectorIssue } from "../types/index.js";
import type { OcrCompareResult } from "../types/index.js";

const WARNING_SHIFT_PX = 10;
const ERROR_SHIFT_PX = 20;

export function layoutShiftDetect(
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
): DetectorIssue[] {
  if (!ocrCompareResult) return [];

  const issues: DetectorIssue[] = [];
  for (const pair of ocrCompareResult.pairs) {
    if (!pair.current) continue;
    const bCenter = bboxCenter(pair.baseline.bbox);
    const cCenter = bboxCenter(pair.current.bbox);
    const shiftPx = Math.hypot(bCenter[0] - cCenter[0], bCenter[1] - cCenter[1]);

    if (shiftPx < WARNING_SHIFT_PX) continue;

    issues.push({
      category: "layout_shift",
      severity: shiftPx > ERROR_SHIFT_PX ? "error" : "warning",
      pageName,
      viewportName,
      description: `布局偏移 ${shiftPx.toFixed(1)}px，文字: "${truncate(pair.baseline.text, 40)}"`,
      detail: {
        baselineBbox: pair.baseline.bbox,
        currentBbox: pair.current.bbox,
        shiftPx: Math.round(shiftPx * 10) / 10,
        baselineText: pair.baseline.text,
        shiftX: Math.round((cCenter[0] - bCenter[0]) * 10) / 10,
        shiftY: Math.round((cCenter[1] - bCenter[1]) * 10) / 10,
      },
    });
  }
  return issues;
}

function bboxCenter(bbox: [number, number, number, number]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
