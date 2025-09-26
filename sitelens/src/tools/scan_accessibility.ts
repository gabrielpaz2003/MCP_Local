import { resolvePathWithinRoots } from "../paths.js";
import { listHtmlFiles, runA11y } from "../metrics.js";

export type GlobalCache = Map<string, {
  a11y?: ReturnType<typeof runA11y>[];
  links?: any[];
  assets?: any;
}>;

export function registerScanAccessibilityTool(
  addTool: (name: string, schema: any, handler: (args: any) => any) => void,
  getRoots: () => string[],
  cache: GlobalCache
) {
  addTool("aa.scan_accessibility", {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "include": { "type": "array", "items": { "type": "string" } },
      "exclude": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["path"]
  }, async (args: any) => {
    try {
      const roots = getRoots();
      if (!roots.length) throw new Error("No hay roots permitidas (use --roots o ALLOWED_ROOTS).");
      const resolved = resolvePathWithinRoots(args.path, roots);
      const include: string[] = Array.isArray(args.include) ? args.include : [];
      const exclude: string[] = Array.isArray(args.exclude) ? args.exclude : [];

      let files = listHtmlFiles(resolved);
      if (include.length) files = files.filter((f) => include.some((inc) => f.includes(inc)));
      if (exclude.length) files = files.filter((f) => !exclude.some((exc) => f.includes(exc)));

      const results = files.map((f) => runA11y(f));

      cache.set(resolved, {
        a11y: results,
        links: cache.get(resolved)?.links,
        assets: cache.get(resolved)?.assets
      });

      return { structuredContent: { result: results } };
    } catch (e: any) {
      return { error: { code: -32000, message: e?.message || "Error en aa.scan_accessibility" } };
    }
  });
}
