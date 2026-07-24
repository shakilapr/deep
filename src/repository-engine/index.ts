// Phase 16 — Filesystem index (incremental, content-hashed)
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileHash, isIgnored } from "./fs.js";
import { minimatch } from "minimatch";

export interface FileIndexEntry {
  path: string;
  size: number;
  mtimeMs: number;
  contentHash: string;
  type: string;
  generated: boolean;
  vendored: boolean;
}

export class FilesystemIndex {
  private entries = new Map<string, FileIndexEntry>();
  private cachePath: string;

  constructor(
    private root: string,
    private ignore: string[] = ["node_modules", "dist", "build", ".git"],
    private generatedPatterns: string[] = [],
    private vendoredPatterns: string[] = [],
    cacheFile = ".deep/index/files.json",
  ) {
    this.cachePath = join(root, cacheFile);
    this.load();
  }

  private load() {
    if (existsSync(this.cachePath)) {
      try {
        const data = JSON.parse(readFileSync(this.cachePath, "utf8")) as FileIndexEntry[];
        for (const e of data) this.entries.set(e.path, e);
      } catch { /* ignore */ }
    }
  }

  private save() {
    mkdirSync(dirname(this.cachePath), { recursive: true });
    writeFileSync(this.cachePath, JSON.stringify([...this.entries.values()], null, 2));
  }

  private classify(rel: string): { generated: boolean; vendored: boolean } {
    const generated = this.generatedPatterns.some((p) => minimatch(rel, p));
    const vendored = this.vendoredPatterns.some((p) => minimatch(rel, p));
    return { generated, vendored };
  }

  /** Scan, updating only changed files. Returns changed paths. */
  update(): string[] {
    const changed: string[] = [];
    const seen = new Set<string>();
    const walk = (dir: string) => {
      let items: string[];
      try { items = readdirSync(dir); } catch { return; }
      for (const name of items) {
        const full = join(dir, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        const rel = relative(this.root, full).replace(/\\/g, "/");
        if (st.isDirectory()) {
          if (this.ignore.includes(name) || name === ".git") continue;
          walk(full);
        } else if (st.isFile()) {
          if (isIgnored(rel, this.ignore)) continue;
          seen.add(rel);
          const content = readFileSync(full);
          const h = fileHash(content);
          const prev = this.entries.get(rel);
          if (!prev || prev.contentHash !== h || prev.size !== st.size) {
            const { generated, vendored } = this.classify(rel);
            this.entries.set(rel, {
              path: rel,
              size: st.size,
              mtimeMs: st.mtimeMs,
              contentHash: h,
              type: extname(rel).slice(1) || "unknown",
              generated,
              vendored,
            });
            changed.push(rel);
          }
        }
      }
    };
    walk(this.root);
    // Remove deleted files.
    for (const key of [...this.entries.keys()]) {
      if (!seen.has(key)) { this.entries.delete(key); changed.push(key); }
    }
    this.save();
    return changed;
  }

  all(): FileIndexEntry[] { return [...this.entries.values()]; }
  get(path: string): FileIndexEntry | undefined { return this.entries.get(path); }
  files(): string[] { return [...this.entries.keys()]; }

  /** Phase 42 — drop a single file's cached entry (e.g. after an edit). */
  remove(path: string): void {
    if (this.entries.delete(path)) this.save();
  }
}
