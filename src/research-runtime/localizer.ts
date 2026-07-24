// Phase 23 — Deterministic research localizer (runs before any model call)
import { RepositoryEngine } from "../repository-engine/engine.js";

export interface CandidateLocation {
  path: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
  score: number;
  reason: string;
}

const STOPWORDS = new Set(["the", "a", "an", "of", "to", "in", "on", "and", "or", "is", "was", "after", "before", "why", "how", "find", "fix", "the", "that", "this", "does", "not", "remains", "enabled"]);

export class Localizer {
  constructor(private engine: RepositoryEngine, private maxCandidates = 25) {}

  /** Normalize question -> identifiers + quoted strings. */
  extractQueryTerms(question: string): string[] {
    const quoted = [...question.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    const identifiers = [...question.matchAll(/\b([A-Za-z_][A-Za-z0-9_]{2,})\b/g)]
      .map((m) => m[1]!)
      .filter((w) => !STOPWORDS.has(w.toLowerCase()));
    return [...new Set([...quoted, ...identifiers])];
  }

  localize(question: string, scope?: { symbols?: string[]; paths?: string[]; includeTests?: boolean }): CandidateLocation[] {
    const terms = scope?.symbols ? [...scope.symbols] : this.extractQueryTerms(question);
    const candidates = new Map<string, CandidateLocation>();

    // 1. Text search for each term.
    for (const term of terms) {
      const hits = this.engine.search.search({ pattern: term, limit: 20 });
      for (const h of hits) {
        const key = `${h.path}:${h.line}`;
        const prev = candidates.get(key);
        candidates.set(key, {
          path: h.path,
          startLine: h.line,
          endLine: h.line,
          score: (prev?.score ?? 0) + 5,
          reason: `text match '${term}'`,
        });
      }
    }

    // 2. Symbol expansion: exact then fuzzy.
    for (const term of terms) {
      const syms = this.engine.symbols.search(term, true);
      for (const s of syms.slice(0, 10)) {
        const key = `${s.path}:${s.startLine}`;
        const prev = candidates.get(key);
        const bonus = s.name.toLowerCase() === term.toLowerCase() ? 10 : 4;
        candidates.set(key, {
          path: s.path,
          symbol: s.name,
          startLine: s.startLine,
          endLine: s.endLine,
          score: (prev?.score ?? 0) + bonus,
          reason: `symbol '${s.name}' (${s.kind})`,
        });
      }
    }

    // 3. Related test files by naming convention.
    if (scope?.includeTests !== false) {
      for (const c of candidates.values()) {
        const base = c.path.replace(/\.[^.]+$/, "");
        const testCandidate = `${base}.test.${c.path.split(".").pop()}`;
        const found = this.engine.index.get(testCandidate);
        if (found) {
          candidates.set(`test:${testCandidate}`, {
            path: testCandidate,
            score: 3,
            reason: "related test file",
          });
        }
      }
    }

    // 4. Scope narrowing.
    let list = [...candidates.values()];
    if (scope?.paths) {
      const set = new Set(scope.paths);
      list = list.filter((c) => set.has(c.path) || c.path.startsWith(scope.paths![0]!.replace(/[^/]+$/, "")));
    }

    return list.sort((a, b) => b.score - a.score).slice(0, this.maxCandidates);
  }
}
