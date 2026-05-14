import { readFileSync } from "node:fs";
import type { OcrBlock, OcrOutcome } from "../types/index.js";

export async function recognizeText(
  ocrEndpoint: string,
  ocrTimeout: number,
  imagePath: string,
  pageName: string,
  viewportName: string,
  variant: "baseline" | "current",
): Promise<OcrOutcome> {
  try {
    const imageBuf = readFileSync(imagePath);
    const base64 = imageBuf.toString("base64");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ocrTimeout);

    const resp = await fetch(`${ocrEndpoint}/ocr/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [base64] }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return {
        pageName,
        viewportName,
        variant,
        status: "OCR_FAILED",
        error: `OCR service returned HTTP ${resp.status}: ${resp.statusText}`,
      };
    }

    const json = await resp.json();
    const blocks = parseOcrResponse(json);

    return {
      pageName,
      viewportName,
      variant,
      status: "ok",
      blocks,
      rawResponse: json,
    };
  } catch (err) {
    return {
      pageName,
      viewportName,
      variant,
      status: "OCR_FAILED",
      error: (err as Error).message,
    };
  }
}

function parseOcrResponse(json: unknown): OcrBlock[] {
  // PaddleOCR HTTP API returns: { results: [[ { text, confidence, text_region } ]] }
  // Each image maps to one entry in the results array
  const data = json as Record<string, unknown>;
  const results = data.results ?? data.data ?? [];

  if (!Array.isArray(results) || results.length === 0) {
    // Try alternate response format: { msg: "", results: [...] }
    // PaddleOCR API often returns results directly as an array of text blocks
    if (Array.isArray(data)) {
      return parseOcrBlocks(data);
    }
    return [];
  }

  const firstImageResult = results[0];
  if (Array.isArray(firstImageResult)) {
    return parseOcrBlocks(firstImageResult);
  }
  return [];
}

function parseOcrBlocks(items: unknown[]): OcrBlock[] {
  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const obj = item as Record<string, unknown>;
      const text = String(obj.text ?? "");
      const confidence = typeof obj.confidence === "number" ? obj.confidence : 0;
      const region = (obj.text_region ?? obj.bbox ?? obj.box ?? [0, 0, 0, 0]) as number[];
      const bbox: [number, number, number, number] = region.length >= 4
        ? [region[0], region[1], region[2], region[3]]
        : [0, 0, 0, 0];
      return { text, bbox, confidence };
    });
}
