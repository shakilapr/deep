// Phase 2 — Context Agent. Retrieves callers, callees, types, tests and history
// around a candidate so verification is not performed on a single function.
import type { RepositoryEngine } from "../repository-engine/engine.js";
import { mapTests } from "../repository-engine/testmap.js";
import { DependencyGraph } from "../repository-engine/graph.js";

export interface ContextBundle {
  callers: string[];
  callees: string[];
  tests: string[];
  exported: boolean;
}

export function collectContext(
  engine: RepositoryEngine,
  location: { path: string; symbol?: string },
): ContextBundle {
  const callers: string[] = [];
  const callees: string[] = [];

  if (location.symbol) {
    try {
      const g = new DependencyGraph(engine).build();
      for (const e of g.getCallers(location.symbol)) {
        callers.push(`${e.fromFile ?? "?"}:${e.from}`);
      }
      for (const e of g.getCallees(location.symbol)) {
        callees.push(`${e.toFile ?? "?"}:${e.to}`);
      }
    } catch {
      /* graph build can fail on odd inputs; context is best-effort */
    }
  }

  let tests: string[] = [];
  try {
    tests = mapTests(engine, { path: location.path, symbol: location.symbol }).map((t) => t.path);
  } catch {
    /* ignore */
  }

  let exported = false;
  try {
    const sym = location.symbol ? engine.symbols.get(location.symbol, location.path) : undefined;
    exported = !!sym && (sym.kind === "export" || sym.kind === "class" || sym.kind === "interface");
  } catch {
    /* ignore */
  }

  return { callers, callees, tests, exported };
}
