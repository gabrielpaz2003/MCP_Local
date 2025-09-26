# SiteLens — Servidor MCP local (STDIO) para auditoría de HTML estático

SiteLens es un **servidor MCP local por STDIO** (protocolo 2024-11-05) escrito en Node/TypeScript que audita **carpetas con HTML estático sin red**. Implementa reglas **WCAG‑lite**, verificador de enlaces internos, **presupuesto de assets**, **sitemap** basado en FS y un **reporte consolidado** con *quick wins*.

---

## ✅ Características

- Transporte **STDIO** (para hosts MCP locales).
- **Whitelist de raíces**: acceso solo a rutas permitidas (`--roots` o env `ALLOWED_ROOTS`).
- **Sin llamadas de red**: enlaces externos se marcan como `external:true` y `status:"skipped"`.
- Reglas WCAG‑lite (heurísticas, sin render):
  - `img-alt` (alt ausente o vacío).
  - `form-labels` (labels asociados a controles).
  - `landmarks` (main/nav/header/footer/aside o roles equivalentes).
  - `headings-order` (saltos lógicos de Hx).
  - `contrast` (cálculo simplificado para estilos inline `color`/`background`).
- **Link checker local** (solo rutas dentro de roots).
- **Asset budget** (agregados por tipo, top pesados, sobre presupuesto).
- **Sitemap** (árbol JSON de archivos/carpetas).
- **Reporte consolidado** con `ranking (0–100)` y `quickWins`.

---

## 📦 Estructura esperada

```
sitelens/
├─ package.json
├─ tsconfig.json
└─ src/
   ├─ server.ts          # handshake MCP + router (tools/list, tools/call) con registry interno
   ├─ paths.ts           # normalización/verificación de roots
   ├─ html.ts            # utilidades de parseo HTML (node-html-parser)
   ├─ metrics.ts         # reglas WCAG-lite + agregados
   └─ tools/
      ├─ allowed_roots.ts
      ├─ sitemap.ts
      ├─ link_check.ts
      ├─ asset_budget.ts
      ├─ scan_accessibility.ts
      └─ report.ts
```

> **Nota:** El proyecto usa un **registry propio** para las tools y maneja `tools/list` y `tools/call` manualmente. No depende de `server.tool/addTool` del SDK.

---

## 🛠 Dependencias clave

- `@modelcontextprotocol/sdk`
- `node-html-parser`
- `fast-glob`
- `yargs`
- (dev) `typescript`, `tsx`, `@types/node`

---

## 🔐 Seguridad

- Las rutas se normalizan con `path.resolve`, se unifican separadores y se bloquea cualquier acceso fuera de **roots**.
- Entradas validadas (límites: p. ej. `maxDepth ≤ 20`).  
- **Error estándar** para denegaciones o entradas inválidas:
  ```json
  { "error": { "code": -32000, "message": "..." } }
  ```

---

## ▶️ Build & Run

```powershell
# 1) Instalar
npm i

# 2) Compilar
npm run build

# 3) Ejecutar (definiendo roots)
node dist/server.js --roots "C:/ABS/SITIO;C:/ABS/OTRO"
#  ó usando variable:
$env:ALLOWED_ROOTS = "C:/ABS/SITIO;C:/ABS/OTRO"; node dist/server.js
```

### Integración en `mcp_config.json` del host

```json
{
  "servers": [
    {
      "name": "SiteLens",
      "transport": "stdio",
      "command": "node",
      "args": ["C:/ruta/a/sitelens/dist/server.js", "--roots", "C:/ABS/MI_SITIO;C:/ABS/OTRA_CARPETA"]
    }
  ]
}
```

---

## 🧪 Smoke tests (desde el host)

```
:call SiteLens aa.allowed_roots {}
:call SiteLens aa.sitemap {"path":"."}
:call SiteLens aa.link_check {"path":"."}
:call SiteLens aa.asset_budget {"path":".","budgetKB":200}
:call SiteLens aa.scan_accessibility {"path":"."}
:call SiteLens aa.report {"path":".","top":10}
```

---

## 🧰 Tools y esquemas

### `aa.allowed_roots` → `{}`
- **Salida**: `structuredContent.result: string[]`

### `aa.sitemap` → `{ "path": string, "includeHtmlOnly?: boolean", "maxDepth?: number }`
- **Salida**: `structuredContent.result: { path, type: "dir"|"file", children?: [...] }`

### `aa.link_check` → `{ "path": string, "entry?: string", "extensions?: string[]" }`
- **Salida**: `structuredContent.result: Array<{file, link, ok, external?, status:"ok"|"missing"|"skipped"}>`

### `aa.asset_budget` → `{ "path": string, "patterns?: string[]", "budgetKB?: number }`
- **Salida**:
  ```json
  {
    "structuredContent": {
      "result": {
        "summary": { "totalKB": number, "byType": { "<ext>": number } },
        "topHeavy": [{ "file": string, "sizeKB": number }],
        "overBudget": [{ "file": string, "sizeKB": number, "budgetKB": number }]
      }
    }
  }
  ```

### `aa.scan_accessibility` → `{ "path": string, "include?: string[]", "exclude?: string[]" }`
- **Salida**: `structuredContent.result: Array<{ file, issues: [...], summary:{countsBySeverity} }>`  
- Reglas: `img-alt`, `form-labels`, `landmarks`, `headings-order`, `contrast`, y `parse-error` si aplica.

### `aa.report` → `{ "path": string, "weights?: { a11y?:number, links?:number, performance?:number }, "top?: number }`
- **Salida**:
  ```json
  {
    "structuredContent": {
      "result": {
        "ranking": [{ "file": string, "score": number }],
        "quickWins": [{ "file": string, "rule": string, "message": string }]
      }
    },
    "content": [{ "type": "text", "text": "Resumen..." }]
  }
  ```

> **Importante:** `aa.report` usa resultados en memoria de `scan_accessibility`, `link_check` y `asset_budget`. Ejecuta esas tools primero en la misma sesión de proceso.

---

## 🧯 Troubleshooting

- **EJSONPARSE / `package.json` inválido** → recrear `package.json` válido y reinstalar.
- **Acceso fuera de roots (`-32000`)** → revisar `--roots`/`ALLOWED_ROOTS` y `path` usado en las llamadas.
- **Windows paths** → usar `/` en JSON/args (`C:/...`) para evitar escapes.
- **Sin datos en reporte** → ejecutar primero las tools base.

---

## 📋 Política de respuestas

- Respuestas tabulables:
  ```json
  { "structuredContent": { "result": <lista o dict> } }
  ```
- Texto libre adicional:
  ```json
  { "content": [{ "type":"text", "text":"..." }] }
  ```
- Errores/denegaciones:
  ```json
  { "error": { "code": -32000, "message": "..." } }
  ```
