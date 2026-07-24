// Phase 3a — Path Analyst. Establishes whether a candidate defect is on a
// feasible, reachable control/data-flow path (qa.md: "feasible path" is the
// gate that separates L1 from L2). Uses the file-scoped dependency graph.
import type { RepositoryEngine } from "../repository-engine/engine.js";
import { DependencyGraph, GraphEdge } from "../repository-engine/graph.js";
import type { FindingLocation } from "./finding.js";

export interface PathResult {
  reachable: boolean;
  feasible_path?: Array<{ path: string; startLine: number; endLine: number; note?: string }>;
}

export function analyzePath(engine: RepositoryEngine, location: FindingLocation): PathResult {
  let graph: DependencyGraph | undefined;
  try {
    graph = new DependencyGraph(engine).build();
  } catch {
    return { reachable: false };
  }
  if (!graph) return { reachable: false };

  if (!location.symbol) {
    // No symbol to resolve; treat file-level presence as weakly reachable.
    return { reachable: engine.index.files().includes(location.path), feasible_path: [] };
  }

  const edges: GraphEdge[] = graph.buildCallPath(location.symbol, location.path);
  if (edges.length === 0) {
    // Not called by anything we can see -> likely dead/unreachable code.
    return { reachable: false, feasible_path: [] };
  }

  const feasible_path = edges
    .map((e) => ({
      path: e.toFile ?? location.path,
      startLine: e.toLine ?? location.startLine,
      endLine: e.toLine ?? location.startLine,
      note: `call ${e.from} -> ${e.to}`,
    }))
    .slice(0, 12);

  return { reachable: true, feasible_path };
}
