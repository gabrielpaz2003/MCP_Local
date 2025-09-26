import path from "node:path";
import fs from "node:fs";

export function splitRoots(input?: string): string[] {
  const raw =
    input?.trim() ||
    process.env.ALLOWED_ROOTS?.trim() ||
    "";
  if (!raw) return [];
  return raw
    .split(";")
    .map((p) => normalizePath(p))
    .filter((p) => !!p);
}

export function normalizePath(p: string): string {
  // Normaliza Windows/Posix, elimina .. y dobles separadores
  let abs = path.resolve(p);
  // Normaliza barras
  abs = abs.replace(/[/\\]+/g, path.sep);
  return abs;
}

export function pathExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function isInside(child: string, root: string): boolean {
  const rel = path.relative(root, child);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function isPathInsideAnyRoot(candidate: string, roots: string[]): boolean {
  const p = normalizePath(candidate);
  return roots.some((r) => {
    const rr = normalizePath(r);
    if (p === rr) return true;
    return isInside(p, rr);
  });
}

/**
 * Resuelve un path "path" contra roots permitidos.
 * Reglas:
 * - Si "path" es absoluto, debe estar dentro de alguno de los roots.
 * - Si es relativo (incl. "."), se intenta resolver contra cada root en orden y el primero que exista se usa.
 * - Si no existe en ningún root, error.
 */
export function resolvePathWithinRoots(inputPath: string, roots: string[]): string {
  if (!inputPath) throw new Error("Ruta vacía");
  const np = normalizePath(inputPath);

  // Absoluto: verificar whitelist
  if (path.isAbsolute(np)) {
    if (!isPathInsideAnyRoot(np, roots)) {
      throw new Error(`Acceso denegado: "${np}" está fuera de las roots permitidas.`);
    }
    if (!pathExists(np)) {
      throw new Error(`Ruta no encontrada: "${np}"`);
    }
    return np;
  }

  // Relativo: probar contra cada root
  for (const root of roots) {
    const candidate = normalizePath(path.join(root, np));
    if (isPathInsideAnyRoot(candidate, [root]) && pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Ruta relativa "${inputPath}" no existe dentro de las roots.`);
}

export function assertInRootsOrThrow(p: string, roots: string[]) {
  const np = normalizePath(p);
  if (!isPathInsideAnyRoot(np, roots)) {
    throw new Error(`Acceso denegado: "${p}" está fuera de las roots permitidas.`);
  }
}
