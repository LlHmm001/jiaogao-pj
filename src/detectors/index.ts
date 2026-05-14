import type { DetectorIssue, DiffResult } from "../types/index.js";
import { imageDeformationDetect } from "./image-deformation.js";

export function runAllDetectors(diff: DiffResult): DetectorIssue[] {
  try {
    return imageDeformationDetect(diff, diff.pageName, diff.viewportName);
  } catch (err) {
    console.error(`[检测器:image_deformation] 错误:`, (err as Error).message);
    return [];
  }
}

export function getDetectorList(): Array<{ category: string; needsOcr: boolean }> {
  return [{ category: "image_deformation", needsOcr: false }];
}
