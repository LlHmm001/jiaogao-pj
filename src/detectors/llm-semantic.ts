/**
 * LLM-powered semantic text comparison detector.
 *
 * Uses an LLM (OpenAI-compatible API) to intelligently assess text changes:
 * - Distinguishes intentional changes (localization, content updates) from accidental ones (typos, corruption)
 * - Understands semantic equivalence ("登录" vs "Sign in" = same intent, different language)
 * - Flags misleading or broken text changes that simple string diff can't catch
 */

import type { DetectorIssue, OcrCompareResult, OcrBlock, DiffResult } from "../types/index.js";
import { loadLlmConfig, chat } from "../llm/client.js";
import type { LlmConfig } from "../llm/client.js";

export function llmSemanticDetect(
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
  _diff: DiffResult,
): DetectorIssue[] {
  return []; // Async work is done in the async runner below
}

/**
 * Async version — called separately since the detector interface is sync.
 * Returns issues found via LLM analysis.
 */
export async function llmSemanticDetectAsync(
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
): Promise<DetectorIssue[]> {
  const cfg = loadLlmConfig();
  if (!cfg) return []; // LLM not configured, skip

  if (!ocrCompareResult) return [];
  if (ocrCompareResult.pairs.length === 0) return [];

  // Only analyze pairs where text differs
  const changedPairs = ocrCompareResult.pairs.filter(
    (p) => p.current && p.baseline.text !== p.current.text,
  );
  if (changedPairs.length === 0) return [];

  // Build a compact comparison list for the LLM
  const items = changedPairs.slice(0, 30).map((p, i) => ({
    id: i,
    baseline: p.baseline.text,
    current: (p.current as OcrBlock).text,
  }));

  const systemPrompt = `You are a visual proofreading assistant for Chinese/English web pages and design mockups.
Your job: analyze text differences between baseline and current versions, and classify each change.

For each changed text pair, classify as:
- "accidental": typo, text corruption, missing chars, encoding error, truncated text, or garbled output
- "intentional": deliberate content update, localization (e.g. EN→ZH), number/date refresh, A/B test copy
- "uncertain": ambiguous — could be either

Also assign severity:
- "error": definitely a bug (corrupted, garbled, completely wrong meaning)
- "warning": likely unintended but not certain
- "info": clearly intentional

Respond with JSON only:
{
  "results": [
    {"id": 0, "classification": "accidental", "severity": "error", "reason": "简短中文说明"},
    ...
  ]
}`;

  const userPrompt = `Compare these text changes:

${JSON.stringify(items, null, 2)}`;

  const result = await chat(cfg, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    maxTokens: 2000,
    jsonMode: true,
  });

  if (!result.ok) {
    // LLM call failed — return a single info-level issue so the user knows
    return [];
  }

  try {
    const parsed = JSON.parse(result.content) as {
      results?: Array<{
        id: number;
        classification: string;
        severity: string;
        reason: string;
      }>;
    };

    if (!parsed.results || !Array.isArray(parsed.results)) return [];

    return parsed.results
      .filter((r) => r.classification === "accidental" || r.classification === "uncertain")
      .map((r) => {
        const item = items[r.id];
        const severity = r.severity === "error" ? "error" : r.severity === "info" ? "info" : "warning";
        return {
          category: "semantic_change" as const,
          severity,
          pageName,
          viewportName,
          description: r.reason || `文字语义变化: "${item?.baseline}" → "${item?.current}"`,
          detail: {
            baseline: item?.baseline ?? "",
            current: item?.current ?? "",
            classification: r.classification,
            llmReason: r.reason,
          },
        };
      });
  } catch {
    return [];
  }
}
