// testing-plan.md §1.4 — architecture invariants that were weak/missing.
import { describe, it, expect } from "vitest";
import { compileCapsule } from "../src/research-runtime/capsule.js";
import type { WorkerReport, ResearchCapsule } from "../src/protocol/research.js";
import type { VerifiedEvidence } from "../src/protocol/evidence.js";

function mkReport(workerId: string, longTranscript: string): WorkerReport {
  return {
    workerId,
    modelId: "mock/worker",
    role: "flow",
    question: "q",
    conclusion: "short conclusion",
    confidence: 0.8,
    claims: [{ statement: "claim A", evidence: [{ snapshotId: "s", path: "a.ts", symbol: "foo", startLine: 1, endLine: 2 }] }],
    hypotheses: [{ description: "h", supportingEvidence: [longTranscript], opposingEvidence: [] }],
    unansweredQuestions: ["u1"],
  };
}

const verified = new Map<string, VerifiedEvidence>([
  ["ev1", { id: "ev1", reference: { snapshotId: "s", path: "a.ts", symbol: "foo", startLine: 1, endLine: 2 }, status: "verified", snippetHash: "h" }],
]);

const baseArgs = {
  capsuleId: "caps_test",
  repository: { snapshotId: "s", root: ".", dirtyTreeHash: "d" } as ResearchCapsule["repository"],
  request: { originalQuestion: "q", normalizedGoal: "g" },
  workerReports: [mkReport("w1", "X".repeat(5000))],
  verified,
};

describe("invariant #2/#7: frontier receives compact capsule, not worker transcripts", () => {
  const capsule = compileCapsule(baseArgs);

  it("does not expose raw worker hypotheses", () => {
    expect((capsule as unknown as Record<string, unknown>).hypotheses).toBeUndefined();
    const json = JSON.stringify(capsule);
    // The 5000-char raw transcript must not be carried into the capsule.
    expect(json.includes("X".repeat(1000))).toBe(false);
  });

  it("claims reference verified evidence only", () => {
    for (const c of capsule.claims) {
      for (const id of c.evidenceIds) expect(verified.has(id)).toBe(true);
    }
  });

  it("locations are bounded (compact context)", () => {
    expect(capsule.locations.length).toBeLessThanOrEqual(25);
  });
});

describe("invariant #11: research records token/cost usage (context-cost proxy)", () => {
  it("capsule carries usage accounting", () => {
    const capsule = compileCapsule({ ...baseArgs, usage: { models: ["mock/worker"], calls: 3, inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.01 } });
    expect(capsule.usage.calls).toBe(3);
    expect(capsule.usage.inputTokens).toBe(100);
    expect(capsule.usage.outputTokens).toBe(50);
    expect(capsule.usage.estimatedCostUsd).toBe(0.01);
  });
});