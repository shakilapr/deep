// Repository engine facade (aggregates index, search, symbols, snapshot, git)
import { FilesystemIndex } from "./index.js";
import { LexicalSearch } from "./search.js";
import { SymbolIndex } from "./symbols.js";
import { SnapshotService, RepositorySnapshot } from "./snapshot.js";
import { GitIntegration, GitStatus } from "./git.js";

export interface RepoConfig {
  ignore?: string[];
  generatedPatterns?: string[];
  vendoredPatterns?: string[];
}

export class RepositoryEngine {
  readonly index: FilesystemIndex;
  readonly search: LexicalSearch;
  readonly symbols: SymbolIndex;
  readonly snapshots: SnapshotService;
  readonly git: GitIntegration;

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
}
