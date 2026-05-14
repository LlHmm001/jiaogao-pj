/**
 * OpenAI-compatible LLM client.
 *
 * Supports any provider that exposes an OpenAI-compatible chat completions API:
 * OpenAI, DeepSeek, 通义千问, 智谱 GLM, OpenRouter, Ollama, etc.
 *
 * Configure via env vars:
 *   LLM_API_URL  — endpoint (default: https://api.openai.com/v1)
 *   LLM_API_KEY  — API key
 *   LLM_MODEL    — model name (default: gpt-4o)
 *   LLM_TIMEOUT  — request timeout ms (default: 30000)
 */

export interface LlmConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeout: number;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LlmResult {
  ok: true;
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface LlmError {
  ok: false;
  error: string;
}

export type LlmOutcome = LlmResult | LlmError;

export function loadLlmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  return {
    apiUrl: process.env.LLM_API_URL || "https://api.openai.com/v1",
    apiKey,
    model: process.env.LLM_MODEL || "gpt-4o",
    timeout: parseEnvInt("LLM_TIMEOUT", 30000),
  };
}

export async function chat(cfg: LlmConfig, req: LlmRequest): Promise<LlmOutcome> {
  const url = cfg.apiUrl.replace(/\/+$/, "") + "/chat/completions";

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.1,
    max_tokens: req.maxTokens ?? 2000,
  };

  if (req.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `LLM API HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }

    const json = await resp.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = json.choices?.[0]?.message?.content ?? "";
    const usage = json.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      ok: true,
      content,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: (err as Error).message };
  }
}

function parseEnvInt(key: string, defaultVal: number): number {
  const val = process.env[key];
  if (!val) return defaultVal;
  const n = parseInt(val, 10);
  if (isNaN(n)) throw new Error(`环境变量 ${key} 必须为整数，当前值为: "${val}"`);
  return n;
}
