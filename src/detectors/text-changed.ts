import type { DetectorIssue } from "../types/index.js";
import type { OcrCompareResult } from "../types/index.js";

const ERROR_SIMILARITY = 0.9;
const WARNING_SIMILARITY = 1.0;

export function textChangedDetect(
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
): DetectorIssue[] {
  if (!ocrCompareResult) return [];

  const issues: DetectorIssue[] = [];
  for (const pair of ocrCompareResult.pairs) {
    const sim = textSimilarity(pair.baseline.text, pair.current?.text ?? "");
    if (sim >= 1.0) continue;

    issues.push({
      category: "text_changed",
      severity: sim < ERROR_SIMILARITY ? "error" : "warning",
      pageName,
      viewportName,
      description: `文字变更: "${truncate(pair.baseline.text, 40)}" → "${truncate(pair.current?.text ?? "(无)", 40)}" (相似度: ${(sim * 100).toFixed(1)}%)`,
      detail: {
        baselineText: pair.baseline.text,
        currentText: pair.current?.text ?? null,
        similarity: sim,
        baselineBbox: pair.baseline.bbox,
        currentBbox: pair.current?.bbox ?? null,
      },
    });
  }
  return issues;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function textSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0;
  const aNorm = a.toLowerCase().replace(/\s+/g, "");
  const bNorm = b.toLowerCase().replace(/\s+/g, "");
  if (aNorm === bNorm) return 0.95;
  const longer = aNorm.length > bNorm.length ? aNorm : bNorm;
  const shorter = aNorm.length > bNorm.length ? bNorm : aNorm;
  if (longer.length === 0) return 0;
  const editDist = levenshtein(shorter, longer);
  return (longer.length - editDist) / longer.length;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  let curr: number[] = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
