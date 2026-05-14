import { runProofreadAgent } from "../src/agents/proofread-agent.js";

const issues = [
  { category: "text_changed", severity: "error" as const, pageName: "t", viewportName: "d",
    description: "文字变更: 创新与定位专家 → 新与定位专家",
    detail: { baselineText: "创新与定位专家", currentText: "新与定位专家" } },
  { category: "text_missing", severity: "warning" as const, pageName: "t", viewportName: "d",
    description: '文字 "炙畹踏?块" 缺失',
    detail: { baselineText: "炙畹踏?块", currentText: "" } },
  { category: "text_changed", severity: "error" as const, pageName: "t", viewportName: "d",
    description: "文字变更: 其中多家翻倍增长 → 其中多家翻倍增鼍",
    detail: { baselineText: "其中多家翻倍增长", currentText: "其中多家翻倍增鼍" } },
  { category: "image_deformation", severity: "warning" as const, pageName: "t", viewportName: "d",
    description: "图片变形 — 不受文字审核影响", detail: {} },
];

async function main() {
  const r = await runProofreadAgent(issues, null, "t", "d");
  console.log("=== Agent 审核结果 ===");
  console.log(`真实问题: ${r.realCount}  噪声(已过滤): ${r.noiseCount}  LLM: ${r.llmOk ? "启用" : "启发式"}`);
  console.log("");
  console.log("保留:");
  for (const iss of r.issues) {
    const review = (iss as Record<string, unknown>).review as Record<string, string> | undefined;
    const tag = review ? `[${review.verdict}]` : "[无审核]";
    console.log(`  ${tag} ${iss.category}: ${iss.description.slice(0, 60)}`);
  }
  console.log(`\n过滤了 ${r.noiseCount} 个 OCR 噪声（炙畹踏?块 + 翻倍增鼍）`);
}

main();
