import type { DetectorIssue } from "../types/index.js";

/**
 * 文字方向检测器（预留）。
 * TODO: 后续通过 Unicode 双向字符分析，或对比 RTL 语言（阿语、希伯来语等）
 * OCR 文本块顺序来检测方向变化：
 *     - 对比基准与当前的文本块排列顺序
 *     - 发现反转序列则标记为潜在方向问题
 */
export function textDirectionChangedDetect(): DetectorIssue[] {
  return [];
}
