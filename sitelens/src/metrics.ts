import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { HTMLElement } from "node-html-parser";
import { readHtml, listHeadings, findInputsNeedingLabel, parseInlineColors, cssColorToRgb, contrastRatio } from "./html.js";

export type Severity = "INFO" | "WARN" | "ERROR";

export interface A11yIssue {
  rule: string;
  severity: Severity;
  message: string;
  selector?: string;
  line?: number;
}

export interface A11yResult {
  file: string;
  issues: A11yIssue[];
  summary: { countsBySeverity: { INFO: number; WARN: number; ERROR: number } };
}

export function walkFiles(rootPath: string, includeHtmlOnly?: boolean, maxDepth = 20): { path: string; type: "file"|"dir"; children?: any[] } {
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) {
    if (includeHtmlOnly && !/\.(html?|HTML?)$/.test(rootPath)) {
      return { path: rootPath, type: "file" };
    }
    return { path: rootPath, type: "file" };
  }
  const tree: { path: string; type: "dir"; children: any[] } = { path: rootPath, type: "dir", children: [] };
  function recurse(dir: string, depth: number, parent: any) {
    if (depth > maxDepth) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) {
          const node = { path: p, type: "dir", children: [] as any[] };
          parent.children.push(node);
          recurse(p, depth + 1, node);
        } else {
          if (includeHtmlOnly && !/\.(html?|HTML?)$/.test(p)) continue;
          parent.children.push({ path: p, type: "file" });
        }
      } catch { /* ignore */ }
    }
  }
  recurse(rootPath, 0, tree);
  return tree;
}

export function listHtmlFiles(dirOrFile: string): string[] {
  const stat = fs.statSync(dirOrFile);
  if (stat.isFile()) {
    return /\.(html?|HTML?)$/.test(dirOrFile) ? [dirOrFile] : [];
  }
  // glob html en subdirectorios
  const pattern = dirOrFile.replace(/\\/g, "/") + "/**/*.{html,htm,HTML,HTM}";
  return fg.sync(pattern, { onlyFiles: true });
}

export function scanAltText(root: HTMLElement): A11yIssue[] {
  const issues: A11yIssue[] = [];
  root.querySelectorAll("img").forEach((img) => {
    const alt = img.getAttribute("alt");
    if (alt === undefined || alt === null || alt.trim() === "") {
      issues.push({
        rule: "img-alt",
        severity: "ERROR",
        message: "<img> sin texto alternativo (alt).",
        selector: "img"
      });
    }
  });
  return issues;
}

export function scanFormLabels(root: HTMLElement): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const list = findInputsNeedingLabel(root);
  for (const el of list) {
    issues.push({
      rule: "form-labels",
      severity: "ERROR",
      message: "Control de formulario sin <label> asociado.",
      selector: el.tagName?.toLowerCase()
    });
  }
  return issues;
}

export function scanLandmarks(root: HTMLElement): A11yIssue[] {
  const landmarks = ["main", "nav", "header", "footer", "aside"];
  const roles = ["main", "navigation", "banner", "contentinfo", "complementary"];
  const hasLandmark =
    root.querySelector(landmarks.join(",")) ||
    root.querySelectorAll("[role]").some((el) => {
      const r = el.getAttribute("role")?.toLowerCase()?.trim();
      return r && roles.includes(r);
    });

  if (!hasLandmark) {
    return [{
      rule: "landmarks",
      severity: "WARN",
      message: "No se detectaron landmarks/roles semánticos principales (main/nav/header/footer/aside o roles equivalentes)."
    }];
  }
  return [];
}

export function scanHeadingOrder(root: HTMLElement): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const seq = listHeadings(root);
  if (seq.length === 0) return issues;

  let prev = seq[0].level;
  for (let i = 1; i < seq.length; i++) {
    const cur = seq[i].level;
    if (cur > prev + 1) {
      issues.push({
        rule: "headings-order",
        severity: "WARN",
        message: `Salto de encabezado de h${prev} a h${cur} (orden poco lógico).`
      });
    }
    prev = cur;
  }
  return issues;
}

export function scanInlineContrast(root: HTMLElement): A11yIssue[] {
  const issues: A11yIssue[] = [];
  root.querySelectorAll("*[style]").forEach((el) => {
    const style = el.getAttribute("style") || "";
    const { color, bg } = parseInlineColors(style);
    if (!color || !bg) return;
    const fgRgb = cssColorToRgb(color);
    const bgRgb = cssColorToRgb(bg);
    if (!fgRgb || !bgRgb) return;
    const ratio = contrastRatio(fgRgb, bgRgb);
    if (ratio < 4.5) {
      issues.push({
        rule: "contrast",
        severity: ratio < 3 ? "ERROR" : "WARN",
        message: `Contraste insuficiente (≈ ${ratio.toFixed(2)}:1, AA requiere ≥ 4.5:1 para texto normal).`
      });
    }
  });
  return issues;
}

export function runA11y(file: string): A11yResult {
  const root = readHtml(file);
  const issues: A11yIssue[] = [];
  if (!root) {
    issues.push({ rule: "parse-error", severity: "ERROR", message: "No se pudo parsear el HTML." });
  } else {
    issues.push(...scanAltText(root));
    issues.push(...scanFormLabels(root));
    issues.push(...scanLandmarks(root));
    issues.push(...scanHeadingOrder(root));
    issues.push(...scanInlineContrast(root));
  }
  const summary = {
    countsBySeverity: {
      INFO: issues.filter(i => i.severity === "INFO").length,
      WARN: issues.filter(i => i.severity === "WARN").length,
      ERROR: issues.filter(i => i.severity === "ERROR").length
    }
  };
  return { file, issues, summary };
}

export function listAssets(dirOrFile: string, patterns?: string[]): string[] {
  const stat = fs.statSync(dirOrFile);
  if (stat.isFile()) {
    return [dirOrFile];
  }
  const pats = (patterns && patterns.length ? patterns : ["**/*.{css,js,png,jpg,jpeg,svg,webp,ico,woff,woff2,ttf,otf}"])
    .map((p) => (p.includes("/") ? p : `**/${p}`));
  const entries = fg.sync(pats, { cwd: dirOrFile, onlyFiles: true, absolute: true });
  return entries;
}

export function fileKB(p: string): number {
  const st = fs.statSync(p);
  return Math.round((st.size / 1024) * 100) / 100;
}

export function extOf(p: string): string {
  return (path.extname(p) || "").toLowerCase();
}

export function aggregateAssets(files: string[], budgetKB = 200) {
  const byType: Record<string, number> = {};
  let totalKB = 0;

  for (const f of files) {
    const kb = fileKB(f);
    const ext = extOf(f) || "misc";
    byType[ext] = (byType[ext] || 0) + kb;
    totalKB += kb;
  }

  const topHeavy = [...files]
    .map((f) => ({ file: f, sizeKB: fileKB(f) }))
    .sort((a, b) => b.sizeKB - a.sizeKB)
    .slice(0, 20);

  const overBudget = topHeavy.filter((x) => x.sizeKB > budgetKB)
    .map((x) => ({ file: x.file, sizeKB: x.sizeKB, budgetKB }));

  return { summary: { totalKB: round2(totalKB), byType: mapRound2(byType) }, topHeavy, overBudget };
}

function mapRound2(obj: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const k of Object.keys(obj)) out[k] = round2(obj[k]);
  return out;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
