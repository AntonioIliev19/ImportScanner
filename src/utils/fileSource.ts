import { readdirSync, statSync } from "fs";
import { dirname, extname, join, resolve as pathResolve } from "node:path";

export const DEFAULT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".cache",
]);

export const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const RESOLVE_INDEXES = RESOLVE_EXTENSIONS.map((e) => `/index${e}`);

export function walkDir(
  root: string,
  options?: {
    ignoreDirs?: Set<string>;
    includeExtensions?: Set<string>;
    includeDts?: boolean;
  },
): string[] {
  const ignore = options?.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const extensions = options?.includeExtensions ?? DEFAULT_EXTENSIONS;
  const includeDts = options?.includeDts;

  const files: string[] = [];
  const recur = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (ignore.has(entry)) continue;
        recur(full);
      } else if (s.isFile()) {
        const extension = extname(entry).toLowerCase();
        if (!extensions.has(extension)) continue;
        if (!includeDts && entry.endsWith(".d.ts")) continue;
        files.push(full);
      }
    }
  };
  recur(root);
  return files;
}

export function tryResolveInternal(
  fromFileAbs: string,
  spec: string,
): string | null {
  if (!spec.startsWith(".")) return null;
  const baseDir = dirname(fromFileAbs);
  const abs = pathResolve(baseDir, spec);

  if (isFile(abs)) return abs;

  for (const e of RESOLVE_EXTENSIONS) if (isFile(abs + e)) return abs + e;

  if (isDir(abs))
    for (const idx of RESOLVE_INDEXES) if (isFile(abs + idx)) return abs + idx;
  return null;
}

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
