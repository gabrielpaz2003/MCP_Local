import { resolvePathWithinRoots } from "../paths.js";
import type { GlobalCache } from "./scan_accessibility.js";

export function registerReportTool(
  addTool: (name: string, schema: any, handler: (args: any) => any) => void,
  getRoots: () => string[],
  cache: GlobalCache
) {
  addTool(
    "aa.report",
    {
      type: "object",
      properties: {
        path: { type: "string" },
        weights: {
          type: "object",
          properties: {
            a11y: { type: "number" },
            links: { type: "number" },
            performance: { type: "number" }
          }
        },
        top: { type: "number" }
      },
      required: ["path"]
    },
    async (args: any) => {
      try {
        const roots = getRoots();
        if (!roots.length) throw new Error("No hay roots permitidas (use --roots o ALLOWED_ROOTS).");
        const resolved = resolvePathWithinRoots(args.path, roots);

        const weights = {
          a11y: typeof args?.weights?.a11y === "number" ? args.weights.a11y : 1.0,
          links: typeof args?.weights?.links === "number" ? args.weights.links : 1.0,
          performance: typeof args?.weights?.performance === "number" ? args.weights.performance : 1.0
        };
        const top = Math.max(1, Math.min(100, args.top ?? 10));

        const bucket = cache.get(resolved) || {};
        const a11y = bucket.a11y || [];
        const links = bucket.links || [];
        const assets = bucket.assets || {};

        const linkErrors = (links as any[]).filter((l) => l.status === "missing").length;
        const overBudget = (assets?.overBudget || []).length;

        // Agregar todos los archivos que aparezcan en cualquiera de las fuentes
        const files = new Set<string>([
          ...a11y.map((r: any) => r.file),
          ...(links as any[]).map((l) => l.file),
          ...((assets?.topHeavy || []).map((t: any) => t.file))
        ]);

        // Mapa con conteos de a11y por archivo
        const a11yByFile = new Map<string, { errors: number; warns: number }>();
        for (const r of a11y as any[]) {
          a11yByFile.set(r.file, {
            errors: r.summary?.countsBySeverity?.ERROR ?? 0,
            warns: r.summary?.countsBySeverity?.WARN ?? 0
          });
        }

        const ranking: Array<{ file: string; score: number }> = [];
        for (const f of files) {
          const a = a11yByFile.get(f) || { errors: 0, warns: 0 };
          const perFileLinkMissing = (links as any[]).filter((l) => l.file === f && l.status === "missing").length;
          const perFileOverBudget = (assets?.overBudget || []).filter((x: any) => x.file === f).length;

          // Penalizaciones heurísticas
          const aPenalty = (a.errors * 5 + a.warns * 2) * weights.a11y;
          const lPenalty = perFileLinkMissing * 3 * weights.links;
          const pPenalty = perFileOverBudget * 4 * weights.performance;

          let score = 100 - (aPenalty + lPenalty + pPenalty);
          if (score < 0) score = 0;
          if (score > 100) score = 100;

          ranking.push({ file: f, score: Math.round(score * 100) / 100 });
        }

        ranking.sort((x, y) => y.score - x.score);

        // Quick wins (alt/labels) desde resultados a11y
        const quickWins: Array<{ file: string; rule: string; message: string }> = [];
        for (const r of a11y as any[]) {
          for (const iss of r.issues || []) {
            if (iss.rule === "img-alt" || iss.rule === "form-labels") {
              quickWins.push({ file: r.file, rule: iss.rule, message: iss.message });
            }
          }
        }

        const summaryText =
          `Reporte consolidado SiteLens
- Archivos evaluados: ${files.size}
- Enlaces rotos: ${linkErrors}
- Assets sobre presupuesto: ${overBudget}
- Top Quick Wins: ${Math.min(top, quickWins.length)}
`;

        return {
          structuredContent: {
            result: {
              ranking: ranking.slice(0, top),
              quickWins: quickWins.slice(0, top)
            }
          },
          content: [{ type: "text", text: summaryText }]
        };
      } catch (e: any) {
        return { error: { code: -32000, message: e?.message || "Error en aa.report" } };
      }
    }
  );
}
