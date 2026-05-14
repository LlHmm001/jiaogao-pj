import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeDiff } from "./diff/pixel-diff.js";
import { recognizeText } from "./ocr/client.js";
import { compareOcrResults } from "./ocr/compare.js";
import { runAllDetectorsAsync } from "./detectors/index.js";
import { generateReports } from "./report/generator.js";
import type { ReportData, ComparisonResult, ReportSummary, OcrResult } from "./types/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---- helpers ----

function jsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function respond(res: ServerResponse, status: number, body: unknown, contentType = "application/json") {
  res.writeHead(status, { "Content-Type": contentType, "Access-Control-Allow-Origin": "*" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function serveStatic(res: ServerResponse, filePath: string) {
  try {
    const buf = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

// ---- upload HTML page ----

const UPLOAD_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>视觉校稿工具 - 图片对比</title>
<style>
  :root {
    --bg: #f5f6f8; --card-bg: #fff; --text: #1a1a2e; --muted: #6b7280;
    --border: #e5e7eb; --red: #dc2626; --orange: #f97316; --yellow: #eab308;
    --blue: #3b82f6; --green: #16a34a; --purple: #8b5cf6; --teal: #0d9488;
    --radius: 10px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; min-height: 100vh; }
  .container { max-width: 960px; margin: 0 auto; padding: 24px; }

  header { text-align: center; padding: 32px 0 24px; }
  header h1 { font-size: 1.8rem; margin-bottom: 6px; }
  header .subtitle { color: var(--muted); font-size: 0.9rem; }

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; margin-bottom: 20px; }
  .card h2 { font-size: 1.05rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }

  /* upload zones */
  .upload-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .upload-row { grid-template-columns: 1fr; } }

  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    padding: 32px 16px;
    text-align: center;
    cursor: pointer;
    transition: all .2s;
    position: relative;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .drop-zone:hover, .drop-zone.dragover { border-color: var(--blue); background: #eff6ff; }
  .drop-zone.has-image { border-style: solid; border-color: var(--green); padding: 0; }
  .drop-zone .icon { font-size: 2.5rem; margin-bottom: 8px; opacity: 0.5; }
  .drop-zone .text { color: var(--muted); font-size: 0.88rem; }
  .drop-zone .hint { color: var(--muted); font-size: 0.75rem; margin-top: 4px; }
  .drop-zone img.preview { width: 100%; height: 100%; object-fit: contain; position: absolute; inset: 0; }
  .drop-zone .label-badge {
    position: absolute; top: 8px; left: 8px;
    background: rgba(0,0,0,.65); color: #fff; font-size: 0.72rem;
    padding: 2px 8px; border-radius: 4px; z-index: 2; pointer-events: none;
  }
  .drop-zone .clear-btn {
    position: absolute; top: 8px; right: 8px; z-index: 2;
    width: 26px; height: 26px; border-radius: 50%;
    border: none; background: rgba(0,0,0,.5); color: #fff;
    font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    line-height: 1;
  }
  .drop-zone .clear-btn:hover { background: var(--red); }
  input[type="file"] { display: none; }

  /* config section */
  .config-row { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: end; }
  @media (max-width: 640px) { .config-row { grid-template-columns: 1fr; } }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field label { font-size: 0.78rem; font-weight: 600; color: var(--muted); }
  .field input { padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.88rem; }
  .field input:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px rgba(59,130,246,.15); }

  .btn {
    padding: 10px 24px; border: none; border-radius: 6px; font-size: 0.9rem;
    font-weight: 600; cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; gap: 6px;
  }
  .btn-primary { background: var(--blue); color: #fff; }
  .btn-primary:hover { background: #2563eb; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .btn-outline:hover { background: #f3f4f6; }

  /* results */
  .result-hidden { display: none; }
  .result-section { margin-top: 20px; }

  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .stat-card { text-align: center; padding: 16px 12px; background: #f9fafb; border: 1px solid var(--border); border-radius: var(--radius); }
  .stat-card .value { font-size: 1.8rem; font-weight: 700; line-height: 1.1; }
  .stat-card .label { color: var(--muted); font-size: 0.75rem; margin-top: 4px; }

  .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 0.73rem; font-weight: 600; color: #fff; }
  .badge-red { background: var(--red); }
  .badge-orange { background: var(--orange); }
  .badge-yellow { background: var(--yellow); color: #1a1a2e; }
  .badge-green { background: var(--green); }
  .badge-blue { background: var(--blue); }
  .badge-gray { background: #9ca3af; }

  .issue-list { list-style: none; }
  .issue-item { padding: 10px 14px; margin-bottom: 6px; border-radius: 6px; background: #fef2f2; border: 1px solid #fecaca; font-size: 0.86rem; display: flex; align-items: flex-start; gap: 8px; }
  .issue-item.warn { background: #fffbeb; border-color: #fde68a; }
  .issue-item .sev { margin-top: 2px; }

  .action-row { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }

  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .status-msg { padding: 12px 16px; border-radius: 6px; font-size: 0.88rem; margin-top: 16px; }
  .status-ok { background: #d1fae5; color: #065f46; }
  .status-warn { background: #fef3c7; color: #92400e; }

  footer { text-align: center; color: var(--muted); font-size: 0.75rem; padding: 24px; }
</style>
</head>
<body>
<div class="container">

<header>
  <h1>视觉校稿工具</h1>
  <p class="subtitle">上传两张图片，自动检测视觉差异</p>
</header>

<div class="card">
  <h2>上传对比图片</h2>
  <div class="upload-row">
    <div class="drop-zone" id="baselineZone" onclick="document.getElementById('baselineInput').click()">
      <span class="icon">📄</span>
      <span class="text">基准图片（修改前）</span>
      <span class="hint">点击上传或拖拽图片到这里</span>
      <span class="label-badge" style="display:none">基准</span>
      <button class="clear-btn" style="display:none" onclick="clearImage('baseline'); event.stopPropagation();">&times;</button>
      <img class="preview" style="display:none" alt="">
    </div>
    <div class="drop-zone" id="currentZone" onclick="document.getElementById('currentInput').click()">
      <span class="icon">📄</span>
      <span class="text">当前图片（修改后）</span>
      <span class="hint">点击上传或拖拽图片到这里</span>
      <span class="label-badge" style="display:none">当前</span>
      <button class="clear-btn" style="display:none" onclick="clearImage('current'); event.stopPropagation();">&times;</button>
      <img class="preview" style="display:none" alt="">
    </div>
  </div>
  <input type="file" id="baselineInput" accept="image/png,image/jpeg" onchange="handleFile(this, 'baseline')">
  <input type="file" id="currentInput" accept="image/png,image/jpeg" onchange="handleFile(this, 'current')">
</div>

<div class="card">
  <h2>OCR 配置</h2>
  <div class="config-row">
    <div class="field">
      <label for="ocrEndpoint">OCR 服务地址</label>
      <input type="text" id="ocrEndpoint" value="http://localhost:8866" placeholder="http://localhost:8866">
    </div>
    <div class="field">
      <label for="ocrTimeout">超时 (ms)</label>
      <input type="number" id="ocrTimeout" value="120000" style="width:100px">
    </div>
    <div class="field">
      <label>&nbsp;</label>
      <button class="btn btn-outline" onclick="testOcr()" id="testOcrBtn">测试连接</button>
    </div>
  </div>
  <div id="ocrStatus" style="margin-top:8px;font-size:0.82rem;"></div>
</div>

<div class="card">
  <button class="btn btn-primary" id="compareBtn" onclick="startCompare()" disabled style="width:100%;justify-content:center;padding:14px;">
    选择两张图片后开始对比
  </button>
  <div id="compareStatus"></div>

  <div id="results" class="result-hidden result-section">
    <h2 style="margin-bottom:12px;">对比结果</h2>
    <div class="stat-grid" id="statGrid"></div>
    <div style="margin-top:16px;" id="issueSummary"></div>
    <div class="action-row">
      <button class="btn btn-primary" onclick="window.open('/reports/index.html', '_blank')">查看完整报告</button>
      <button class="btn btn-outline" onclick="resetAll()">重新对比</button>
    </div>
  </div>
</div>

<footer>Visual Proofreader — 基于 pixelmatch + PaddleOCR / EasyOCR</footer>

</div>

<script>
let baselineFile = null, currentFile = null;
let baselineBase64 = null, currentBase64 = null;

// ---- drag & drop ----
['baseline','current'].forEach(id => {
  const zone = document.getElementById(id+'Zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadImage(id, file);
  });
});

function handleFile(input, id) {
  const file = input.files[0];
  if (file) loadImage(id, file);
}

function loadImage(id, file) {
  if (!file.type.startsWith('image/')) return alert('请选择图片文件');

  // Convert to PNG via canvas (handles JPEG, WebP, etc.)
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pngDataUrl = canvas.toDataURL('image/png');
    const base64 = pngDataUrl.split(',')[1];
    if (id === 'baseline') { baselineFile = file; baselineBase64 = base64; }
    else { currentFile = file; currentBase64 = base64; }
    updateZone(id, file, pngDataUrl);
    updateBtn();
  };
  img.onerror = function() { alert('图片加载失败，请检查文件格式'); };
  img.src = URL.createObjectURL(file);
}

function updateZone(id, file, dataUrl) {
  const zone = document.getElementById(id+'Zone');
  const icon = zone.querySelector('.icon');
  const text = zone.querySelector('.text');
  const hint = zone.querySelector('.hint');
  const badge = zone.querySelector('.label-badge');
  const clear = zone.querySelector('.clear-btn');
  const img = zone.querySelector('img.preview');

  icon.style.display = 'none';
  text.style.display = 'none';
  hint.style.display = 'none';
  badge.style.display = 'block';
  clear.style.display = 'flex';
  img.style.display = 'block';
  img.src = dataUrl;
  zone.classList.add('has-image');
}

function clearImage(id) {
  if (id === 'baseline') { baselineFile = null; baselineBase64 = null; }
  else { currentFile = null; currentBase64 = null; }
  const input = document.getElementById(id+'Input');
  input.value = '';
  const zone = document.getElementById(id+'Zone');
  zone.querySelector('.icon').style.display = '';
  zone.querySelector('.text').style.display = '';
  zone.querySelector('.hint').style.display = '';
  zone.querySelector('.label-badge').style.display = 'none';
  zone.querySelector('.clear-btn').style.display = 'none';
  zone.querySelector('img.preview').style.display = 'none';
  zone.classList.remove('has-image');
  document.getElementById('results').classList.add('result-hidden');
  updateBtn();
}

function updateBtn() {
  const btn = document.getElementById('compareBtn');
  btn.disabled = !(baselineBase64 && currentBase64);
  btn.textContent = (baselineBase64 && currentBase64) ? '开始对比' : '选择两张图片后开始对比';
}

async function startCompare() {
  if (!baselineBase64 || !currentBase64) return;
  const btn = document.getElementById('compareBtn');
  const status = document.getElementById('compareStatus');
  const results = document.getElementById('results');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 正在对比...';
  results.classList.add('result-hidden');
  status.innerHTML = '';

  const ocrEndpoint = document.getElementById('ocrEndpoint').value || 'http://localhost:8866';
  const ocrTimeout = parseInt(document.getElementById('ocrTimeout').value) || 30000;

  try {
    const resp = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baselineBase64, currentBase64,
        ocrEndpoint, ocrTimeout,
        baselineName: baselineFile?.name || 'baseline.png',
        currentName: currentFile?.name || 'current.png',
      })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '对比失败');

    renderResults(data);
    status.innerHTML = '<div class="status-msg status-ok">对比完成</div>';
  } catch (err) {
    status.innerHTML = '<div class="status-msg status-warn">错误: ' + err.message + '</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '开始对比';
    if (baselineBase64 && currentBase64) btn.textContent = '重新对比';
  }
}

function renderResults(data) {
  const s = data.summary;
  document.getElementById('statGrid').innerHTML =
    '<div class="stat-card"><div class="value" style="color:var(--blue)">' + (s.diffPercent ?? 0).toFixed(2) + '%</div><div class="label">像素差异</div></div>' +
    '<div class="stat-card"><div class="value" style="color:var(--red)">' + s.totalIssues + '</div><div class="label">发现问题</div></div>' +
    '<div class="stat-card"><div class="value" style="color:var(--orange)">' + s.diffPixels.toLocaleString() + '</div><div class="label">差异像素</div></div>' +
    '<div class="stat-card"><div class="value" style="color:var(--green)">' + (s.ocrSuccess ? '成功' : (s.ocrFailures > 0 ? '失败' : '-')) + '</div><div class="label">OCR 状态</div></div>';

  let issueHtml = '';
  if (data.issues && data.issues.length > 0) {
    issueHtml = '<h3 style="margin-bottom:8px;">发现的问题 (' + data.issues.length + ')</h3><ul class="issue-list">';
    const catLabels = {
      text_missing: '文字丢失', text_changed: '文字变化', layout_shift: '布局偏移',
      text_direction_changed: '方向变化', text_overflow: '文字溢出',
      line_break_anomaly: '换行异常', image_deformation: '图片变形', element_overlap: '元素重叠'
    };
    const catColors = {
      text_missing: 'badge-red', text_changed: 'badge-orange', layout_shift: 'badge-yellow',
      text_direction_changed: 'badge-gray', text_overflow: 'badge-blue',
      line_break_anomaly: 'badge-orange', image_deformation: 'badge-orange', element_overlap: 'badge-red'
    };
    for (const iss of data.issues) {
      const cls = iss.severity === 'warning' ? 'warn' : '';
      const sevBadge = iss.severity === 'error' ? '<span class="badge badge-red sev">错误</span>' :
                       iss.severity === 'warning' ? '<span class="badge badge-orange sev">警告</span>' :
                       '<span class="badge badge-blue sev">信息</span>';
      issueHtml += '<li class="issue-item ' + cls + '">' + sevBadge +
        '<span class="badge ' + (catColors[iss.category] || 'badge-gray') + '">' + (catLabels[iss.category] || iss.category) + '</span>' +
        '<span>' + iss.description + '</span></li>';
    }
    issueHtml += '</ul>';
  } else {
    issueHtml = '<div class="status-msg status-ok">未发现问题</div>';
  }
  document.getElementById('issueSummary').innerHTML = issueHtml;
  document.getElementById('results').classList.remove('result-hidden');
}

function resetAll() {
  clearImage('baseline');
  clearImage('current');
  document.getElementById('compareStatus').innerHTML = '';
  document.getElementById('results').classList.add('result-hidden');
}

async function testOcr() {
  const endpoint = document.getElementById('ocrEndpoint').value || 'http://localhost:8866';
  const timeout = parseInt(document.getElementById('ocrTimeout').value) || 30000;
  const status = document.getElementById('ocrStatus');
  const btn = document.getElementById('testOcrBtn');
  status.innerHTML = '正在测试...';
  btn.disabled = true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Math.min(timeout, 10000));
    const resp = await fetch(endpoint + '/health', {
      method: 'GET',
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (resp.ok) {
      status.innerHTML = '<span style="color:var(--green)">连接成功 — OCR 服务可用</span>';
    } else {
      status.innerHTML = '<span style="color:var(--orange)">返回 HTTP ' + resp.status + ' — 服务异常</span>';
    }
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      status.innerHTML = '<span style="color:var(--red)">无法连接 — OCR 服务未启动</span><br><small style="color:var(--muted)">请在新终端运行: python scripts/easyocr_server.py</small>';
    } else if (msg.includes('aborted') || msg.includes('timeout')) {
      status.innerHTML = '<span style="color:var(--red)">连接超时 — OCR 服务响应过慢</span>';
    } else {
      status.innerHTML = '<span style="color:var(--red)">连接失败: ' + msg + '</span>';
    }
  } finally {
    btn.disabled = false;
  }
}
</script>
</body>
</html>`;

// ---- API handler ----

interface CompareRequest {
  baselineBase64: string;
  currentBase64: string;
  ocrEndpoint: string;
  ocrTimeout: number;
  baselineName: string;
  currentName: string;
}

async function handleCompare(body: CompareRequest, res: ServerResponse) {
  const pageName = "网页上传对比";
  const viewportName = "default";
  const w = 1280, h = 800;

  // Save uploaded images
  const tmpDir = resolve(ROOT, "screenshots");
  const baselineDir = resolve(tmpDir, "baseline");
  const currentDir = resolve(tmpDir, "current");
  const diffDir = resolve(tmpDir, "diff");
  for (const d of [baselineDir, currentDir, diffDir]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  const baselinePath = resolve(baselineDir, `baseline_web_upload.png`);
  const currentPath = resolve(currentDir, `current_web_upload.png`);
  writeFileSync(baselinePath, Buffer.from(body.baselineBase64, "base64"));
  writeFileSync(currentPath, Buffer.from(body.currentBase64, "base64"));

  // Pixel diff
  const diffResult = computeDiff(pageName, viewportName, baselinePath, currentPath);

  // OCR
  const ocrEndpoint = body.ocrEndpoint || "http://localhost:8866";
  const ocrTimeout = body.ocrTimeout || 30000;
  const [baselineOcr, currentOcr] = await Promise.all([
    recognizeText(ocrEndpoint, ocrTimeout, baselinePath, pageName, viewportName, "baseline"),
    recognizeText(ocrEndpoint, ocrTimeout, currentPath, pageName, viewportName, "current"),
  ]);

  let ocrCompare = null;
  if (baselineOcr.status === "ok" && currentOcr.status === "ok") {
    ocrCompare = compareOcrResults(baselineOcr, currentOcr);
  }

  // Detectors
  const issues = await runAllDetectorsAsync(diffResult, baselineOcr, currentOcr, ocrCompare);

  // Build comparison result
  const comparison: ComparisonResult = {
    pageName,
    viewportName,
    inputMode: "image",
    status: "ok",
    screenshot: {
      pageName, viewportName,
      baselinePath, currentPath,
      viewport: { width: w, height: h },
    },
    diff: diffResult,
    baselineOcr, currentOcr, ocrCompare, issues,
  };

  // Build summary
  const summary: ReportSummary = {
    totalComparisons: 1,
    totalIssues: issues.length,
    issuesByCategory: {},
    issuesBySeverity: {},
    ocrFailures: 0,
  };
  for (const iss of issues) {
    summary.issuesByCategory[iss.category] = (summary.issuesByCategory[iss.category] ?? 0) + 1;
    summary.issuesBySeverity[iss.severity] = (summary.issuesBySeverity[iss.severity] ?? 0) + 1;
  }
  if (baselineOcr.status === "OCR_FAILED") summary.ocrFailures++;
  if (currentOcr.status === "OCR_FAILED") summary.ocrFailures++;

  const ocrSuccess = baselineOcr.status === "ok" && currentOcr.status === "ok";

  // Generate report
  const reportData: ReportData = {
    generatedAt: new Date().toISOString(),
    config: {
      pages: [{ name: pageName, baseline_url: "", current_url: "", baseline_image: baselinePath, current_image: currentPath, inputMode: "image" }],
      viewports: [{ name: viewportName, width: w, height: h }],
      ocrEndpoint, browserType: "chromium",
    },
    summary,
    comparisons: [comparison],
  };
  generateReports(reportData);

  respond(res, 200, {
    ok: true,
    summary: {
      ...summary,
      diffPercent: diffResult.diffPercent,
      diffPixels: diffResult.diffPixels,
      totalPixels: diffResult.totalPixels,
      ocrSuccess,
    },
    issues,
    reportUrl: "/reports/index.html",
  });
}

// ---- server ----

async function main() {
  const PORT = parseInt(process.env.PORT || "3100", 10);

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // API: compare
    if (method === "POST" && url === "/api/compare") {
      try {
        const body = await jsonBody<CompareRequest>(req);
        await handleCompare(body, res);
      } catch (err) {
        respond(res, 500, { ok: false, error: (err as Error).message });
      }
      return;
    }

    // API: options preflight
    if (method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
      res.end();
      return;
    }

    // Serve reports static files
    if (url.startsWith("/reports/")) {
      const reportPath = join(ROOT, url);
      serveStatic(res, reportPath);
      return;
    }

    // Serve screenshots for report images
    if (url.startsWith("/screenshots/")) {
      const imgPath = join(ROOT, url);
      serveStatic(res, imgPath);
      return;
    }

    // Home page
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(UPLOAD_HTML);
      return;
    }

    // Health check
    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "visual-proofreader" }));
      return;
    }

    // 404
    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`=== 视觉校稿 Web 界面 ===`);
    console.log(`服务地址: http://0.0.0.0:${PORT}`);
    console.log(`OCR 服务: ${process.env.OCR_ENDPOINT || "http://localhost:8866"}`);
    console.log(`按 Ctrl+C 停止服务\n`);
  });
}

// Graceful shutdown
process.on("SIGINT", () => { console.log("\n服务已停止"); process.exit(0); });
process.on("SIGTERM", () => { console.log("\n服务已停止"); process.exit(0); });

main().catch((err) => {
  console.error("服务器启动失败:", err);
  process.exit(1);
});
