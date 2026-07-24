// Phase 0 — Scope / Oracle Agent. Establishes what "wrong" means before
// detection. Read-only: inspects config + repo metadata, emits an oracle.
import { execSync } from "node:child_process";
import type { RepositoryEngine } from "../repository-engine/engine.js";
import type { ResearchScope } from "../protocol/research.js";

export interface Oracle {
  revision: string;
  root: string;
  subsystem: string;
  invariants: string[]; // requirement/contract/invariant statements
  scope: ResearchScope;
}

function currentRevision(root: string): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, windowsHide: true })
      .toString()
      .trim()
      .slice(0, 12);
  } catch {
    return "unknown";
  }
}

export function buildOracle(engine: RepositoryEngine, scope: ResearchScope = {}, question = ""): Oracle {
  const revision = currentRevision(engine.root);
  const overview = engine.overview();
  const subsystem =
    scope.paths && scope.paths.length > 0
      ? scope.paths.join(", ")
      : overview.files <= 50
        ? "entire repository"
        : "large repository (scoped analysis)";

  // Lightweight invariant extraction: surface documented expectations from the
  // prompt and from non-test source headers. Real oracles would be richer.
  const invariants: string[] = [];
  if (/security|secret/i.test(question)) {
    invariants.push("Secrets and key material must never be read or logged.");
  }
  if (/concurrent|race|lock/i.test(question)) {
    invariants.push("Shared state must be guarded by locks/atomics; no lost updates.");
  }
  if (/null|undefined|panic|crash/i.test(question)) {
    invariants.push("No dereference of undefined/null without a prior guard.");
  }
  invariants.push("Behavior must match documented/expected contracts (see code comments).");

  return { revision, root: engine.root, subsystem, invariants, scope };
}
