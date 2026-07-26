// Repository engine facade (aggregates index, search, symbols, snapshot, git)
import { readFileSync } from "node:fs";
import { FilesystemIndex } from "./index.js";
import { LexicalSearch } from "./search.js";
import { SymbolIndex } from "./symbols.js";
import { SnapshotService, RepositorySnapshot } from "./snapshot.js";
import { GitIntegration, GitStatus } from "./git.js";
import { DependencyGraph } from "./graph.js";
import type { LspReferenceProvider } from "./lsp.js";

export interface RepoConfig {
  ignore?: string[];
  generatedPatterns?: string[];
  vendoredPatterns?: string[];
  lsp?: { enabled?: boolean };
}

export class RepositoryEngine {
  readonly index: FilesystemIndex;
  readonly search: LexicalSearch;
  readonly symbols: SymbolIndex;
  readonly snapshots: SnapshotService;
  readonly git: GitIntegration;
  /** Optional LSP provider (opt-in). When set, reference lookups prefer it. */
  lsp?: LspReferenceProvider;

  constructor(
    public root: string,
    cfg: RepoConfig = {},
  ) {
    const ignore = cfg.ignore ?? ["node_modules", "dist", "build", ".git", ".deep", "references"];
    const gen = cfg.generatedPatterns ?? ["**/*.gen.ts", "**/*.generated.*"];
    const ven = cfg.vendoredPatterns ?? ["**/vendor/**", "**/third_party/**"];
    this.index = new FilesystemIndex(root, ignore, gen, ven);
    this.search = new LexicalSearch(root, this.index, ignore);
    this.symbols = new SymbolIndex(root, this.index);
    this.snapshots = new SnapshotService(root);
    this.git = new GitIntegration(root);
  }

  /** Incremental update of index + symbols. */
  refresh(): string[] {
    const changed = this.index.update();
    this.symbols.update();
    return changed;
  }

  overview(): { files: number; symbols: number; git: GitStatus } {
    return {
      files: this.index.files().length,
      symbols: this.symbols.all().length,
      git: this.git.status(),
    };
  }

  createSnapshot(): RepositorySnapshot {
    return this.snapshots.create();
  }

  /** All callers/importers of a symbol (or every symbol in a file). */
  findReferences(symbol?: string, file?: string): { path: string; startLine: number; endLine: number; symbol?: string }[] {
    const g = new DependencyGraph(this).build();
    const edges = symbol ? g.getCallers(symbol, file) : [];
    return edges.map((e) => ({
      path: e.toFile ?? file ?? "",
      startLine: e.toLine ?? 0,
      endLine: e.toLine ?? 0,
      symbol: e.to,
    }));
  }

  /** Declarations across the repo that share a name (heuristic implementors). */
  findImplementations(symbol: string): { path: string; startLine: number; endLine: number }[] {
    return this.symbols
      .all()
      .filter((s) => s.name === symbol)
      .map((s) => ({ path: s.path, startLine: s.startLine, endLine: s.endLine }));
  }

  /** Git blame for a path (optional single line). */
  getBlame(path: string, line?: number): string {
    return this.git.blame(path, line);
  }

  /**
   * LSP-accurate references for a symbol, when an LSP provider is configured.
   * Falls back to [] (callers then use the graph-based `findReferences`).
   */
  async findReferencesLsp(symbol: string, file?: string): Promise<{ path: string; startLine: number; endLine: number; symbol?: string }[]> {
    if (!this.lsp || !this.lsp.available) return [];
    const sym = file ? this.symbols.get(symbol, file) : this.symbols.get(symbol);
    if (!sym) return [];
    const col = columnOfSafe(sym.path, sym.startLine, sym.name);
    const refs = await this.lsp.findReferences(sym.path, sym.startLine, col);
    return refs.map((r) => ({ path: r.path, startLine: r.startLine, endLine: r.endLine, symbol }));
  }
}

function columnOfSafe(path: string, line: number, symbol: string): number {
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    const text = lines[line - 1] ?? "";
    const idx = text.indexOf(symbol);
    return idx >= 0 ? idx + 1 : 1;
  } catch {
    return 1;
  }
}
