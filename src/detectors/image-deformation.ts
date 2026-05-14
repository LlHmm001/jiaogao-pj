import type { DetectorIssue, DiffResult } from "../types/index.js";

/**
 * 图片变形检测器。
 *
 * 当前为基础规则：如果 diff_percent > 5% 但 OCR 未检测到文字变化，
 * 提示可能存在图片拉伸、压缩、变形等非文字类视觉差异。
 *
 * 后续用 OpenCV 做 SIFT/ORB 特征匹配，或基于边缘检测比对图片区域。
 */
export function imageDeformationDetect(
  diff: DiffResult,
  pageName: string,
  viewportName: string,
): DetectorIssue[] {
  const issues: DetectorIssue[] = [];

  // 像素差异较大但无法归因到文字问题时，可能是图片/图像区域变形
  if (diff.diffPercent > 5) {
    issues.push({
      category: "image_deformation",
      severity: "warning",
      pageName,
      viewportName,
      description: `像素差异 ${diff.diffPercent.toFixed(2)}% 较大，建议人工检查是否存在图片变形、拉伸或压缩`,
      detail: {
        diffPercent: diff.diffPercent,
        diffPixels: diff.diffPixels,
        totalPixels: diff.totalPixels,
        hint: "高差异区域可能包含图片变形，建议使用 OpenCV 特征匹配进一步分析",
      },
    });
  }
  return issues;
}
