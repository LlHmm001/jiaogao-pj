import type { DetectorIssue } from "../types/index.js";
import type { OcrCompareResult, OcrBlock } from "../types/index.js";

/**
 * 元素重叠检测器。
 *
 * 规则：检测当前版本中两个 OCR 文本块的边界框是否重叠
 * （IoU > 0 或边界相交），重叠可能意味着排版错误导致元素堆叠。
 *
 * 后续可用 OpenCV 做更精确的轮廓/边缘重叠分析。
 */
export function elementOverlapDetect(
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
): DetectorIssue[] {
  if (!ocrCompareResult) return [];

  const issues: DetectorIssue[] = [];

  // 收集当前版本所有文本块（匹配对中的 current + 未匹配的 current）
  const blocks: OcrBlock[] = [
    ...ocrCompareResult.pairs.map((p) => p.current).filter((b): b is NonNullable<typeof b> => b !== null),
    ...ocrCompareResult.unmatchedCurrent,
  ];

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (bboxesOverlap(blocks[i].bbox, blocks[j].bbox)) {
        issues.push({
          category: "element_overlap",
          severity: "warning",
          pageName,
          viewportName,
          description: `疑似元素重叠: "${truncate(blocks[i].text, 30)}" 与 "${truncate(blocks[j].text, 30)}" 边界框相交`,
          detail: {
            block1: { text: blocks[i].text, bbox: blocks[i].bbox },
            block2: { text: blocks[j].text, bbox: blocks[j].bbox },
          },
        });
      }
    }
  }
  return issues;
}

function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
