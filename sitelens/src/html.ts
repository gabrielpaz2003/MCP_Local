import fs from "node:fs";
import path from "node:path";
import { parse, HTMLElement } from "node-html-parser";

export function readHtml(filePath: string): HTMLElement | null {
  try {
    const buf = fs.readFileSync(filePath);
    // Asumimos UTF-8 por defecto
    const text = buf.toString("utf8");
    const root = parse(text, { blockTextElements: { script: false, style: false }, comment: true });
    return root as unknown as HTMLElement;
  } catch {
    return null;
  }
}

export function collectLinks(root: HTMLElement): { tag: string; attr: "href"|"src"; value: string }[] {
  const links: { tag: string; attr: "href"|"src"; value: string }[] = [];

  const pushAttr = (tagName: string, attr: "href"|"src") => {
    root.querySelectorAll(tagName).forEach((el) => {
      const v = el.getAttribute(attr);
      if (v) links.push({ tag: tagName, attr, value: v.trim() });
    });
  };

  pushAttr("a", "href");
  pushAttr("link", "href");
  pushAttr("script", "src");
  pushAttr("img", "src");
  pushAttr("source", "src");
  pushAttr("video", "src");
  pushAttr("audio", "src");

  return links;
}

export function toAbsoluteIfRelative(target: string, baseDir: string): string {
  if (/^[a-zA-Z]+:\/\//.test(target)) return target; // externo
  if (target.startsWith("#")) return target; // ancla
  if (path.isAbsolute(target)) return target; // absoluto local (posible)
  return path.resolve(baseDir, target);
}

export function findInputsNeedingLabel(root: HTMLElement): HTMLElement[] {
  const sel = [
    "input[type=text]",
    "input[type=email]",
    "input[type=password]",
    "input[type=checkbox]",
    "input[type=radio]",
    "select",
    "textarea"
  ].join(",");

  const els = root.querySelectorAll(sel);
  const needing: HTMLElement[] = [];

  for (const el of els) {
    // Tiene id con label[for=id]?
    const id = el.getAttribute("id")?.trim();
    let hasLabel = false;

    if (id) {
      const lbl = root.querySelector(`label[for="${cssEscape(id)}"]`);
      if (lbl) hasLabel = true;
    }
    // Está envuelto por label?
    if (!hasLabel) {
      let parent = el.parentNode;
      // @ts-ignore
      while (parent && parent.nodeType && parent.tagName?.toLowerCase) {
        // @ts-ignore
        if (parent.tagName?.toLowerCase() === "label") {
          hasLabel = true;
          break;
        }
        // @ts-ignore
        parent = parent.parentNode;
      }
    }

    if (!hasLabel) needing.push(el);
  }

  return needing;
}

function cssEscape(s: string) {
  return s.replace(/["\\]/g, "\\$&");
}

export function listHeadings(root: HTMLElement): { level: number; node: HTMLElement }[] {
  const res: { level: number; node: HTMLElement }[] = [];
  for (let l = 1; l <= 6; l++) {
    const tag = `h${l}`;
    root.querySelectorAll(tag).forEach((n) => res.push({ level: l, node: n }));
  }
  // mantener orden de aparición en el documento
  res.sort((a, b) => {
    // @ts-ignore
    return a.node.sourceCodeLocation?.startOffset - b.node.sourceCodeLocation?.startOffset || 0;
  });
  return res;
}

export function parseInlineColors(style: string) {
  // busca color: #xxx ó #xxxxxx y background(-color)
  const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  const bgMatch = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);
  const color = colorMatch?.[1]?.trim();
  const bg = bgMatch?.[1]?.trim();
  return { color, bg };
}

export function cssColorToRgb(col?: string): { r: number; g: number; b: number } | null {
  if (!col) return null;
  const c = col.trim().toLowerCase();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return { r, g, b };
    } else {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return { r, g, b };
    }
  }
  // rgb(r,g,b)
  const rgb = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  }
  return null;
}

export function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const srgb = [r, g, b].map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const [R, G, B] = srgb;
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}
