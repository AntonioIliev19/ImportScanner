import { Ref } from "../interfaces/reference";
import { DependencyJSON } from "../models/DependencyJSON";

const pkgName = (s: string) =>
  s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0];

export function buildDependencyJSON(
  allRefs: Ref[],
  toRel: (abs: string) => string,
  tryResolve: (fromAbs: string, spec: string) => string | null,
  projectRoot: string,
): DependencyJSON {
  const byFile = new Map<string, Ref[]>();
  for (const ref of allRefs) {
    const arr = byFile.get(ref.file) || [];
    arr.push(ref);
    byFile.set(ref.file, arr);
  }

  const files: DependencyJSON["files"] = [];
  const edgesInternal: Array<[string, string]> = [];
  const edgesExternal: Array<[string, string]> = [];
  const unresolvedInternal: Array<[string, string]> = [];
  const pkgFreq = new Map<string, number>();

  for (const [absFile, refs] of byFile.entries()) {
    const relFile = toRel(absFile);
    const imports = refs.map((r) => {
      if (r.from.startsWith(".")) {
        const resolvedAbs = tryResolve(absFile, r.from);
        if (resolvedAbs) {
          const toRelFile = toRel(resolvedAbs);
          edgesInternal.push([relFile, toRelFile]);
          return {
            kind: r.kind,
            specifier: r.from,
            category: "internal" as const,
            resolved: toRelFile,
            line: r.pos.line,
            col: r.pos.col,
          };
        } else {
          unresolvedInternal.push([relFile, r.from]);
          return {
            kind: r.kind,
            specifier: r.from,
            category: "internal" as const,
            line: r.pos.line,
            col: r.pos.col,
          };
        }
      } else {
        const p = pkgName(r.from);
        edgesExternal.push([relFile, p]);
        pkgFreq.set(p, (pkgFreq.get(p) ?? 0) + 1);
        return {
          kind: r.kind,
          specifier: r.from,
          category: "external" as const,
          line: r.pos.line,
          col: r.pos.col,
        };
      }
    });

    files.push({ file: relFile, imports });
  }

  return {
    projectRoot: projectRoot,
    files,
    edges: {
      internal: edgesInternal,
      external: edgesExternal,
      unresolvedInternal,
    },
    stats: {
      fileCount: files.length,
      importCount: allRefs.length,
      internalCount: edgesInternal.length + unresolvedInternal.length,
      externalCount: edgesExternal.length,
      unresolvedInternalCount: unresolvedInternal.length,
      packageFrequency: Object.fromEntries(
        [...pkgFreq.entries()].sort((a, b) => b[1] - a[1]),
      ),
    },
  };
}
