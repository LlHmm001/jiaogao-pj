/**
 * OCR 质量审核 Agent
 *
 * 核心问题：OCR 识别不准导致大量误报
 *   - 乱码识别："炙畹踏?块" 是无意义字符
 *   - 字符丢失："创新与定位专家" → "新与定位专家" (漏首字)
 *   - 字符误识："翻倍增长" → "翻倍增鼍" (形近字误认)
 *
 * 方案：将检测器产出的所有文字问题发送给 LLM，
 * LLM 判断每个问题是「真实变化」还是「OCR 噪声」，
 * 过滤掉噪声，只保留真实问题。
 */

import type { DetectorIssue, OcrCompareResult, OcrBlock } from "../types/index.js";
import { loadLlmConfig, chat } from "../llm/client.js";

// ---- types ----

export interface ReviewedIssue extends DetectorIssue {
  /** LLM 审核结果 */
  review: {
    verdict: "real" | "ocr_noise" | "uncertain";
    reason: string;
  };
}

export interface AgentReport {
  /** 过滤后只保留真实问题 */
  issues: ReviewedIssue[];
  /** OCR 噪声数量 */
  noiseCount: number;
  /** 真实问题数量 */
  realCount: number;
  /** LLM 调用是否成功 */
  llmOk: boolean;
}

// ---- agent ----

export async function runProofreadAgent(
  allIssues: DetectorIssue[],
  ocrCompareResult: OcrCompareResult | null,
  pageName: string,
  viewportName: string,
): Promise<AgentReport> {
  // 只审核文字相关的问题
  const textCategories = new Set([
    "text_missing", "text_changed", "text_overflow",
    "line_break_anomaly", "element_overlap", "semantic_change",
  ]);
  const textIssues = allIssues.filter((i) => textCategories.has(i.category));
  const nonTextIssues = allIssues.filter((i) => !textCategories.has(i.category));

  if (textIssues.length === 0) {
    return {
      issues: nonTextIssues as ReviewedIssue[],
      noiseCount: 0, realCount: 0, llmOk: true,
    };
  }

  // Try LLM review
  const cfg = loadLlmConfig();
  if (!cfg) {
    // No LLM configured — apply heuristic filter instead
    const filtered = heuristicFilter(textIssues);
    return {
      issues: [...filtered, ...nonTextIssues] as ReviewedIssue[],
      noiseCount: textIssues.length - filtered.length,
      realCount: filtered.length,
      llmOk: false,
    };
  }

  // Build LLM review items
  const reviewItems = textIssues.map((iss, i) => ({
    id: i,
    category: iss.category,
    description: iss.description,
    baselineText: (iss.detail as Record<string, unknown>)?.baselineText ?? "",
    currentText: (iss.detail as Record<string, unknown>)?.currentText ?? "",
    confidence: (iss.detail as Record<string, unknown>)?.baselineConfidence ?? 0,
  }));

  const systemPrompt = `你是 OCR 文字质量审核助手。OCR 引擎在处理中英文混合内容时会产生以下典型错误：

1. **乱码识别** — 正常文字被识别成无意义字符组合。特征：含罕见字/符号/问号
   例："创新与定位专家" → "炙畹踏?块 专家"
2. **字符丢失** — 首尾字符被切掉。特征：文本比原文短 1-2 个字，语义不完整
   例："创新与定位专家" → "新与定位专家"
3. **字符误识** — 形近字被识别错。特征：看起来像但意思不对
   例："翻倍增长" → "翻倍增鼍"
4. **多余识别** — 背景噪点/装饰元素被当作文本
5. **合并/拆分** — 多行合并或一行拆分

你的任务：判断每个差异是「真实内容变化」还是「OCR 噪声」。

判断标准：
- OCR 噪声：差异可以用上述 5 种 OCR 错误类型解释，文本中有罕见字符/问号/乱码/明显截断
- 真实变化：两个文本都通顺可读、语义不同、没有 OCR 错误的典型特征
- 不确定：无法判断

只返回 JSON，格式：
{
  "results": [
    {"id": 0, "verdict": "ocr_noise", "reason": "原因"},
    ...
  ]
}`;

  const userPrompt = `审核以下文字差异是否为 OCR 噪声：

${JSON.stringify(reviewItems, null, 2)}`;

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
    // LLM failed — fall back to heuristic filter
    const filtered = heuristicFilter(textIssues);
    return {
      issues: [...filtered, ...nonTextIssues] as ReviewedIssue[],
      noiseCount: textIssues.length - filtered.length,
      realCount: filtered.length,
      llmOk: false,
    };
  }

  // Parse LLM response
  try {
    const parsed = JSON.parse(result.content) as {
      results?: Array<{ id: number; verdict: string; reason: string }>;
    };

    const reviews = new Map<number, { verdict: string; reason: string }>();
    for (const r of parsed.results ?? []) {
      reviews.set(r.id, r);
    }

    let noiseCount = 0;
    let realCount = 0;
    const reviewedIssues: ReviewedIssue[] = [];

    for (let i = 0; i < textIssues.length; i++) {
      const review = reviews.get(i);
      const verdict = (review?.verdict ?? "uncertain") as ReviewedIssue["review"]["verdict"];
      const reason = review?.reason ?? "LLM 未返回审核结果";

      if (verdict === "real") realCount++;
      else if (verdict === "ocr_noise") noiseCount++;

      // Only keep non-noise issues
      if (verdict !== "ocr_noise") {
        reviewedIssues.push({
          ...textIssues[i],
          severity: verdict === "uncertain" ? "info" : textIssues[i].severity,
          review: { verdict, reason },
        });
      }
    }

    return {
      issues: [...reviewedIssues, ...nonTextIssues] as ReviewedIssue[],
      noiseCount, realCount, llmOk: true,
    };
  } catch {
    const filtered = heuristicFilter(textIssues);
    return {
      issues: [...filtered, ...nonTextIssues] as ReviewedIssue[],
      noiseCount: textIssues.length - filtered.length,
      realCount: filtered.length,
      llmOk: false,
    };
  }
}

// ---- heuristic fallback (no LLM) ----

/**
 * OCR 噪声特征库 — 无需 LLM 也能拦截大部分乱码
 *
 * 触发条件（满足任一即过滤）：
 * 1. 含生僻字/乱码字符（Unicode 扩展区、非常用汉字）
 * 2. 含多个 ? / � 等 OCR 失败标记
 * 3. 中英文随机混合（如 "创新with定位" 这种不合理混排）
 * 4. 全是标点符号/特殊字符，没有实际文字
 * 5. 单字且置信度极低（< 0.3）
 */
function heuristicFilter(issues: DetectorIssue[]): DetectorIssue[] {
  return issues.filter((iss) => {
    const detail = iss.detail as Record<string, unknown>;
    const baselineText = String(detail?.baselineText ?? "");
    const currentText = String(detail?.currentText ?? "");
    const text = baselineText + currentText;
    if (!text.trim()) return true; // keep empty — let human decide

    // 1. 含 OCR 典型乱码字符
    //    Unicode CJK Extension B+ 的生僻字大概率是 OCR 误认
    const garbledPattern = /[\u{20000}-\u{2FFFF}\u{E000}-\u{F8FF}鼍畹蟆袤炙鼯曛蹯瞀窳袤]/u;
    if (garbledPattern.test(text)) return false;

    // 2. 含过多 ? / � / 口（OCR 无法识别时的占位符）
    const failMarkers = (text.match(/[\?�口]/g) || []).length;
    if (failMarkers >= 2 && text.length < 20) return false;

    // 3. 乱码式中英混合：在同一词内中英无规律掺杂
    //    正常: "iPhone 15 发布" → 有空格分隔
    //    异常: "创新with定位" → 无缝混合
    const mixedScriptPattern = /[一-鿿][a-zA-Z]{2,}[一-鿿]|[a-zA-Z]{2,}[一-鿿][a-zA-Z]/;
    if (mixedScriptPattern.test(text)) return false;

    // 4. 几乎全是标点符号，没有实词
    const wordChars = text.replace(/[\s\p{P}\p{S}]/gu, "");
    if (wordChars.length <= 1 && text.length >= 3) return false;

    // 5. 文本极短且置信度极低
    const confidence = Number(detail?.baselineConfidence ?? 0);
    if (text.trim().length <= 2 && confidence > 0 && confidence < 0.3) return false;

    return true;
  });
}
