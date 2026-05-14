// ========== Config Types ==========

export interface PageConfig {
  name: string;
  /** URL 模式：基准页地址 */
  baseline_url?: string;
  /** URL 模式：当前页地址 */
  current_url?: string;
  /** 本地图片模式：基准图片路径（相对项目根目录或绝对路径） */
  baseline_image?: string;
  /** 本地图片模式：当前图片路径（相对项目根目录或绝对路径） */
  current_image?: string;
}

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
}

export interface AppConfig {
  pages: PageConfig[];
  viewports: ViewportConfig[];
  ocrEndpoint: string;
  ocrTimeout: number;
  browserType: "chromium" | "firefox" | "webkit";
}

// ========== Screenshot Types ==========

export interface ScreenshotResult {
  pageName: string;
  viewportName: string;
  baselinePath: string;
  currentPath: string;
  viewport: { width: number; height: number };
}

// ========== Diff Types ==========

export interface DiffResult {
  pageName: string;
  viewportName: string;
  diffPath: string;
  diffPercent: number;
  diffPixels: number;
  totalPixels: number;
}

// ========== OCR Types ==========

export interface OcrBlock {
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
}

export interface OcrResult {
  pageName: string;
  viewportName: string;
  variant: "baseline" | "current";
  status: "ok";
  blocks: OcrBlock[];
  rawResponse: unknown;
}

export interface OcrErrorResult {
  pageName: string;
  viewportName: string;
  variant: "baseline" | "current";
  status: "OCR_FAILED";
  error: string;
}

export type OcrOutcome = OcrResult | OcrErrorResult;

export interface OcrBlockPair {
  baseline: OcrBlock;
  current: OcrBlock | null;
}

export interface OcrCompareResult {
  pageName: string;
  viewportName: string;
  pairs: OcrBlockPair[];
  unmatchedBaseline: OcrBlock[];
  unmatchedCurrent: OcrBlock[];
}

// ========== Detector Types ==========

export type IssueSeverity = "error" | "warning" | "info";

export type IssueCategory =
  | "text_missing"
  | "text_changed"
  | "layout_shift"
  | "text_direction_changed"
  | "text_overflow"
  | "line_break_anomaly"
  | "image_deformation"
  | "element_overlap"
  | "semantic_change";

export interface DetectorIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  pageName: string;
  viewportName: string;
  description: string;
  detail: Record<string, unknown>;
}

export interface Detector {
  readonly category: IssueCategory;
  detect(
    diff: DiffResult,
    baselineOcr: OcrOutcome,
    currentOcr: OcrOutcome,
    ocrCompareResult: OcrCompareResult | null,
  ): DetectorIssue[];
}

// ========== Report Types ==========

export type InputMode = "url" | "image";

export interface ComparisonResult {
  pageName: string;
  viewportName: string;
  inputMode: InputMode;
  status: "ok" | "failed";
  screenshot: ScreenshotResult;
  diff: DiffResult;
  baselineOcr: OcrOutcome;
  currentOcr: OcrOutcome;
  ocrCompare: OcrCompareResult | null;
  issues: DetectorIssue[];
  error?: string;
}

export interface ReportSummary {
  totalComparisons: number;
  totalIssues: number;
  issuesByCategory: Record<string, number>;
  issuesBySeverity: Record<string, number>;
  ocrFailures: number;
}

export interface ReportPageConfig {
  name: string;
  baseline_url: string;
  current_url: string;
  baseline_image: string;
  current_image: string;
  inputMode: InputMode;
}

export interface ReportConfig {
  pages: ReportPageConfig[];
  viewports: Array<{ name: string; width: number; height: number }>;
  ocrEndpoint: string;
  browserType: string;
}

export interface ReportData {
  generatedAt: string;
  config: ReportConfig;
  summary: ReportSummary;
  comparisons: ComparisonResult[];
}
