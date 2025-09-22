# Dependency Scanner & Gemini-Powered Analyzer

A tiny CLI that scans your TS/JS codebase for imports, builds a dependency graph, and (optionally) asks Google Gemini to generate a human-readable architecture report and a printable PDF.

It works by parsing files with the TypeScript compiler API and walking the AST to collect **imports**, **re-exports**, **dynamic imports**, **require()**, **import=** and **import type** statements.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [CLI Usage](#cli-usage)
- [Flags & Options](#flags--options)
- [Examples](#examples)
- [Output Formats](#output-formats)
- [How It Works](#how-it-works)
- [Environment & Requirements](#environment--requirements)
- [Limitations & Notes](#limitations--notes)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Fast scan** of `.ts`, `.tsx`, `.js`, `.jsx` with sensible ignore defaults (e.g., `node_modules`, `dist`, etc.).
- **Multiple output modes**: raw refs JSON, summarized counts, full dependency JSON, or Gemini-written Markdown analysis (with optional **PDF**).
- **Robust internal resolution**: resolves `./relative` imports, extension-less file paths, and `index.*` files.
- **Statistics**: file/import totals and package frequency.

---

## Quick Start

```bash
# 1) Install deps
npm install

# 2) Run directly with tsx (recommended during dev)
npx tsx src/index.ts ./src --summary
```

> The CLI is designed to be run with **tsx** (\`npx tsx src/index.ts ...\`). The output path in the usage string reflects that. You can also \`npm run build\` then invoke \`node dist/index.js ...\`.

---

## CLI Usage

```
npx tsx src/index.ts <file|dir> [...more]
  [--json]
  [--summary]
  [--include-dts]
  [--extensions .ts,.js,...]
  [--ignore dir,...]
  [--gemini]
  [--gemini-model "gemini-2.5-flash"]
  [--pdf <output.pdf>]
  [--max-output-tokens 65000]
```

> The banner above is printed by the CLI when no targets are provided.

You can pass **one or more** files/directories as targets. The tool will walk directories (respecting ignore lists) and scan eligible files.

---

## Flags & Options

- `--json`  
  Print **raw reference list** (per import occurrence). Each row includes: file, kind, from, detail, line, col.

- `--summary`  
  Print a **frequency table** of import specifiers (e.g., how many times a module is referenced). If \`--gemini\` is **not** set, the CLI exits after the summary. With \`--gemini\`, it continues to AI analysis.

- `--gemini`  
  Ask **Google Gemini** to analyze the dependency graph and generate a **single Markdown document** focused on:
  _Dependency Complexity, Tightly Coupled Modules, Circular Dependencies, Refactoring Recommendations._

- `--gemini-model <name>` (default: `gemini-2.5-flash`)  
  Choose the Gemini model.

- `--max-output-tokens <n>` (default: `65000`)  
  Bound for Gemini’s response length.

- `--pdf <path/to/report.pdf>`  
  After Gemini returns Markdown, render it to a **PDF** (A4) with GitHub-like styling using **Puppeteer**.  
  Notes:
  - Requires `--gemini`. Without it, the CLI prints: _“PDF File can't be outputted without Gemini!”_.  
  - If you pass `--gemini` but omit `--pdf`, it warns: _“PDF file will not be downloaded. Please, add output directory!”_.  
  - PDF rendering uses `markdown-it` + `github-markdown-css` + `puppeteer`.

- `--extensions .ts,.tsx,.js,.jsx`  
  Override which file extensions to include. Defaults to the set above.

- `--ignore dir1,dir2,...`  
  Extra directories to ignore in addition to the defaults:  
  `node_modules, .git, dist, build, out, .next, .cache`.
  
- `--include-dts`  
  Include `.d.ts` files (excluded by default).

---

## Examples

### 1) Print a summary (top referenced modules)
```bash
npx tsx src/index.ts ./src --summary
```
```
Outputs a list like:
   42  react
   18  ./utils/fileSource
   10  typescript
    3  fs
```

---

### 2) Print raw references as JSON
```bash
npx tsx src/index.ts ./src --json
```
Each entry has file, kind (e.g., `import`, `reexport`, `dynamic-import`, `require`, `import-equals`, `import-type`), module specifier, and position.

---

### 3) Full dependency JSON (no Gemini)
```
npx tsx src/index.ts ./packages/app
```
When **not** using `--json`, `--summary`, or `--gemini`, the tool prints the **dependency JSON** (see schema below).

---

### 4) Gemini Markdown analysis (console only)
```bash
GEMINI_API_KEY=xxxxxxxxxxxxxxxx npx tsx src/index.ts ./src --gemini
```
Emits a **single Markdown report** to stdout (no PDFs).

---

### 5) Gemini analysis + PDF export
```bash
export GEMINI_API_KEY=xxxxxxxxxxxxxxxx or add in .env
npx tsx src/index.ts ./src --gemini --pdf ./reports/analysis.pdf
```
- Writes Gemini’s Markdown to stdout  
- Also saves a **styled PDF** to `./reports/analysis.pdf`.

---

### 6) Include \`.d.ts\`, custom extensions, and extra ignores
```bash
npx tsx src/index.ts ./ --include-dts   --extensions .ts,.tsx   --ignore e2e,playground,tmp
```
Fine-tune scan scope. Defaults already include the common TS/JS extensions and ignore dirs.

---

## Output Formats

### A) Raw reference list (\`--json\`)
An array of occurrences. Example shape:
```json
[
  {
    "file": "src/index.ts",
    "kind": "import",
    "from": "typescript",
    "detail": "named:{...}",
    "line": 1,
    "col": 1
  }
]
```
Produced straight from AST scanning.

---

### B) Dependency JSON (default without \`--json\`/\`--summary\`/\`--gemini\`)
```json
{
  "projectRoot": ".",
  "files": [
    {
      "file": "src/index.ts",
      "imports": [
        {
          "kind": "import",
          "specifier": "typescript",
          "category": "external",
          "line": 5,
          "col": 1
        },
        {
          "kind": "import",
          "specifier": "./utils/fileSource",
          "category": "internal",
          "resolved": "src/utils/fileSource.ts",
          "line": 20,
          "col": 1
        }
      ]
    }
  ],
  "edges": {
    "internal": [["src/index.ts","src/utils/fileSource.ts"]],
    "external": [["src/index.ts","typescript"]],
    "unresolvedInternal": []
  },
  "stats": {
    "fileCount": 1,
    "importCount": 2,
    "internalCount": 1,
    "externalCount": 1,
    "unresolvedInternalCount": 0,
    "packageFrequency": { "typescript": 1 }
  }
}
```

---

### C) Summary table (`--summary`)
A simple text histogram of how often each specifier appears (descending). If you also pass `--gemini`, the tool prints the summary **then** proceeds to the AI report.

---

### D) Gemini Markdown report (`--gemini`)
A single Markdown document focusing on:
- **Dependency Complexity**
- **Tightly Coupled Modules**
- **Circular Dependencies**
- **Refactoring Recommendations**  

Optionally render this Markdown to PDF with `--pdf`.

---

## How It Works

1. **Discover files**  
   Recursively walk directories, honoring default ignore dirs and extension filters. Optional inclusion of `.d.ts`.

2. **Parse & collect refs**  
   Parse each file via TypeScript, traverse the AST, and collect:  
   `import`, `export ... from`, `import()`, `require()`, `import = require`, and `import type`. For each, record file, specifier, detail, and line/column.

3. **Resolve internals & build graph**  
   For relative specifiers, try to resolve `foo`, `foo.ts/.tsx/.js/.jsx`, or `foo/index.*` as applicable. Track internal/external edges and unresolved. Compute stats and package frequency.

4. **Choose output mode**  
   - `--json`: dump raw refs  
   - `--summary`: print table (optionally continue to Gemini)  
   - default: print dependency JSON  
   - `--gemini`: ask Gemini for a Markdown report (optionally `--pdf <path/to/report.pdf>`)  
   PDF is produced only when Gemini runs; otherwise it’s disallowed.

---

## Environment & Requirements

- **Node.js** 22+ recommended.  
- **Dependencies**: `@google/genai`, `dotenv`, `markdown-it`, `github-markdown-css`, `puppeteer`. Installed via `npm install`.  
- **TypeScript** is used to build (see `npm run build`).  
- **Gemini** features require `GEMINI_API_KEY` env var (e.g., `.env` file is loaded automatically).

---

## Limitations & Notes

- **Supported languages**: `.ts`, `.tsx`, `.js`, `.jsx` (configurable via `--extensions`).  
- **Internal resolution** does not execute code; it’s purely static and heuristic (`<path>`, `<path>.<ext>`, `<path>/index.<ext>`). Some complex resolvers/aliases (e.g., webpack/tsconfig paths) are not applied.  
- **PDF generation** requires headless Chromium via Puppeteer; some environments may need extra flags or dependencies.  
- **Gemini output** is Markdown only by design (the prompt forbids JSON).

---

## Troubleshooting

- **“Usage: npx tsx src/index.ts …” shows and exits**  
  You didn’t pass any targets. Provide at least one file or directory.

- **“No files found. Check your extensions!”**  
  Your filters excluded everything; try `--extensions .ts,.tsx` or point at the correct folder.

- **“No imports found.”**  
  The scanner didn’t detect any recognized import kinds. Confirm your code has imports/exports the tool understands.

- **“PDF File can't be outputted without Gemini!”**  
  Add `--gemini` or remove `--pdf`.

- **Gemini analysis fails**  
  Ensure `GEMINI_API_KEY` is set and the chosen `--gemini-model` is available to your key. The CLI will print the error message it received.

---

## Reference: Import Kinds

These are the recognized `RefKind` values collected during scanning:  
`"import" | "reexport" | "dynamic-import" | "require" | "import-equals" | "import-type"`.

---

## Scripts

```json
{
  "scripts": {
    "build": "tsc"
  }
}
```
Run `npm run build` to emit `dist/index.js`, then invoke with `node dist/index.js ...`.

---

Happy scanning!
