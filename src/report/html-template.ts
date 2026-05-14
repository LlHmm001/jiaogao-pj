import { readFileSync } from "node:fs";
import type { ReportData, ComparisonResult, DetectorIssue, OcrBlockPair } from "../types/index.js";

export function buildHtmlReport(data: ReportData): string {
  const images = readAllImages(data.comparisons);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>视觉校稿报告 — ${data.generatedAt}</title>
<style>
  :root {
    --bg: #f5f6f8; --card-bg: #fff; --text: #1a1a2e; --muted: #6b7280;
    --border: #e5e7eb; --red: #dc2626; --orange: #f97316; --yellow: #eab308;
    --blue: #3b82f6; --green: #16a34a; --purple: #8b5cf6; --teal: #0d9488;
    --radius: 10px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; padding: 0; }
  .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
  header { background: var(--card-bg); border-bottom: 1px solid var(--border); padding: 20px 24px; margin-bottom: 24px; border-radius: var(--radius); }
  header h1 { font-size: 1.6rem; }
  header .subtitle { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }

  /* ── 导航标签 ── */
  .tabs { display: flex; gap: 0; margin-bottom: 24px; background: var(--card-bg); border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border); }
  .tabs button { flex: 1; padding: 12px 16px; border: none; background: transparent; cursor: pointer; font-size: 0.9rem; font-weight: 500; color: var(--muted); transition: all .15s; }
  .tabs button.active { background: var(--blue); color: #fff; }
  .tabs button:hover:not(.active) { background: #f3f4f6; }

  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* ── 卡片 ── */
  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
  .card h2 { font-size: 1.1rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .card h3 { font-size: 0.95rem; margin-bottom: 10px; color: var(--muted); }
  .section-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 8px; }

  /* ── 概览统计 ── */
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .stat-card { text-align: center; padding: 18px 12px; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); }
  .stat-card .value { font-size: 2.2rem; font-weight: 700; line-height: 1.1; }
  .stat-card .label { color: var(--muted); font-size: 0.78rem; margin-top: 4px; }

  /* ── 配置表 ── */
  .info-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  .info-table th, .info-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .info-table th { color: var(--muted); font-weight: 500; width: 120px; white-space: nowrap; }
  .url-cell { word-break: break-all; font-family: 'SF Mono', Consolas, monospace; font-size: 0.82rem; }

  /* ── 流程图 ── */
  .pipeline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .pipe-step { padding: 8px 16px; border-radius: 6px; font-size: 0.82rem; font-weight: 500; text-align: center; }
  .pipe-done { background: #d1fae5; color: #065f46; }
  .pipe-warn { background: #fef3c7; color: #92400e; }
  .pipe-fail { background: #fee2e2; color: #991b1b; }
  .pipe-arrow { color: var(--muted); font-size: 1.2rem; }
  .pipe-stub { background: #f3f4f6; color: #6b7280; border: 1px dashed #d1d5db; }

  /* ── 检测能力面板 ── */
  .detector-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
  .detector-item { display: flex; align-items: center; gap: 10px; padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid var(--border); }
  .detector-item .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .dot-done { background: var(--green); }
  .dot-base { background: var(--blue); }
  .dot-stub { background: var(--yellow); }
  .detector-item .info { flex: 1; }
  .detector-item .name { font-weight: 600; font-size: 0.88rem; }
  .detector-item .detail { font-size: 0.75rem; color: var(--muted); }

  /* ── 柱状图 ── */
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .bar-row .name { width: 120px; font-size: 0.8rem; flex-shrink: 0; }
  .bar-row .bar-track { flex: 1; height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden; }
  .bar-row .bar-fill { height: 100%; border-radius: 5px; }
  .bar-row .count { font-size: 0.8rem; color: var(--muted); width: 28px; text-align: right; font-weight: 600; }

  .cat-text_missing { background: var(--red); }
  .cat-text_changed { background: var(--orange); }
  .cat-layout_shift { background: var(--yellow); }
  .cat-text_direction_changed { background: #9ca3af; }
  .cat-text_overflow { background: var(--blue); }
  .cat-line_break_anomaly { background: var(--purple); }
  .cat-image_deformation { background: var(--teal); }
  .cat-element_overlap { background: #ec4899; }
  .cat-semantic_change { background: #8b5cf6; }
  .sev-error { background: var(--red); }
  .sev-warning { background: var(--orange); }
  .sev-info { background: var(--blue); }

  /* ── 徽章 ── */
  .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 0.73rem; font-weight: 600; color: #fff; vertical-align: middle; }
  .badge-red { background: var(--red); }
  .badge-orange { background: var(--orange); }
  .badge-yellow { background: var(--yellow); color: #1a1a2e; }
  .badge-blue { background: var(--blue); }
  .badge-green { background: var(--green); }
  .badge-gray { background: #9ca3af; }
  .badge-purple { background: var(--purple); }
  .badge-teal { background: var(--teal); }
  .badge-pink { background: #ec4899; }

  /* ── 对比卡片 ── */
  .comparison-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 14px; overflow: hidden; }
  .comparison-card > summary { padding: 14px 18px; cursor: pointer; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; user-select: none; font-weight: 500; }
  .comparison-card > summary:hover { background: #f9fafb; }
  .comparison-body { padding: 0 18px 18px; }

  .screenshot-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
  .screenshot-row figure { text-align: center; }
  .screenshot-row img { width: 100%; border: 1px solid var(--border); border-radius: 4px; }
  .screenshot-row figcaption { font-size: 0.78rem; color: var(--muted); margin-top: 4px; }

  .ocr-section { margin-bottom: 16px; }
  .ocr-section summary { font-weight: 600; cursor: pointer; padding: 8px 0; font-size: 0.9rem; }
  .ocr-section table { width: 100%; border-collapse: collapse; font-size: 0.84rem; margin-top: 8px; }
  .ocr-section th, .ocr-section td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
  .ocr-section th { background: #f9fafb; font-weight: 500; }

  .issue-list { list-style: none; }
  .issue-item { border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 8px; }
  .issue-item .header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .issue-item .desc { font-size: 0.9rem; }
  .issue-item pre { background: #f9fafb; padding: 8px; border-radius: 4px; font-size: 0.73rem; overflow-x: auto; margin-top: 6px; white-space: pre-wrap; word-break: break-all; }

  .failed-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius); padding: 12px; color: #991b1b; margin-bottom: 14px; }
  .warn-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius); padding: 12px; color: #92400e; margin-bottom: 14px; }

  .actions { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .actions button { padding: 7px 18px; border: 1px solid var(--border); border-radius: 6px; background: var(--card-bg); cursor: pointer; font-size: 0.85rem; }
  .actions button:hover { background: #f3f4f6; }

  @media (max-width: 900px) { .screenshot-row { grid-template-columns: 1fr; } .pipeline { flex-direction: column; align-items: flex-start; } .pipe-arrow { display: none; } }
</style>
</head>
<body>
<div class="container">

<header>
  <h1>📋 视觉校稿报告 Visual Proofreader</h1>
  <div class="subtitle">生成时间: ${data.generatedAt} &nbsp;|&nbsp; 对比页面: ${data.config.pages.length} &nbsp;|&nbsp; 视口尺寸: ${data.config.viewports.length}</div>
</header>

${buildTabs(data, images)}

</div>
</body>
</html>`;
}

// ========== 主 Tab 结构 ==========

function buildTabs(data: ReportData, images: Map<string, string>): string {
  return `
<div class="tabs">
  <button class="active" onclick="switchTab('overview', this)">📊 总览</button>
  <button onclick="switchTab('config', this)">⚙️ 配置 & 流程</button>
  <button onclick="switchTab('detectors', this)">🔍 检测能力</button>
  <button onclick="switchTab('comparisons', this)">📑 对比详情 (${data.comparisons.length})</button>
</div>

<div id="tab-overview" class="tab-content active">
  ${buildOverviewTab(data)}
</div>

<div id="tab-config" class="tab-content">
  ${buildConfigTab(data)}
</div>

<div id="tab-detectors" class="tab-content">
  ${buildDetectorsTab(data)}
</div>

<div id="tab-comparisons" class="tab-content">
  <div class="actions">
    <button onclick="document.querySelectorAll('.comparison-card').forEach(d=>d.open=true)">全部展开</button>
    <button onclick="document.querySelectorAll('.comparison-card').forEach(d=>d.open=false)">全部折叠</button>
  </div>
  ${data.comparisons.map((c) => buildComparisonCard(c, images)).join("\n")}
</div>

<script>
function switchTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
}
</script>`;
}

// ========== Tab 1: 总览 ==========

function buildOverviewTab(data: ReportData): string {
  const s = data.summary;
  const hasOcr = s.ocrFailures < data.comparisons.length * 2;
  const hasIssues = s.totalIssues > 0;

  return `
<div class="stat-grid">
  <div class="stat-card">
    <div class="value">${s.totalComparisons}</div>
    <div class="label">对比总数</div>
  </div>
  <div class="stat-card">
    <div class="value" style="color:${hasIssues ? 'var(--red)' : 'var(--green)'}">${s.totalIssues}</div>
    <div class="label">发现问题</div>
  </div>
  <div class="stat-card">
    <div class="value" style="color:${hasOcr ? 'var(--green)' : 'var(--orange)'}">${hasOcr ? '✓' : s.ocrFailures}</div>
    <div class="label">OCR 状态</div>
  </div>
  <div class="stat-card">
    <div class="value">${data.comparisons.filter(c => c.status === 'ok').length}/${s.totalComparisons}</div>
    <div class="label">截图成功</div>
  </div>
</div>

<div style="display:flex;gap:14px;flex-wrap:wrap">
  <div class="card" style="flex:1;min-width:280px">
    <h3>问题分类</h3>
    ${buildBars("category", s.issuesByCategory)}
  </div>
  <div class="card" style="flex:1;min-width:280px">
    <h3>严重程度</h3>
    ${buildBars("severity", s.issuesBySeverity)}
  </div>
</div>

${hasIssues ? '' : '<div class="card" style="text-align:center;color:var(--green);font-size:1.1rem">✅ 未检测到视觉问题</div>'}
${s.ocrFailures > 0 ? `<div class="warn-box">⚠️ 有 ${s.ocrFailures} 次 OCR 识别失败 — 文字相关检测器已跳过，像素对比仍有效。<br>请检查 PaddleOCR 服务是否在 ${data.config.ocrEndpoint} 运行。</div>` : ''}
`;
}

// ========== Tab 2: 配置 & 流程 ==========

function buildConfigTab(data: ReportData): string {
  const cfg = data.config;

  const pageRows = cfg.pages.map((p) => {
    const mode = p.inputMode === "image" ? "本地图片" : "URL 截图";
    const modeBadge = p.inputMode === "image" ? "badge-purple" : "badge-blue";
    const left = p.inputMode === "image"
      ? `<td class="url-cell">📁 ${escapeHtml(p.baseline_image)}</td>`
      : `<td class="url-cell">${escapeHtml(p.baseline_url)}</td>`;
    const right = p.inputMode === "image"
      ? `<td class="url-cell">📁 ${escapeHtml(p.current_image)}</td>`
      : `<td class="url-cell">${escapeHtml(p.current_url)}</td>`;
    return `<tr>
      <td><strong>${escapeHtml(p.name)}</strong> <span class="badge ${modeBadge}">${mode}</span></td>
      ${left}${right}
    </tr>`;
  }).join("");

  const vpRows = cfg.viewports.map((v) =>
    `<tr><td><strong>${escapeHtml(v.name)}</strong></td><td>${v.width} × ${v.height}</td></tr>`).join("");

  const imageCount = cfg.pages.filter(p => p.inputMode === "image").length;
  const urlCount = cfg.pages.filter(p => p.inputMode === "url").length;

  return `
<div class="card">
  <h2>📄 对比配置</h2>
  <h3>页面列表 (URL 模式 ${urlCount} 个 + 本地图片模式 ${imageCount} 个)</h3>
  <table class="info-table">
    <thead><tr><th>页面名称</th><th>基准</th><th>当前</th></tr></thead>
    <tbody>${pageRows}</tbody>
  </table>
  <h3 style="margin-top:16px">视口尺寸</h3>
  <table class="info-table">
    <thead><tr><th>视口名称</th><th>分辨率</th></tr></thead>
    <tbody>${vpRows}</tbody>
  </table>
  <h3 style="margin-top:16px">运行参数</h3>
  <table class="info-table">
    <tr><th>OCR 服务地址</th><td class="url-cell">${escapeHtml(cfg.ocrEndpoint)}</td></tr>
    <tr><th>浏览器</th><td>${escapeHtml(cfg.browserType)}${imageCount > 0 ? ' (仅 URL 模式使用)' : ''}</td></tr>
  </table>
</div>

<div class="card">
  <h2>🔄 校稿流水线</h2>
  <p style="font-size:0.85rem;color:var(--muted);margin-bottom:10px">
    支持两种输入方式：<strong>URL 截图</strong>（Playwright 自动截图）和 <strong>本地图片</strong>（直接对比图片文件）
  </p>
  <div class="pipeline">
    <div class="pipe-step pipe-done">① 读取配置<br><small>pages.json<br>viewports.json</small></div>
    <span class="pipe-arrow">→</span>
    <div class="pipe-step pipe-done">② 获取图片<br><small>URL → Playwright 截图<br>或 本地图片直接加载</small></div>
    <span class="pipe-arrow">→</span>
    <div class="pipe-step pipe-done">③ pixelmatch 像素对比<br><small>生成 diff 图片<br>diff_percent · diff_pixels</small></div>
    <span class="pipe-arrow">→</span>
    <div class="pipe-step ${data.summary.ocrFailures < data.comparisons.length * 2 ? 'pipe-done' : 'pipe-warn'}">④ PaddleOCR 识别<br><small>中文/英文文字<br>输出 OCR JSON</small></div>
    <span class="pipe-arrow">→</span>
    <div class="pipe-step pipe-done">⑤ 规则检测器 × 8<br><small>文字缺失 · 文字变更<br>布局偏移 · 换行异常<br>图片变形 · 元素重叠等</small></div>
    <span class="pipe-arrow">→</span>
    <div class="pipe-step pipe-done">⑥ 生成报告<br><small>reports/index.html<br>reports/report.json</small></div>
  </div>
  <p style="font-size:0.8rem;color:var(--muted);margin-top:12px">
    🟢 已完成 &nbsp; 🟡 OCR 未就绪（仍可正常对比）&nbsp; 🔴 失败
  </p>
</div>
`;
}

// ========== Tab 3: 检测能力 ==========

function buildDetectorsTab(data: ReportData): string {
  const hasOcr = data.summary.ocrFailures < data.comparisons.length * 2;

  const detectors = [
    { key: "text_missing",            name: "文字丢失",     goal: "文字跳字 / 文字丢失",       status: hasOcr ? "active" : "skip", desc: "OCR 对比：基准有、当前无的文字 → 标记 missing" },
    { key: "text_changed",            name: "文字变更",     goal: "文字内容变化",              status: hasOcr ? "active" : "skip", desc: "OCR 对比：文字内容相似度 < 90% → error" },
    { key: "layout_shift",            name: "布局偏移",     goal: "错位 / 元素位置变化",       status: hasOcr ? "active" : "skip", desc: "OCR 边界框中心偏移 > 10px → warning" },
    { key: "text_direction_changed",  name: "文字方向变化", goal: "方向变化（LTR/RTL）",        status: "stub",                     desc: "预留接口，后续通过 Unicode 双向字符分析实现" },
    { key: "text_overflow",           name: "文字溢出",     goal: "文字超出容器边界",           status: hasOcr ? "active" : "skip", desc: "OCR 边界框右边缘 > 视口容器宽度 → warning" },
    { key: "line_break_anomaly",      name: "换行异常",     goal: "换行异常 / 文字跳行",        status: hasOcr ? "active" : "skip", desc: "当前文字块高度 > 基准 1.5 倍 → 疑似异常换行" },
    { key: "image_deformation",       name: "图片变形",     goal: "图片拉伸 / 压缩 / 变形",      status: "active",                   desc: "diff_percent > 5% 且非文字原因 → 提示人工检查图片区域" },
    { key: "element_overlap",         name: "元素重叠",     goal: "元素重叠 / 遮挡",            status: hasOcr ? "active" : "skip", desc: "当前版本 OCR 文本块边界框相交 → warning" },
    { key: "semantic_change",         name: "语义变化 (LLM)", goal: "文字语义意外变化",        status: "active",                   desc: "LLM 分析: 区分刻意修改 vs 意外损坏 → error/warning" },
  ];

  const rows = detectors.map((d) => {
    const statusLabel = d.status === "active" ? "已启用" : d.status === "stub" ? "预留" : "跳过(需OCR)";
    const dotCls = d.status === "active" ? "dot-done" : d.status === "stub" ? "dot-stub" : "dot-stub";
    const badgeCls = d.status === "active" ? "badge-green" : d.status === "stub" ? "badge-yellow" : "badge-gray";
    return `
    <div class="detector-item">
      <span class="dot ${dotCls}"></span>
      <div class="info">
        <div class="name">${d.name} <span class="badge ${badgeCls}" style="margin-left:4px">${statusLabel}</span></div>
        <div class="detail">🎯 ${d.goal}</div>
        <div class="detail" style="margin-top:2px">📐 ${d.desc}</div>
      </div>
    </div>`;
  }).join("\n");

  return `
<div class="card">
  <h2>🔍 检测能力总览</h2>
  <p style="font-size:0.85rem;color:var(--muted);margin-bottom:12px">
    共 9 个检测器（含 LLM 语义分析），每个对应一种原始需求中定义的校稿问题类型。<br>
    <span style="color:var(--red)">● 文字类检测器</span> 依赖 OCR 识别结果 |
    <span style="color:var(--teal)">● 图片/布局类检测器</span> 基于像素对比 |
    <span style="color:var(--yellow)">● 预留</span> 后续版本实现
  </p>
  <div class="detector-grid">${rows}</div>
  ${!hasOcr ? '<div class="warn-box" style="margin-top:12px">⚠️ OCR 服务不可用，7 个文字相关检测器已跳过（text_missing, text_changed, layout_shift, text_overflow, line_break_anomaly, element_overlap, semantic_change）。<br>启动 PaddleOCR / EasyOCR 服务后重新运行即可启用所有检测器。</div>' : ''}
</div>

<div class="card">
  <h2>📋 原始需求对照</h2>
  <table class="info-table">
    <thead><tr><th>原始需求</th><th>对应检测器</th><th>检测方式</th><th>状态</th></tr></thead>
    <tbody>
      <tr><td>文字跳字 / 文字丢失</td><td>文字丢失 (text_missing)</td><td>OCR 文本块匹配</td><td>✅</td></tr>
      <tr><td>文字内容变化</td><td>文字变更 (text_changed)</td><td>OCR + 文本相似度</td><td>✅</td></tr>
      <tr><td>错位</td><td>布局偏移 (layout_shift)</td><td>OCR 边界框坐标对比</td><td>✅</td></tr>
      <tr><td>方向变化</td><td>文字方向变化 (text_direction_changed)</td><td>Unicode 双向分析（预留）</td><td>📋</td></tr>
      <tr><td>换行异常</td><td>换行异常 (line_break_anomaly)</td><td>OCR 边界框高度变化</td><td>✅</td></tr>
      <tr><td>文字溢出边界</td><td>文字溢出 (text_overflow)</td><td>OCR 边界框 vs 容器边界</td><td>✅</td></tr>
      <tr><td>图片变形</td><td>图片变形 (image_deformation)</td><td>像素差异 + 非文字归因</td><td>✅</td></tr>
      <tr><td>元素重叠</td><td>元素重叠 (element_overlap)</td><td>OCR 边界框 IoU 检测</td><td>✅</td></tr>
      <tr><td>语义意外变化</td><td>语义变化 LLM (semantic_change)</td><td>大模型语义分析</td><td>✅</td></tr>
    </tbody>
  </table>
</div>
`;
}

// ========== Tab 4: 对比详情 ==========

function buildComparisonCard(c: ComparisonResult, images: Map<string, string>): string {
  const failBadge = c.status === "failed" ? ' <span class="badge badge-red">失败</span>' : '';
  const modeBadge = c.inputMode === "image" ? '<span class="badge badge-purple">本地图片</span>' : '<span class="badge badge-blue">URL 截图</span>';
  const baselineB64 = images.get(c.screenshot.baselinePath) ?? "";
  const currentB64 = images.get(c.screenshot.currentPath) ?? "";
  const diffB64 = images.get(c.diff.diffPath) ?? "";

  const ocrFailures: string[] = [];
  if (c.baselineOcr.status === "OCR_FAILED") ocrFailures.push(`基准 OCR 失败: ${c.baselineOcr.error}`);
  if (c.currentOcr.status === "OCR_FAILED") ocrFailures.push(`当前 OCR 失败: ${c.currentOcr.error}`);

  return `
<details class="comparison-card">
  <summary>
    <span style="font-weight:600">${escapeHtml(c.pageName)}</span>
    ${modeBadge}
    <span style="color:var(--muted);font-size:0.85rem">@ ${escapeHtml(c.viewportName)} (${c.screenshot.viewport.width}×${c.screenshot.viewport.height})</span>
    <span class="badge ${c.diff.diffPercent > 1 ? 'badge-red' : c.diff.diffPercent > 0.1 ? 'badge-orange' : 'badge-green'}">差异 ${c.diff.diffPercent.toFixed(2)}%</span>
    <span class="badge ${c.issues.length > 0 ? 'badge-red' : 'badge-green'}">${c.issues.length} 个问题</span>
    ${ocrFailures.length > 0 ? '<span class="badge badge-yellow">OCR 失败</span>' : '<span class="badge badge-green">OCR 正常</span>'}
    ${failBadge}
  </summary>

  <div class="comparison-body">
    ${c.status === 'failed' ? `<div class="failed-box"><strong>截图失败：</strong>${escapeHtml(c.error ?? '未知错误')}</div>` : ''}
    ${ocrFailures.length > 0 ? `<div class="warn-box"><strong>⚠️ OCR 识别失败：</strong> ${ocrFailures.join("<br>")}</div>` : ''}

    <div class="screenshot-row">
      <figure>
        ${baselineB64 ? `<img src="data:image/png;base64,${baselineB64}" alt="基准截图" loading="lazy">` : '<p style="color:var(--muted);padding:40px 0">无截图</p>'}
        <figcaption>📷 基准 (baseline)</figcaption>
      </figure>
      <figure>
        ${currentB64 ? `<img src="data:image/png;base64,${currentB64}" alt="当前截图" loading="lazy">` : '<p style="color:var(--muted);padding:40px 0">无截图</p>'}
        <figcaption>📷 当前 (current)</figcaption>
      </figure>
      <figure>
        ${diffB64 ? `<img src="data:image/png;base64,${diffB64}" alt="差异图" loading="lazy">` : '<p style="color:var(--muted);padding:40px 0">无截图</p>'}
        <figcaption>🔴 差异 — ${c.diff.diffPercent.toFixed(2)}%（${c.diff.diffPixels.toLocaleString()} / ${c.diff.totalPixels.toLocaleString()} 像素）</figcaption>
      </figure>
    </div>

    ${buildOcrSection(c)}

    ${c.issues.length > 0
      ? `<h4 style="margin-bottom:8px">🔍 问题列表 (${c.issues.length})</h4><ul class="issue-list">${c.issues.map(buildIssueItem).join("\n")}</ul>`
      : '<p style="color:var(--green);font-size:0.9rem">✅ 未检测到视觉问题</p>'}
  </div>
</details>`;
}

function buildOcrSection(c: ComparisonResult): string {
  if (c.baselineOcr.status === "OCR_FAILED" || c.currentOcr.status === "OCR_FAILED") return "";
  if (!c.ocrCompare) return '<div class="failed-box">OCR 对比已跳过（OCR 识别失败）</div>';

  const { pairs, unmatchedBaseline, unmatchedCurrent } = c.ocrCompare;
  return `
<details class="ocr-section">
  <summary>📝 OCR 识别结果 — 匹配 ${pairs.length} 对，基准未匹配 ${unmatchedBaseline.length}，当前未匹配 ${unmatchedCurrent.length}</summary>
  ${pairs.length > 0 ? `<table>
    <thead><tr><th>基准文字</th><th>当前文字</th><th>置信度</th><th>边界框 (基准)</th><th>边界框 (当前)</th></tr></thead>
    <tbody>${pairs.map((p: OcrBlockPair) => {
      const bBbox = p.baseline.bbox.map(Math.round).join(", ");
      const cBbox = p.current?.bbox.map(Math.round).join(", ") ?? "—";
      return `<tr>
        <td>${escapeHtml(p.baseline.text)}</td>
        <td>${escapeHtml(p.current?.text ?? "(无)")}</td>
        <td>${p.baseline.confidence.toFixed(2)} / ${p.current?.confidence.toFixed(2) ?? "—"}</td>
        <td style="font-size:0.73rem">[${bBbox}]</td>
        <td style="font-size:0.73rem">[${cBbox}]</td>
      </tr>`;
    }).join("\n")}</tbody>
  </table>` : ''}
  ${unmatchedBaseline.length > 0 ? `<p style="margin-top:8px;font-size:0.85rem"><strong>基准中未匹配：</strong> ${unmatchedBaseline.map(b => escapeHtml(b.text)).join("; ")}</p>` : ''}
  ${unmatchedCurrent.length > 0 ? `<p style="font-size:0.85rem"><strong>当前中未匹配：</strong> ${unmatchedCurrent.map(b => escapeHtml(b.text)).join("; ")}</p>` : ''}
</details>`;
}

function buildIssueItem(issue: DetectorIssue): string {
  const color = issue.severity === "error" ? "var(--red)" : issue.severity === "warning" ? "var(--orange)" : "var(--blue)";
  const badgeCls = issue.severity === "error" ? "badge-red" : issue.severity === "warning" ? "badge-orange" : "badge-blue";
  const sevLabel = issue.severity === "error" ? "错误" : issue.severity === "warning" ? "警告" : "提示";
  return `
<li class="issue-item" style="border-left:4px solid ${color}">
  <div class="header">
    <span class="badge ${badgeCls}">${sevLabel}</span>
    <span class="badge ${catBadgeCls(issue.category)}">${categoryLabel(issue.category)}</span>
  </div>
  <div class="desc">${escapeHtml(issue.description)}</div>
  <pre>${escapeHtml(JSON.stringify(issue.detail, null, 2))}</pre>
</li>`;
}

// ========== 工具函数 ==========

function readAllImages(comparisons: ComparisonResult[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of comparisons) {
    if (c.status !== "ok") continue;
    for (const path of [c.screenshot.baselinePath, c.screenshot.currentPath, c.diff.diffPath]) {
      if (!path) continue;
      try { map.set(path, readFileSync(path).toString("base64")); } catch { /* skip */ }
    }
  }
  return map;
}

function buildBars(type: string, data: Record<string, number>): string {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '<p style="color:var(--muted);font-size:0.85rem">无问题</p>';
  const maxVal = entries[0]?.[1] ?? 1;
  return entries.map(([key, val]) => {
    const cls = type === "category" ? `cat-${key}` : `sev-${key}`;
    const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
    const label = type === "category" ? categoryLabel(key) : severityLabel(key);
    return `<div class="bar-row"><span class="name">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div><span class="count">${val}</span></div>`;
  }).join("\n");
}

function categoryLabel(key: string): string {
  const map: Record<string, string> = {
    text_missing: "文字丢失", text_changed: "文字变更", layout_shift: "布局偏移",
    text_direction_changed: "文字方向变化", text_overflow: "文字溢出",
    line_break_anomaly: "换行异常", image_deformation: "图片变形", element_overlap: "元素重叠",
    semantic_change: "语义变化 (LLM)",
  };
  return map[key] ?? key;
}

function severityLabel(key: string): string {
  const map: Record<string, string> = { error: "错误", warning: "警告", info: "提示" };
  return map[key] ?? key;
}

function catBadgeCls(key: string): string {
  const map: Record<string, string> = {
    text_missing: "badge-red", text_changed: "badge-orange", layout_shift: "badge-yellow",
    text_direction_changed: "badge-gray", text_overflow: "badge-blue",
    line_break_anomaly: "badge-purple", image_deformation: "badge-teal", element_overlap: "badge-pink",
    semantic_change: "badge-purple",
  };
  return map[key] ?? "badge-gray";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
