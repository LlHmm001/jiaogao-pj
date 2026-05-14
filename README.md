# Visual Proofreader 视觉校稿工具

自动对比页面 / H5 / 设计稿修改前后的视觉差异，减少人工检查时遗漏的问题。

## 检测能力

| 原需求 | 检测器 | 依赖 | 实现 |
|---|---|---|---|
| 文字跳字 / 文字丢失 | `text_missing` | OCR | ✅ |
| 文字内容变化 | `text_changed` | OCR | ✅ |
| 错位 / 元素偏移 | `layout_shift` | OCR | ✅ |
| 方向变化 (LTR/RTL) | `text_direction_changed` | 无 | 📋 预留 |
| 换行异常 / 文字跳行 | `line_break_anomaly` | OCR | ✅ |
| 文字溢出边界 | `text_overflow` | OCR | ✅ |
| 图片拉伸 / 压缩 / 变形 | `image_deformation` | 无 | ✅ |
| 元素重叠 / 遮挡 | `element_overlap` | OCR | ✅ |

**独立于 OCR 的检测器（不开 OCR 也能跑）：**
- `image_deformation` — 仅依赖像素对比，diff > 5% 时提示
- `text_direction_changed` — 预留接口，无依赖

## 快速开始

```bash
# 1. 安装
cd visual-proofreader
npm install

# 2. 启动 Web 界面（推荐）
npm start:web

# 3. 浏览器打开 http://localhost:3100
#    拖拽上传修改前后的两张图片，点击"开始对比"

# 可选：本地图片模式
npm start
start reports/index.html  # Windows
```

**Web 界面无需编辑 JSON 配置文件，直接拖拽上传即可对比。**

### Docker 部署

```bash
# 一键启动（包含 Web 服务 + EasyOCR）
docker compose up -d

# 浏览器打开 http://localhost:3100
# OCR 服务地址（在容器内自动连接）: http://ocr:8866
```

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `LLM_API_KEY` | - | 大模型 API Key（可选，启用语义分析） |
| `LLM_API_URL` | `https://api.openai.com/v1` | LLM 接口地址 |
| `LLM_MODEL` | `gpt-4o` | 模型名称 |

## 三种使用方式

### 方式一：网页直接上传（推荐，最简单）

在浏览器中直接拖拽上传两张图片即可对比，无需编辑配置文件：

```bash
npm start:web
```

浏览器打开 `http://localhost:3100`，上传修改前后的图片，点击 "开始对比"。结果即时展示在页面上，也可打开完整 HTML 报告。

**不需要浏览器截图，不需要编辑 JSON 配置。**

### 方式二：本地图片对比

把修改前后的两张图片放进 `examples/` 目录，编辑 `config/pages.json`：

```json
[
  {
    "name": "首页设计稿",
    "baseline_image": "examples/before.png",
    "current_image": "examples/after.png"
  },
  {
    "name": "弹窗设计稿",
    "baseline_image": "examples/popup-before.png",
    "current_image": "examples/popup-after.png"
  }
]
```

运行 `npm start`，打开 `reports/index.html` 查看结果。

### 方式三：URL 在线截图

编辑 `config/pages.json`（参考 `config/pages.url-example.json`）：

```json
[
  {
    "name": "首页-desktop",
    "baseline_url": "https://staging.example.com/",
    "current_url": "https://production.example.com/"
  }
]
```

需要安装 Playwright 浏览器：

```bash
npx playwright install chromium
```

## 配置文件说明

### `config/pages.json` — 对比页面/图片列表

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 唯一名称，用于文件名 |
| `baseline_url` | URL 模式 | 基准页面地址 |
| `current_url` | URL 模式 | 当前页面地址 |
| `baseline_image` | 图片模式 | 基准图片路径 |
| `current_image` | 图片模式 | 当前图片路径 |

**每个页面只能选一种模式：URL 或图片。同时填两种以 URL 优先。**

### `config/viewports.json` — 视口尺寸

```json
[
  { "name": "desktop", "width": 1280, "height": 800 },
  { "name": "mobile",  "width": 375,  "height": 812 }
]
```

- 图片模式下视口尺寸可选，用于报告展示
- URL 模式下 Playwright 按此分辨率截图

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `OCR_ENDPOINT` | `http://localhost:8866` | OCR 服务地址（PaddleOCR / EasyOCR） |
| `OCR_TIMEOUT` | `30000` | OCR 请求超时 (ms) |
| `BROWSER_TYPE` | `chromium` | 浏览器（仅 URL 模式） |
| `PORT` | `3100` | Web 界面端口（仅 `npm start:web`） |

## OCR 部署（开启文字检测）

**只有文字相关检测器需要 OCR**。像素对比、图片变形检测不需要 OCR。

提供三种 OCR 后端，任选其一即可。接口格式兼容，无需修改代码。

### 方式一：EasyOCR（推荐，pip 安装）

项目自带 EasyOCR HTTP 服务脚本，一行命令启动：

```bash
pip install easyocr pillow numpy
python scripts/easyocr_server.py --port 8866

# 验证是否启动成功
curl http://localhost:8866/health
```

默认语言为中文 + 英文 (`ch_sim,en`)，可通过 `--lang` 参数调整。

### 方式二：PaddleOCR Docker

```bash
docker run -d -p 8866:8866 paddlecloud/paddleocr:latest

# 验证是否启动成功
curl http://localhost:8866/ocr/predict
```

### 方式三：PaddleOCR pip

```bash
pip install paddlepaddle paddleocr
paddleocr --lang ch --server --port 8866
```

### 方式四：不用 OCR

不启动 OCR 也能正常使用 — 像素对比和图片变形检测始终有效。报告里会显示 "OCR 失败" 标签。

### OCR 官方资源

- EasyOCR: https://github.com/JaidedAI/EasyOCR
- PaddleOCR GitHub: https://github.com/PaddlePaddle/PaddleOCR
- PaddleOCR 文档: https://paddlepaddle.github.io/PaddleOCR/
- PaddleOCR Docker Hub: https://hub.docker.com/r/paddlecloud/paddleocr

## 项目结构

```
visual-proofreader/
├── config/
│   ├── pages.json              # 对比页面/图片列表
│   ├── pages.url-example.json  # URL 模式示例
│   └── viewports.json          # 视口尺寸
├── examples/                   # 放你的对比图片
│   ├── baseline.png
│   └── current.png
├── scripts/
│   └── easyocr_server.py       # EasyOCR HTTP 服务（Python）
├── src/
│   ├── index.ts                # CLI 主流程
│   ├── server.ts               # Web 界面 + 上传 API
│   ├── types/index.ts          # 类型定义
│   ├── config/loader.ts        # 配置加载
│   ├── screenshot/capturer.ts  # 截图/图片加载
│   ├── diff/pixel-diff.ts      # pixelmatch 像素对比
│   ├── ocr/
│   │   ├── client.ts           # OCR HTTP 客户端（兼容 PaddleOCR / EasyOCR）
│   │   └── compare.ts          # OCR 结果匹配
│   ├── detectors/
│   │   ├── index.ts            # 检测器注册中心
│   │   ├── text-missing.ts
│   │   ├── text-changed.ts
│   │   ├── layout-shift.ts
│   │   ├── text-direction-changed.ts
│   │   ├── text-overflow.ts
│   │   ├── line-break.ts
│   │   ├── image-deformation.ts
│   │   └── element-overlap.ts
│   └── report/
│       ├── generator.ts        # 报告生成
│       └── html-template.ts    # HTML 报告模板
├── screenshots/                # 运行时生成
│   ├── baseline/
│   ├── current/
│   └── diff/
├── reports/                    # 运行时生成
│   ├── index.html              # 可视化报告（可直接打开）
│   └── report.json             # 机器可读数据
├── .github/workflows/
│   └── proofread.yml           # GitHub Actions CI
├── package.json
└── README.md
```

## GitHub Actions

```bash
# 自动运行，PR 时自动评论结果
# 需配置 OCR_ENDPOINT secret，或使用 Docker service container
```

## 输出报告

- **`reports/index.html`** — 自包含 HTML，无需服务器，浏览器直接打开。包含：
  - 📊 总览：对比统计、问题分布
  - ⚙️ 配置 & 流程：输入方式、6 步流水线
  - 🔍 检测能力：8 个检测器状态 + 原始需求对照
  - 📑 对比详情：截图并排、diff 图、OCR 结果、问题列表
- **`reports/report.json`** — JSON 数据，供 CI 解析

## 依赖总览

```
                 ┌─────────────┐
                 │  pixelmatch │  始终运行
                 │  (像素对比) │
                 └──────┬──────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   image_deformation  diff 数据   其他 7 个检测器
   不需要 OCR        用于报告      需要 OCR 或预留
```

## 常见问题

**Q: 不装 OCR 能用吗？**
A: 可以。像素对比 + 图片变形检测始终有效。文字相关检测器跳过，报告显示 "OCR 失败"。

**Q: 支持哪些图片格式？**
A: PNG。如果是 JPG/GIF/WebP，先转换为 PNG。

**Q: 图片尺寸不一致怎么办？**
A: 自动把较小的图片 padding 到较大尺寸再对比，不会报错。

**Q: 可以一次对比多少组？**
A: pages × viewports 的笛卡尔积，当前无上限。
