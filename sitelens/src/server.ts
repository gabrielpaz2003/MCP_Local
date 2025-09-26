import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";
import { splitRoots } from "./paths.js";
import { registerAllowedRootsTool } from "./tools/allowed_roots.js";
import { registerSitemapTool } from "./tools/sitemap.js";
import { registerLinkCheckTool } from "./tools/link_check.js";
import { registerAssetBudgetTool } from "./tools/asset_budget.js";
import { registerScanAccessibilityTool, type GlobalCache } from "./tools/scan_accessibility.js";
import { registerReportTool } from "./tools/report.js";

// ---- CLI/Env roots ----
const argv = yargs(hideBin(process.argv))
  .option("roots", {
    type: "string",
    describe: "Roots permitidas, separadas por ';' (Windows)",
  })
  .parseSync();

const allowedRoots = splitRoots(argv.roots);
function getAllowedRoots() {
  return allowedRoots;
}

// ---- Tool Registry ----
type ToolHandler = (args: any) => Promise<any> | any;
type ToolDef = { name: string; schema: any; handler: ToolHandler };

const toolsRegistry: ToolDef[] = [];
export function addTool(name: string, schema: any, handler: ToolHandler) {
  toolsRegistry.push({ name, schema, handler });
}

// ---- Cache global por 'path' resuelto ----
const globalCache: GlobalCache = new Map();

// ---- Servidor MCP ----
const server = new Server(
  { name: "SiteLens", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Registrar tools en nuestro propio registry
registerAllowedRootsTool(addTool, getAllowedRoots);
registerSitemapTool(addTool, getAllowedRoots);
registerLinkCheckTool(addTool, getAllowedRoots);
registerAssetBudgetTool(addTool, getAllowedRoots);
registerScanAccessibilityTool(addTool, getAllowedRoots, globalCache);
registerReportTool(addTool, getAllowedRoots, globalCache);

// ---- Schemas Zod para handlers estándar ----
const ToolsListSchema = z.object({
  method: z.literal("tools/list"),
  params: z
    .object({
      _meta: z.any().optional()
    })
    .passthrough()
    .optional()
});

const ToolsCallSchema = z.object({
  method: z.literal("tools/call"),
  params: z
    .object({
      name: z.string(),
      arguments: z.unknown().optional(),
      _meta: z.any().optional()
    })
    .passthrough()
});

// Implementar handlers MCP estándar (con schemas)
server.setRequestHandler(ToolsListSchema as any, async () => {
  return {
    tools: toolsRegistry.map((t) => ({
      name: t.name,
      description: "",
      inputSchema: t.schema ?? { type: "object", properties: {} }
    }))
  };
});

server.setRequestHandler(ToolsCallSchema as any, async (req) => {
  try {
    const name = (req as any)?.params?.name;
    const args = (req as any)?.params?.arguments ?? {};
    const tool = toolsRegistry.find((t) => t.name === name);
    if (!tool) {
      return { error: { code: -32000, message: `Tool no encontrada: ${name}` } };
    }
    const res = await tool.handler(args);
    return res;
  } catch (e: any) {
    return { error: { code: -32000, message: e?.message || "Error en tools/call" } };
  }
});


// Transporte STDIO
const transport = new StdioServerTransport();
await server.connect(transport);

// Logs
console.error(`[SiteLens] Iniciado con ${allowedRoots.length} root(s).`);

process.on("uncaughtException", (err) => {
  console.error("[SiteLens] uncaughtException:", err?.stack || err);
});
process.on("unhandledRejection", (err) => {
  console.error("[SiteLens] unhandledRejection:", err);
});
