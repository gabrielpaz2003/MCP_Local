import fs from "node:fs";
import { resolvePathWithinRoots } from "../paths.js";
import { walkFiles } from "../metrics.js";

export function registerSitemapTool(
  addTool: (name: string, schema: any, handler: (args: any) => any) => void,
  getRoots: () => string[]
) {
  addTool("aa.sitemap", {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "includeHtmlOnly": { "type": "boolean" },
      "maxDepth": { "type": "number" }
    },
    "required": ["path"]
  }, async (args: any) => {
    try {
      const roots = getRoots();
      if (!roots.length) throw new Error("No hay roots permitidas (use --roots o ALLOWED_ROOTS).");
      const includeHtmlOnly = !!args.includeHtmlOnly;
      const maxDepth = Math.min(Math.max(0, args.maxDepth ?? 20), 20);
      const resolved = resolvePathWithinRoots(args.path, roots);
      fs.statSync(resolved);
      const tree = walkFiles(resolved, includeHtmlOnly, maxDepth);
      return { structuredContent: { result: tree } };
    } catch (e: any) {
      return { error: { code: -32000, message: e?.message || "Error en aa.sitemap" } };
    }
  });
}
