import { readFileSync } from "fs";
import { relative, resolve as pathResolve, dirname } from "node:path";

import ts, { SourceFile } from "typescript";
import * as dotenv from "dotenv";
dotenv.config();

import { Ref } from "./interfaces/reference";
import { RefKind } from "./models/RefKind";
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_IGNORE_DIRS,
  isDir,
  isFile,
  tryResolveInternal,
  walkDir,
} from "./utils/fileSource";
import { buildDependencyJSON } from "./utils/deps";
import { analyzeWithGemini } from "./ai/gemini";
import { markdownToPDF } from "./utils/markdownToPDF";
import { mkdir } from "node:fs/promises";

export function scanFile(fileName: string): Ref[] {
  const sourceText: string = readFileSync(fileName, "utf8");
  const sourceFile: SourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const refs: Omit<Ref, "file">[] = [];

  const add = (kind: RefKind, from: string, node: ts.Node, detail?: string) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    refs.push({
      kind,
      from,
      detail,
      pos: { line: line + 1, col: character + 1 },
    });
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const from = node.moduleSpecifier.text;
      const importClause = node.importClause;
      let detail = "side-effect";

      if (importClause) {
        const bits: string[] = [];
        if (importClause.phaseModifier) bits.push("type");
        if (importClause.name)
          bits.push(`default:${importClause.name.getText(sourceFile)}`);
        const nb = importClause.namedBindings;

        if (nb) {
          if (ts.isNamespaceImport(nb))
            bits.push(`namespace:${nb.name.getText(sourceFile)}`);
          else if (ts.isNamedImports(nb)) {
            const elements = nb.elements.map(
              (e) =>
                (e.isTypeOnly ? "type " : "") +
                (e.propertyName
                  ? `${e.propertyName.getText(sourceFile)} as ${e.name.getText(sourceFile)}`
                  : e.name.getText(sourceFile)),
            );
            bits.push(`named:{${elements.join(", ")}}`);
          }
        }
        detail = bits.join(" ");
      }
      add("import", from, node, detail);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const from = node.moduleSpecifier.text;
      const named =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? `{${node.exportClause.elements
              .map((e) =>
                e.propertyName
                  ? `${e.propertyName.getText(sourceFile)} as ${e.name.getText(sourceFile)}`
                  : e.name.getText(sourceFile),
              )
              .join(", ")}}`
          : "*";
      add("reexport", from, node, named);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];

      if (arg && ts.isStringLiteralLike(arg))
        add("dynamic-import", arg.text, node);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      const arg = node.arguments[0];

      if (arg && ts.isStringLiteralLike(arg)) add("require", arg.text, node);
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression;

      if (expression && ts.isStringLiteralLike(expression))
        add(
          "import-equals",
          expression.text,
          node,
          node.name.getText(sourceFile),
        );
    }

    if (
      ts.isImportTypeNode(node) &&
      node.argument &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      add("import-type", node.argument.literal.text, node);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return refs.map((ref) => ({ file: fileName, ...ref }));
}

function pargeArgs(args: string[]) {
  const flags = new Set(args.filter((a) => a.startsWith("--")));

  const pos = args.filter((a) => !a.startsWith("--"));

  const value = (name: string, fallBack?: string) => {
    const idx = args.findIndex((a) => a === name);
    return idx >= 0 ? args[idx + 1] : fallBack;
  };

  const list = (name: string) =>
    (value(name) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    targets: pos,
    json: flags.has("--json"),
    summary: flags.has("--summary"),
    includeDts: flags.has("--include-dts"),
    extensions: list("--extensions"),
    ignore: list("--ignore"),
    gemini: flags.has("--gemini"),
    geminiModel: value("--gemini-model", "gemini-2.5-flash")!,
    maxOutputTokens: Number(value("--max-output-tokens", "65000")),
    pdfOut: value("--pdf"),
    cwd: process.cwd(),
  };
}

function toRelative(cwd: string, abs: string) {
  const rel = relative(cwd, abs);
  return rel.length ? rel : abs;
}

async function main() {
  const [, , ...rest] = process.argv;
  const {
    targets,
    json,
    summary,
    includeDts,
    extensions,
    ignore,
    gemini,
    geminiModel,
    maxOutputTokens,
    pdfOut,
    cwd,
  } = pargeArgs(rest);

  if (targets.length === 0) {
    console.error(
      `Usage: tsx src/index.ts <file|dir> [...more] 
        [--json] 
        [--summary] 
        [--include-dts] 
        [--extensions .ts,.js,...] 
        [--ignore dir,...] 
        [--gemini]  
        [--gemini-model "gemini-2.5-flash"]
        [--pdf <output.pdf>] 
        [--max-output-tokens 65000]`,
    );
    process.exit(1);
  }

  const includeExtensions = extensions.length
    ? new Set(extensions)
    : DEFAULT_EXTENSIONS;
  const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...ignore]);
  const files = targets.flatMap((t) =>
    isDir(t)
      ? walkDir(t, { ignoreDirs, includeExtensions, includeDts })
      : isFile(t)
        ? [t]
        : [],
  );

  if (files.length === 0) {
    console.log("No files found. Check your extensions!");
    return;
  }

  const allRefs: Ref[] = [];
  for (const file of files) {
    try {
      allRefs.push(...scanFile(pathResolve(file)));
    } catch (err) {
      console.error(`Failed to scan ${file}:`, (err as Error).message);
    }
  }

  if (allRefs.length === 0) {
    console.log("No imports found.");
    return;
  }

  if (json) {
    console.log(
      JSON.stringify(
        allRefs.map((ref) => ({
          file: toRelative(cwd, ref.file),
          kind: ref.kind,
          from: ref.from,
          detail: ref.detail,
          line: ref.pos.line,
          col: ref.pos.col,
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (summary) {
    const counts = new Map<string, number>();
    for (const ref of allRefs)
      counts.set(ref.from, (counts.get(ref.from) ?? 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [mod, count] of rows) {
      console.log(`${count.toString().padStart(5)}  ${mod}`);
    }
    if (!gemini) return;
  }

  const depJson = buildDependencyJSON(
    allRefs,
    (abs) => toRelative(cwd, abs),
    (fromAbs, spec) => tryResolveInternal(fromAbs, spec),
    toRelative(cwd, cwd),
  );

  if (gemini) {
    try {
      const text = await analyzeWithGemini(
        depJson,
        geminiModel,
        Number.isFinite(maxOutputTokens) ? maxOutputTokens : undefined,
      );

      console.log(text);

      if (pdfOut) {
        try {
          await mkdir(dirname(pdfOut), { recursive: true });
          await markdownToPDF(text, pdfOut);
          console.log(`PDF Written to: ${pathResolve(pdfOut)}`);
        } catch (e) {
          console.error("PDF Generation Failed:", (e as Error).message);
        }
      } else if (pdfOut === undefined) {
        console.log(
          "PDF file will not be downloaded. Please, add output directory!",
        );
      }
    } catch (e) {
      console.error("Gemini analysis failed:", (e as Error).message);
    }
  } else {
    if (pdfOut) {
      console.error("PDF File can't be outputted without Gemini!");
      return;
    }
    console.log(JSON.stringify(depJson, null, 2));
  }
}

if (require.main === module) {
  (async () => {
    await main();
  })();
}
