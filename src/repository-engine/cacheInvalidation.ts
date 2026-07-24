// Phase 42 — Cache invalidation engine
import { RepositoryEngine } from "./engine.js";
import { DependencyGraph } from "./graph.js";
import { VerifiedEvidence } from "../protocol/evidence.js";

export interface InvalidationReport {
  removedFiles: string[];
  removedSymbols: number;
  removedEdges: number;
  staleEvidence: string[];
}

/**
 * Invalidate cached artifacts for the given changed files without rebuilding
 * the whole repository. Unrelated cache entries are preserved.
 */
export function invalidateChanged(
  engine: RepositoryEngine,
  changedPaths: string[],
  knownEvidence?: Map<string, VerifiedEvidence>,
): InvalidationReport {
  const report: InvalidationReport = { removedFiles: [], removedSymbols: 0, removedEdges: 0, staleEvidence: [] };
  const graph = new DependencyGraph(engine);

  for (const p of changedPaths) {
    const before = engine.symbols.symbolsInFile(p).length;
    engine.index.remove(p);
    engine.symbols.invalidateFile(p);
    graph.invalidateFile(p);
    report.removedFiles.push(p);
    report.removedSymbols += before;
  }
  report.removedEdges = changedPaths.length;

  if (knownEvidence) {
    for (const ev of knownEvidence.values()) {
      if (changedPaths.includes(ev.reference.path) && ev.status === "verified") {
        report.staleEvidence.push(ev.id);
      }
    }
  }
  return report;
}

/** Manual full rebuild: re-extract everything for the current tree. */
export function rebuildAll(engine: RepositoryEngine): string[] {
  return engine.refresh();
}
