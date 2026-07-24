// Phase 26 — Research Capsule Compiler
import {
  ResearchCapsule,
  ResearchClaim,
  ResearchLocation,
  WorkerReport,
  CriticReport,
} from "../protocol/research.js";
import { VerifiedEvidence } from "../protocol/evidence.js";

export interface CapsuleUsage {
  models?: string[];
  calls?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface CompileCapsuleArgs {
  capsuleId: string;
  repository: ResearchCapsule["repository"];
  request: ResearchCapsule["request"];
  workerReports: WorkerReport[];
  verified: Map<string, VerifiedEvidence>;
  critic?: CriticReport;
  tests?: ResearchCapsule["tests"];
  usage?: CapsuleUsage;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function confidenceLabel(c: number): "low" | "medium" | "high" {
  if (c >= 0.75) return "high";
  if (c >= 0.5) return "medium";
  return "low";
}

export function compileCapsule(args: CompileCapsuleArgs): ResearchCapsule {
  const { workerReports, verified, critic } = args;

  const rejectedStatements = new Set(
    (critic?.rejectedClaims ?? []).map((r) => r.claimId),
  );

  const claims: ResearchClaim[] = [];
  let claimCounter = 0;
  for (const report of workerReports) {
    for (const claim of report.claims) {
      const id = `claim_${claimCounter++}`;
      // Resolve evidence ids for this claim by matching references.
      const evidenceIds: string[] = [];
      let hasVerified = false;
      for (const ref of claim.evidence) {
        for (const [evId, ev] of verified) {
          if (
            ev.reference.path === ref.path &&
            ev.reference.startLine === ref.startLine &&
            ev.reference.endLine === ref.endLine
          ) {
            if (!evidenceIds.includes(evId)) evidenceIds.push(evId);
            if (ev.status === "verified") hasVerified = true;
          }
        }
      }
      const rejected =
        rejectedStatements.has(id) || rejectedStatements.has(claim.statement);
      const status: ResearchClaim["status"] = rejected
        ? "disputed"
        : hasVerified
          ? "verified"
          : "inferred";
      claims.push({
        id,
        statement: claim.statement,
        status,
        confidence: report.confidence,
        evidenceIds,
      });
    }
  }

  // Locations from verified evidence (top 25).
  const locations: ResearchLocation[] = [];
  for (const ev of verified.values()) {
    if (ev.status !== "verified") continue;
    locations.push({
      path: ev.reference.path,
      symbol: ev.reference.symbol,
      startLine: ev.reference.startLine,
      endLine: ev.reference.endLine,
      role: "supporting",
      reason: "verified evidence",
      snippetHash: ev.snippetHash,
    });
    if (locations.length >= 25) break;
  }

  const avgConfidence =
    workerReports.length > 0
      ? workerReports.reduce((s, r) => s + r.confidence, 0) / workerReports.length
      : 0;
  const confidence = clamp01(avgConfidence + (critic?.confidenceAdjustment ?? 0));

  const summary = workerReports
    .map((r) => r.conclusion)
    .filter((c) => c.trim().length > 0)
    .join(" ");

  const uncertainties = [
    ...new Set(workerReports.flatMap((r) => r.unansweredQuestions)),
  ];

  const u = args.usage ?? {};

  return {
    id: args.capsuleId,
    repository: args.repository,
    request: args.request,
    conclusion: {
      summary,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
    },
    claims,
    locations,
    paths: [],
    rejectedHypotheses: (critic?.rejectedClaims ?? []).map((r) => ({
      hypothesis: r.claimId,
      reason: r.reason,
      evidenceIds: [],
    })),
    tests: args.tests ?? { relevant: [], recommended: [], executed: [] },
    uncertainties,
    usage: {
      models: u.models ?? [],
      calls: u.calls ?? 0,
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      estimatedCostUsd: u.estimatedCostUsd ?? 0,
    },
  };
}
