import fs from "node:fs";
import path from "node:path";
import { resolvePathWithinRoots, isPathInsideAnyRoot, normalizePath } from "../paths.js";
import { listHtmlFiles } from "../metrics.js";
import { readHtml, collectLinks, toAbsoluteIfRelative } from "../html.js";

type LinkItem = {
  file: string;
  link: string;
  line?: number;
  ok: boolean;
  external?: boolean;
  status: "ok" | "missing" | "skipped";
};

export function registerLinkCheckTool(
  addTool: (name: string, schema: any, handler: (args: any) => any) => void,
  getRoots: () => string[]
) {
  addTool("aa.link_check", {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "entry": { "type": "string" },
      "extensions": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["path"]
  }, async (args: any) => {
    try {
      const roots = getRoots();
      if (!roots.length) throw new Error("No hay roots permitidas (use --roots o ALLOWED_ROOTS).");

      const resolvedBase = resolvePathWithinRoots(args.path, roots);
      const htmlList = args.entry
        ? listHtmlFiles(resolvePathWithinRoots(args.entry, roots))
        : listHtmlFiles(resolvedBase);

      const _exts = Array.isArray(args.extensions) && args.extensions.length
        ? args.extensions.map((e: string) => e.toLowerCase())
        : [".html",".htm",".css",".js",".png",".jpg",".jpeg",".svg",".webp",".ico"];
      // Nota: _exts reservado por si luego filtramos por extensión del target.

      const results: LinkItem[] = [];

      for (const file of htmlList) {
        const doc = readHtml(file);
        if (!doc) continue;
        const links = collectLinks(doc);
        const baseDir = path.dirname(file);

        for (const l of links) {
          const href = l.value;
          if (!href) continue;

          if (/^https?:\/\//i.test(href)) {
            results.push({ file, link: href, ok: false, external: true, status: "skipped" });
            continue;
          }
          if (href.startsWith("#")) {
            results.push({ file, link: href, ok: true, status: "ok" });
            continue;
          }

          const abs = normalizePath(toAbsoluteIfRelative(href, baseDir));
          if (!isPathInsideAnyRoot(abs, roots)) {
            results.push({ file, link: href, ok: false, status: "missing" });
            continue;
          }

          const exists = fileExists(abs);
          results.push({ file, link: href, ok: exists, status: exists ? "ok" : "missing" });
        }
      }

      return { structuredContent: { result: results } };
    } catch (e: any) {
      return { error: { code: -32000, message: e?.message || "Error en aa.link_check" } };
    }
  });
}

function fileExists(p: string): boolean {
  try {
    const st = fs.statSync(p);
    return st.isFile();
  } catch {
    return false;
  }
}
