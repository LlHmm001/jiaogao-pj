import type { DetectorIssue, DiffResult } from "../types/index.js";
import type { OcrCompareResult } from "../types/index.js";

const OVERFLOW_TOLERANCE_PX = 5;

export function textOverflowDetect(
  ocrCompareResult: OcrCompareResult | null,
  diff: DiffResult,
  pageName: string,
  viewportName: string,
): DetectorIssue[] {
  if (!ocrCompareResult) return [];

  // Use viewport size from diff as the reference container boundary.
  // In a full version, per-page container boundaries would come from config.
  const containerRight = diff.totalPixels > 0
    ? Math.sqrt(diff.totalPixels) // approximate width from square root
    : 1920;

  const issues: DetectorIssue[] = [];

  // Check current-image blocks for overflow
  const allBlocks = [
    ...ocrCompareResult.pairs.map((p) => p.current).filter((b): b is NonNullable<typeof b> => b !== null),
    ...ocrCompareResult.unmatchedCurrent,
  ];

  for (const block of allBlocks) {
    const rightEdge = block.bbox[2];
    const overflowPx = rightEdge - containerRight;
    if (overflowPx <= OVERFLOW_TOLERANCE_PX) continue;

    issues.push({
      category: "text_overflow",
      severity: "warning",
      pageName,
      viewportName,
      description: `文字溢出: "${truncate(block.text, 40)}" 超出容器 ${Math.round(overflowPx)}px (右边缘 ${Math.round(rightEdge)}，容器边界 ${Math.round(containerRight)})`,
      detail: {
        text: block.text,
        bbox: block.bbox,
        overflowPx: Math.round(overflowPx),
      },
    });
  }
  return issues;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
