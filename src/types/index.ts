// ========== Config Types ==========

export interface PageConfig {
  name: string;
  baseline_url?: string;
  current_url?: string;
  baseline_image?: string;
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

// ========== Detector Types ==========

export type IssueSeverity = "error" | "warning" | "info";

export type IssueCategory = "image_deformation";

export interface DetectorIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  pageName: string;
  viewportName: string;
  description: string;
  detail: Record<string, unknown>;
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
  issues: DetectorIssue[];
  error?: string;
}

export interface ReportSummary {
  totalComparisons: number;
  totalIssues: number;
  issuesByCategory: Record<string, number>;
  issuesBySeverity: Record<string, number>;
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
  browserType: string;
}

export interface ReportData {
  generatedAt: string;
  config: ReportConfig;
  summary: ReportSummary;
  comparisons: ComparisonResult[];
}
