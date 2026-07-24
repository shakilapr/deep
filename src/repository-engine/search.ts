// Phase 17 — Lexical search engine (ripgrep-style; portable implementation)
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { FilesystemIndex } from "./index.js";
import { isIgnored } from "./fs.js";

export interface SearchHit {
  path: string;
  line: number;
  column: number;
  text: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface SearchOptions {
  pattern: string;
  regex?: boolean;
  caseSensitive?: boolean;
  paths?: string[];
  ignore?: string[];
  limit?: number;
  contextLines?: number;
}

export class LexicalSearch {
  constructor(
    private root: string,
    private index: FilesystemIndex,
    private ignore: string[] = [],
  ) {}

  search(opts: SearchOptions): SearchHit[] {
    const re = compileRegex(opts.pattern, opts.regex ?? false, opts.caseSensitive ?? false);
    const limit = opts.limit ?? 200;
    const ctx = opts.contextLines ?? 1;
    const hits: SearchHit[] = [];
    const candidates = opts.paths && opts.paths.length
      ? opts.paths.map((p) => relative(this.root, join(this.root, p)).replace(/\\/g, "/"))
      : this.index.files();

    for (const rel of candidates) {
      if (isIgnored(rel, this.ignore)) continue;
      const full = join(this.root, rel);
      if (!existsSync(full)) continue;
      const lines = readFileSync(full, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = re.exec(lines[i]!);
        re.lastIndex = 0;
        if (m) {
          hits.push({
            path: rel,
            line: i + 1,
            column: (m.index ?? 0) + 1,
            text: lines[i]!,
            contextBefore: lines.slice(Math.max(0, i - ctx), i).map((l) => l!),
            contextAfter: lines.slice(i + 1, i + 1 + ctx).map((l) => l!),
          });
          if (hits.length >= limit) return hits;
        }
      }
    }
    return hits;
  }
}

function compileRegex(pattern: string, regex: boolean, caseSensitive: boolean): RegExp {
  const flags = caseSensitive ? "g" : "gi";
  try {
    return new RegExp(regex ? pattern : escapeRegex(pattern), flags);
  } catch {
    return new RegExp(escapeRegex(pattern), flags);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
