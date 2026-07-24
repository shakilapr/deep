// Phase 45 — Evaluation harness over ground-truth fixtures
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runResearch } from "../research-runtime/research.js";
import type { ResearchCapsule } from "../protocol/research.js";

export interface EvalReport {
  fixtureId: string;
  recallAt1: number;
  recallAt5: number;
  verifiedEvidenceValidity: number;
  rootCauseCovered: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  capsuleConfidence: number;
}

interface GroundTruth {
  fixtureId: string;
  task: string;
  relevantFiles: string[];
  requiredClaims: string[];
  rootCause?: { symbols?: string[] };
}

function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

function recallAt(capsule: ResearchCapsule, relevant: string[], k: number): number {
  const top = capsule.locations.slice(0, k).map((l) => norm(l.path));
  if (relevant.length === 0) return 1;
  const hit = relevant.filter((r) => top.includes(norm(r))).length;
  return hit / relevant.length;
}

export async function evaluateFixture(
  fixtureDir: string,
  deps: { engine: any; router: any; root: string },
): Promise<EvalReport> {
  const gt = JSON.parse(
    readFileSync(join(fixtureDir, "ground-truth.json"), "utf8"),
  ) as GroundTruth;

  const snapshotId = deps.engine.snapshots?.create?.().id ?? "snap_eval";
  const capsule = await runResearch(
    { question: gt.task, depth: "normal" },
    { engine: deps.engine, router: deps.router, root: deps.root, snapshotId },
  );

  const verified = capsule.claims.filter((c) => c.status === "verified").length;
  const validity = capsule.claims.length === 0 ? 0 : verified / capsule.claims.length;

  const statements = capsule.claims.map((c) => c.statement.toLowerCase());
  const rootCauseCovered = (gt.requiredClaims ?? []).some((rc) => {
    const needle = rc.toLowerCase().replace(/[.]+$/, "");
    return statements.some((s) => s.includes(needle) || needle.split(/\s+/).every((w) => s.includes(w)) === true);
  });

  return {
    fixtureId: gt.fixtureId,
    recallAt1: recallAt(capsule, gt.relevantFiles ?? [], 1),
    recallAt5: recallAt(capsule, gt.relevantFiles ?? [], 5),
    verifiedEvidenceValidity: validity,
    rootCauseCovered,
    calls: capsule.usage.calls,
    inputTokens: capsule.usage.inputTokens,
    outputTokens: capsule.usage.outputTokens,
    estimatedCostUsd: capsule.usage.estimatedCostUsd,
    capsuleConfidence: capsule.conclusion.confidence,
  };
}
