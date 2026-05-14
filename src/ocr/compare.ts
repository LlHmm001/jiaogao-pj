import type { OcrResult, OcrBlock, OcrBlockPair, OcrCompareResult } from "../types/index.js";

const SIMILARITY_THRESHOLD = 0.7;
const POSITION_PROXIMITY_PX = 20;

export function compareOcrResults(
  baseline: OcrResult,
  current: OcrResult,
): OcrCompareResult {
  const baselineBlocks = [...baseline.blocks];
  const currentBlocks = [...current.blocks];

  const pairs: OcrBlockPair[] = [];
  const usedCurrentIndices = new Set<number>();

  // Pass 1: text similarity matching
  for (const bBlock of baselineBlocks) {
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < currentBlocks.length; i++) {
      if (usedCurrentIndices.has(i)) continue;
      const sim = textSimilarity(bBlock.text, currentBlocks[i].text);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestSim >= SIMILARITY_THRESHOLD && bestIdx >= 0) {
      pairs.push({ baseline: bBlock, current: currentBlocks[bestIdx] });
      usedCurrentIndices.add(bestIdx);
    }
  }

  // Pass 2: position-based matching for remaining unmatched
  const unmatchedBaseline: OcrBlock[] = [];
  for (const bBlock of baselineBlocks) {
    if (pairs.some((p) => p.baseline === bBlock)) continue;

    let bestIdx = -1;
    let bestDist = POSITION_PROXIMITY_PX + 1;
    const bCenter = bboxCenter(bBlock.bbox);
    for (let i = 0; i < currentBlocks.length; i++) {
      if (usedCurrentIndices.has(i)) continue;
      const cCenter = bboxCenter(currentBlocks[i].bbox);
      const dist = Math.hypot(bCenter[0] - cCenter[0], bCenter[1] - cCenter[1]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDist <= POSITION_PROXIMITY_PX) {
      pairs.push({ baseline: bBlock, current: currentBlocks[bestIdx] });
      usedCurrentIndices.add(bestIdx);
    } else {
      unmatchedBaseline.push(bBlock);
    }
  }

  const unmatchedCurrent: OcrBlock[] = [];
  for (let i = 0; i < currentBlocks.length; i++) {
    if (!usedCurrentIndices.has(i)) {
      unmatchedCurrent.push(currentBlocks[i]);
    }
  }

  return {
    pageName: baseline.pageName,
    viewportName: baseline.viewportName,
    pairs,
    unmatchedBaseline,
    unmatchedCurrent,
  };
}

function bboxCenter(bbox: [number, number, number, number]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
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
