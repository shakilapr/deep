// Orchestrates qa.md Phases 2-5 for each verified candidate location and
// produces L-graded Findings. Pure analysis + read-only checks; no edits.
import type { RepositoryEngine } from "../repository-engine/engine.js";
import type { ResearchCapsule } from "../protocol/research.js";
import type { Finding, FindingLevel, Severity, EvidenceItem } from "./finding.js";
import { fingerprintFinding } from "./finding.js";
import { collectContext } from "./context.js";
import { analyzePath } from "./pathAnalyst.js";
import { staticDisprove } from "./skeptic.js";
import { runReadonlyConfirmation } from "./repro.js";
import { judge } from "./judge.js";
import type { SuppressionStore } from "./suppressions.js";

export interface GradeDeps {
  engine: RepositoryEngine;
  verification?: { allowTestExecution?: boolean; minimumConfidence?: number };
  store?: SuppressionStore;
  revision?: string;
}

function severityForLevel(level: FindingLevel): Severity {
  if (level === "L4" || level === "L5") return "high";
  if (level === "L3") return "medium";
  return "low";
}

export async function buildFindings(capsule: ResearchCapsule, deps: GradeDeps): Promise<Finding[]> {
  const findings: Finding[] = [];
  const allowTests = deps.verification?.allowTestExecution ?? false;
  let n = 0;

  for (const loc of capsule.locations) {
    // Resolve the enclosing symbol from the cited line when the worker omitted it,
    // so PathAnalyst can establish a feasible call path (higher L-level).
    let symbol = loc.symbol;
    if (!symbol) {
      try {
        const syms = deps.engine.symbols.symbolsInFile(loc.path);
        const enclosing = syms.find((s) => s.startLine <= loc.startLine && s.endLine >= loc.startLine);
        symbol = enclosing?.name;
      } catch {
        /* ignore */
      }
    }
    const location = {
      path: loc.path,
      revision: deps.revision,
      startLine: loc.startLine,
      endLine: loc.endLine,
      symbol,
    };

    const ctx = collectContext(deps.engine, location);
    const path = analyzePath(deps.engine, location);
    const opposing = staticDisprove(deps.engine, location, loc.reason);
    const repro = await runReadonlyConfirmation(deps.engine, location, allowTests);

    const supporting: EvidenceItem[] = [
      { type: "llm", description: loc.reason, ref: { path: loc.path, startLine: loc.startLine, endLine: loc.endLine } },
    ];
    if (path.feasible_path && path.feasible_path.length > 0) {
      supporting.push({
        type: "static",
        description: `Feasible call path to this location (${path.feasible_path.length} edge(s)).`,
      });
    }
    if (ctx.callers.length > 0) {
      supporting.push({ type: "static", description: `Called by: ${ctx.callers.slice(0, 3).join(", ")}` });
    }

    const { level, confidence, severity } = judge({
      title: loc.reason,
      category: "logic",
      location,
      feasible_path: path.feasible_path,
      execution_result: repro.execution_result,
      supporting_evidence: supporting,
      opposing_evidence: opposing,
      confidence: capsule.conclusion.confidence,
      severity: severityForLevel("L2"),
      violated_invariant: loc.reason,
    });

    const fp = fingerprintFinding(loc.path, loc.startLine, "logic", loc.reason.slice(0, 24));
    const existing = deps.store?.get(fp);
    const minConf = deps.verification?.minimumConfidence ?? 0;
    if (level === "L2" && confidence < minConf) {
      // below reporting threshold; keep as latent (L1) only
    }

    findings.push({
      id: `finding_${n++}`,
      title: loc.reason,
      category: "logic",
      location,
      feasible_path: path.feasible_path,
      expected: undefined,
      actual: undefined,
      reproducer: repro.reproducer,
      execution_result: repro.execution_result,
      supporting_evidence: supporting,
      opposing_evidence: opposing,
      assumptions: [
        "Reachability inferred from heuristic call graph (file-scoped).",
        allowTests ? "Executable confirmation used existing tests only." : "No executable confirmation performed.",
      ],
      affected_scope: ctx.exported ? "exported symbol" : "internal symbol",
      confidence,
      severity,
      level,
      fingerprint: fp,
      disposition: existing ? existing.disposition : "needs_review",
    });
  }

  return findings;
}
