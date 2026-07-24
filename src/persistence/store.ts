// Phase 04 — Persistence foundation (pure-TS atomic store; SQLite-swappable interface)
import { mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export interface Persistable {
  id: string;
  [key: string]: unknown;
}

interface StoreShape {
  version: number;
  migrations: string[];
  data: Record<string, Record<string, Persistable>>;
}

const CURRENT_VERSION = 1;

function emptyStore(): StoreShape {
  return {
    version: CURRENT_VERSION,
    migrations: [],
    data: { repositories: {}, sessions: {}, tasks: {}, research: {}, evidence: {}, index: {} },
  };
}

export class Store {
  private state: StoreShape;
  private path: string;
  private txn: StoreShape | null = null;

  constructor(path: string) {
    this.path = path;
    this.state = this.load();
  }

  private load(): StoreShape {
    try {
      if (!existsSync(this.path)) return emptyStore();
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as StoreShape;
      if (typeof parsed.version !== "number" || !parsed.data) return emptyStore();
      if (!parsed.migrations) parsed.migrations = [];
      return parsed;
    } catch {
      // Corruption: try backup, else start fresh.
      const backup = this.path + ".bak";
      if (existsSync(backup)) {
        try {
          copyFileSync(backup, this.path);
          return this.load();
        } catch {
          /* fall through */
        }
      }
      return emptyStore();
    }
  }

  private flush(state: StoreShape): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + ".tmp";
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, this.path);
    // Keep a recoverable backup.
    try { copyFileSync(this.path, this.path + ".bak"); } catch { /* non-fatal */ }
  }

  /** Idempotent migration runner. */
  migrate(ids: string[], apply: (id: string, store: StoreShape) => void): void {
    for (const id of ids) {
      if (this.state.migrations.includes(id)) continue;
      apply(id, this.state);
      this.state.migrations.push(id);
      this.flush(this.state);
    }
  }

  collection(name: string): Record<string, Persistable> {
    if (!this.state.data[name]) this.state.data[name] = {};
    return this.state.data[name]!;
  }

  put(collection: string, record: Persistable): void {
    const c = this.collection(collection);
    c[record.id] = record;
    this.flush(this.txn ?? this.state);
  }

  get(collection: string, id: string): Persistable | undefined {
    return this.collection(collection)[id];
  }

  all(collection: string): Persistable[] {
    return Object.values(this.collection(collection));
  }

  remove(collection: string, id: string): void {
    const c = this.collection(collection);
    delete c[id];
    this.flush(this.txn ?? this.state);
  }

  /** Transaction: mutations stage in a snapshot; commit or rollback. */
  begin(): void {
    this.txn = structuredClone(this.state);
  }

  commit(): void {
    if (!this.txn) return;
    this.flush(this.txn);
    this.state = this.txn;
    this.txn = null;
  }

  rollback(): void {
    this.txn = null;
  }

  snapshot(): StoreShape {
    return structuredClone(this.txn ?? this.state);
  }

  backup(): string {
    const dest = this.path + `.backup-${Date.now()}`;
    copyFileSync(this.path, dest);
    return dest;
  }
}

export interface DbLocations {
  global: string;
  project: (repoRoot: string) => string;
}

export function defaultDbLocations(): DbLocations {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return {
    global: join(home, ".deep", "global.json"),
    project: (repoRoot: string) => join(repoRoot, ".deep", "project.json"),
  };
}
