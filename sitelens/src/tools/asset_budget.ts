import { resolvePathWithinRoots } from "../paths.js";
import { aggregateAssets, listAssets } from "../metrics.js";

export function registerAssetBudgetTool(
  addTool: (name: string, schema: any, handler: (args: any) => any) => void,
  getRoots: () => string[]
) {
  addTool("aa.asset_budget", {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "patterns": { "type": "array", "items": { "type": "string" } },
      "budgetKB": { "type": "number" }
    },
    "required": ["path"]
  }, async (args: any) => {
    try {
      const roots = getRoots();
      if (!roots.length) throw new Error("No hay roots permitidas (use --roots o ALLOWED_ROOTS).");
      const resolved = resolvePathWithinRoots(args.path, roots);
      const patterns: string[] | undefined = Array.isArray(args.patterns) && args.patterns.length ? args.patterns : undefined;
      const budget = typeof args.budgetKB === "number" ? args.budgetKB : 200;
      const files = listAssets(resolved, patterns);
      const out = aggregateAssets(files, budget);
      return { structuredContent: { result: out } };
    } catch (e: any) {
      return { error: { code: -32000, message: e?.message || "Error en aa.asset_budget" } };
    }
  });
}
