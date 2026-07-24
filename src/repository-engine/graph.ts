// Phase 39 — Dependency graph (import + heuristic call edges)
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import type { RepositoryEngine } from "./engine.js";
import type { SymbolEntry } from "./symbols.js";

export type EdgeKind = "import" | "export" | "call";
export type Confidence = "strong" | "weak";

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  confidence: Confidence;
  symbol?: string;
}

const CALL_RE = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;

export class DependencyGraph {
  private allEdges: GraphEdge[] = [];
  // NOTE: single snapshot; incremental update is future work.

  constructor(private engine: RepositoryEngine) {}

  build(): this {
    this.allEdges = [];
    const symbols = this.engine.symbols.all();
    const files = this.engine.index.files();

    // Map declared (non-import/export) symbols by name for call resolution.
    const declByName = new Map<string, SymbolEntry[]>();
    for (const s of symbols) {
      if (s.kind === "import" || s.kind === "export") continue;
      const arr = declByName.get(s.name) ?? [];
      arr.push(s);
      declByName.set(s.name, arr);
    }

    // Import + export edges.
    for (const file of files) {
      for (const sym of this.engine.symbols.symbolsInFile(file)) {
        if (sym.kind !== "import") continue;
        const resolved = this.resolveModule(file, sym.name);
        if (resolved) {
          this.allEdges.push({ from: file, to: resolved, kind: "import", confidence: "strong" });
          // Export edges: resolved file exports symbols consumed here.
          for (const exp of this.engine.symbols.symbolsInFile(resolved)) {
            if (exp.kind === "export" || exp.kind === "import") continue;
            this.allEdges.push({
              from: resolved,
              to: file,
              kind: "export",
              confidence: "strong",
              symbol: exp.name,
            });
          }
        }
      }
    }

    // Call edges (heuristic, weak).
    for (const file of files) {
      const full = join(this.engine.root, file);
      if (!existsSync(full)) continue;
      let content: string;
      try { content = readFileSync(full, "utf8"); } catch { continue; }
      const lines = content.split("\n");
      for (const sym of this.engine.symbols.symbolsInFile(file)) {
        if (sym.kind === "import" || sym.kind === "export") continue;
        const body = lines.slice(sym.startLine - 1, sym.endLine).join("\n");
        CALL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        const seen = new Set<string>();
        while ((m = CALL_RE.exec(body))) {
          const callee = m[1]!;
          if (callee === sym.name) continue;
          if (seen.has(callee)) continue;
          if (!declByName.has(callee)) continue;
          seen.add(callee);
          this.allEdges.push({
            from: sym.name,
            to: callee,
            kind: "call",
            confidence: "weak",
            symbol: sym.name,
          });
        }
      }
    }
    return this;
  }

  private resolveModule(fromFile: string, spec: string): string | undefined {
    if (!spec.startsWith(".")) return undefined; // external module
    const baseDir = dirname(join(this.engine.root, fromFile));
    const cleaned = spec.replace(/\.js$/, "");
    const candidates = [
      cleaned + ".ts",
      cleaned + ".tsx",
      cleaned + ".js",
      cleaned + ".jsx",
      cleaned + ".mjs",
      cleaned + ".cjs",
      join(cleaned, "index.ts"),
      join(cleaned, "index.js"),
      cleaned,
    ];
    for (const c of candidates) {
      const abs = resolve(baseDir, c);
      if (existsSync(abs)) {
        return relative(this.engine.root, abs).replace(/\\/g, "/");
      }
    }
    return undefined;
  }

  edges(): GraphEdge[] {
    return this.allEdges;
  }

  getCallers(symbolName: string): GraphEdge[] {
    return this.allEdges.filter((e) => e.kind === "call" && e.to === symbolName);
  }

  getCallees(symbolName: string): GraphEdge[] {
    return this.allEdges.filter((e) => e.kind === "call" && e.from === symbolName);
  }

  /** Files that this file imports (its dependencies). */
  getDependents(file: string): string[] {
    return [
      ...new Set(
        this.allEdges
          .filter((e) => e.kind === "import" && e.from === file)
          .map((e) => e.to),
      ),
    ];
  }

  /** Files that import the given file. */
  getImporters(file: string): string[] {
    return [
      ...new Set(
        this.allEdges
          .filter((e) => e.kind === "import" && e.to === file)
          .map((e) => e.from),
      ),
    ];
  }

  /** Phase 42 — drop all edges touching a changed file so they are rebuilt on next build(). */
  invalidateFile(file: string): void {
    this.allEdges = this.allEdges.filter((e) => e.from !== file && e.to !== file);
  }
}
