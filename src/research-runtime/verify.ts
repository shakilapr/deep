// Phase 25 — Evidence verifier + Phase 29 contradiction detector
import { VerifiedEvidence, EvidenceReference } from "../protocol/evidence.js";
import { WorkerReport, ResearchDisagreement } from "../protocol/research.js";
import { verifyEvidence, VerifyContext } from "./evidence.js";

export function verifyReports(
  reports: WorkerReport[],
  ctx: VerifyContext,
): { evidence: Map<string, VerifiedEvidence>; byClaim: Map<string, string[]> } {
  const evidence = new Map<string, VerifiedEvidence>();
  const byClaim = new Map<string, string[]>();
  for (const report of reports) {
    for (const claim of report.claims) {
      const ids: string[] = [];
      for (const ref of claim.evidence) {
        const refWithSnap: EvidenceReference = { ...ref, snapshotId: ctx.snapshotId };
        const verified = verifyEvidence(refWithSnap, ctx);
        evidence.set(verified.id, verified);
        ids.push(verified.id);
      }
      byClaim.set(`${report.workerId}:${claim.statement}`, ids);
    }
  }
  return { evidence, byClaim };
}

/** Phase 29 — detect contradictory claims across worker reports. */
export function detectContradictions(reports: WorkerReport[]): ResearchDisagreement[] {
  const disagreements: ResearchDisagreement[] = [];
  // Group claims by subject keyword overlap.
  const all = reports.flatMap((r) => r.claims.map((c) => ({ worker: r.workerId, claim: c })));

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const b = all[j]!;
      if (a.worker === b.worker) continue;
      const subjA = a.claim.statement.toLowerCase();
      const subjB = b.claim.statement.toLowerCase();
      // A contradiction: both claims share a meaningful subject token, and one
      // asserts a negation while the other asserts the affirmative.
      const neg = (s: string) => /\b(never|not|does not|no longer|fails to|doesn't)\b/i.test(s);
      const aff = (s: string) => /\b(does|does resubscribe|restores|reenables|resubscribes|again)\b/i.test(s);
      if (sameSubject(subjA, subjB) >= 1 && neg(subjA) !== neg(subjB) && (neg(subjA) || neg(subjB)) && (aff(subjA) || aff(subjB) || neg(subjA) || neg(subjB))) {
        disagreements.push({
          subject: commonSubject(subjA, subjB),
          claims: [a.claim.statement, b.claim.statement],
          evidenceIds: [],
          resolvableBy: "static_query",
        });
      }
    }
  }
  return disagreements;
}

function tokens(s: string): Set<string> {
  return new Set(s.split(/\W+/).filter((w) => w.length > 3));
}
function sameSubject(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  let overlap = 0;
  for (const t of tb) if (ta.has(t)) overlap++;
  return overlap;
}
function commonSubject(a: string, b: string): string {
  const ta = tokens(a);
  const tb = tokens(b);
  return [...tb].filter((t) => ta.has(t)).join(" ") || "unknown";
}
