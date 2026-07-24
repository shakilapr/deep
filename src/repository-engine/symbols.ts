// Phase 18 — Syntax/symbol index (regex-based TypeScript/JS extractor; tree-sitter-swappable)
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { FilesystemIndex } from "./index.js";
import { fileHash } from "./fs.js";

export type SymbolKind =
  | "function" | "class" | "method" | "interface" | "type" | "enum" | "const" | "import" | "export";

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  path: string;
  startLine: number;
  endLine: number;
  container?: string;
}

const DECL_RE = [
  { kind: "function" as const, re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/ },
  { kind: "class" as const, re: /^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)/ },
  { kind: "interface" as const, re: /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/ },
  { kind: "type" as const, re: /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)/ },
  { kind: "enum" as const, re: /^\s*(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/ },
  { kind: "const" as const, re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)/ },
];

const METHOD_RE = /^\s*([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/;
const IMPORT_RE = /^\s*import\s+(?:[\w*{}\n\r, ]+from\s+)?["']([^"']+)["']/;
const EXPORT_RE = /^\s*export\s+(?:\{[^}]*\}|default)/;

export class SymbolIndex {
  private symbols: SymbolEntry[] = [];
  private byFile = new Map<string, SymbolEntry[]>();
  private cache: Map<string, { hash: string; syms: SymbolEntry[] }> = new Map();
  private cachePath: string;

  constructor(
    private root: string,
    private index: FilesystemIndex,
    cacheFile = ".deep/index/symbols.json",
  ) {
    this.cachePath = join(root, cacheFile);
    this.loadCache();
  }

  private loadCache() {
    try {
      const raw = JSON.parse(readFileSync(this.cachePath, "utf8")) as Record<string, { hash: string; syms: SymbolEntry[] }>;
      for (const [k, v] of Object.entries(raw)) this.cache.set(k, v);
    } catch { /* ignore */ }
  }

  private saveCache() {
    mkdirSync(this.root, { recursive: true });
    writeFileSync(this.cachePath, JSON.stringify([...this.cache.entries()]));
  }

  update(): void {
    this.symbols = [];
    this.byFile.clear();
    for (const file of this.index.files()) {
      if (!["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(extname(file).slice(1))) continue;
      const full = join(this.root, file);
      if (!existsSync(full)) continue;
      const content = readFileSync(full, "utf8");
      const h = fileHash(content);
      const cached = this.cache.get(file);
      let syms: SymbolEntry[];
      if (cached && cached.hash === h) {
        syms = cached.syms;
      } else {
        syms = this.extract(file, content);
        this.cache.set(file, { hash: h, syms });
      }
      this.symbols.push(...syms);
      this.byFile.set(file, syms);
    }
    this.saveCache();
  }

  private extract(path: string, content: string): SymbolEntry[] {
    const lines = content.split("\n");
    const out: SymbolEntry[] = [];
    const starts: { idx: number; name: string; kind: SymbolKind; container?: string }[] = [];
    let container: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Track class/interface container scope loosely by indentation of block.
      for (const d of DECL_RE) {
        const m = d.re.exec(line);
        if (m) {
          starts.push({ idx: i, name: m[1]!, kind: d.kind, container: d.kind === "class" ? m[1]! : container });
          if (d.kind === "class" || d.kind === "interface") container = m[1]!;
          break;
        }
      }
      const mm = METHOD_RE.exec(line);
      if (mm && container) {
        starts.push({ idx: i, name: mm[1]!, kind: "method", container });
      }
      const imp = IMPORT_RE.exec(line);
      if (imp) starts.push({ idx: i, name: imp[1]!, kind: "import" });
      if (EXPORT_RE.test(line)) starts.push({ idx: i, name: "export", kind: "export" });
    }

    for (let s = 0; s < starts.length; s++) {
      const cur = starts[s]!;
      const next = starts[s + 1];
      const endLine = next ? next.idx - 1 : lines.length - 1;
      out.push({
        name: cur.name,
        kind: cur.kind,
        path,
        startLine: cur.idx + 1,
        endLine: cur.kind === "import" || cur.kind === "export" ? cur.idx + 1 : Math.max(cur.idx + 1, endLine),
        container: cur.container,
      });
    }
    return out;
  }

  // Phase 19 — Symbol query API
  search(query: string, fuzzy = true): SymbolEntry[] {
    const q = query.toLowerCase();
    const scored = this.symbols
      .map((s) => {
        const name = s.name.toLowerCase();
        let score = 0;
        if (name === q) score = 100;
        else if (name.startsWith(q)) score = 80;
        else if (fuzzy && name.includes(q)) score = 50;
        return { s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((x) => x.s);
  }

  get(name: string, path?: string): SymbolEntry | undefined {
    return this.symbols.find((s) => s.name === name && (!path || s.path === path));
  }

  symbolsInFile(path: string): SymbolEntry[] {
    return this.byFile.get(path) ?? [];
  }

  all(): SymbolEntry[] { return this.symbols; }

  /** Phase 42 — drop a file's symbols + cache entry so they are re-extracted on next update. */
  invalidateFile(path: string): void {
    this.symbols = this.symbols.filter((s) => s.path !== path);
    this.byFile.delete(path);
    this.cache.delete(path);
    this.saveCache();
  }
}
