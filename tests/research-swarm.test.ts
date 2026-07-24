// Research swarm milestone tests — phases 27, 31, 33 + 22/26 integration
import { describe, it, expect } from "vitest";
import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ModelRouter } from "../src/model-router/router.js";
import { MockProvider } from "../src/model-router/mock.js";
import { ModelQualityRegistry } from "../src/model-router/quality.js";
import { runWorkers } from "../src/research-runtime/scheduler.js";
import { planFollowUp } from "../src/research-runtime/followup.js";
import { runResearch } from "../src/research-runtime/research.js";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { EventBus } from "../src/observability/eventBus.js";
import type {
  CriticReport,
  ResearchPlanQuestion,
} from "../src/protocol/research.js";

const FIXTURE = join(process.cwd(), "evaluations", "fixtures", "F02-competing-writers");

function copyFixture(): string {
  const dest = mkdtempSync(join(tmpdir(), "deep-swarm-"));
  cpSync(FIXTURE, dest, { recursive: true });
  return dest;
}

describe("Phase 27 — worker scheduler", () => {
  it("runs workers with bounded concurrency and returns all reports", async () => {
    let active = 0;
    let maxActive = 0;
    const provider = new MockProvider({
      structured: async (req) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 25));
        active--;
        const isFlow = req.messages.some((m) => m.content.includes("ROLE: flow"));
        return {
          conclusion: isFlow ? "flow conclusion" : "state conclusion",
          confidence: 0.8,
          claims: [],
        };
      },
    });
    const router = new ModelRouter({ primary: "mock/worker" });
    router.register(provider, ["mock/worker"]);

    const questions: ResearchPlanQuestion[] = [
      { id: "q1", role: "flow", question: "trace flow", initialEvidenceIds: [] },
      { id: "q2", role: "state", question: "trace state", initialEvidenceIds: [] },
      { id: "q3", role: "tests", question: "find tests", initialEvidenceIds: [] },
    ];
    const bus = new EventBus();
    const reports = await runWorkers(questions, [], router, {
      maxConcurrency: 2,
      modelId: "mock/worker",
      bus,
    });

    expect(reports.length).toBe(3);
    expect(maxActive).toBeLessThanOrEqual(2);
    const roles = reports.map((r) => r.role).sort();
    expect(roles).toEqual(["flow", "state", "tests"]);
    const events = bus.history().map((e) => e.type);
    expect(events.filter((t) => t === "ResearchWorkerStarted").length).toBe(3);
    expect(events.filter((t) => t === "ResearchWorkerCompleted").length).toBe(3);
  });

  it("isolates a failing worker without sinking the batch", async () => {
    let n = 0;
    const provider = new MockProvider({
      structured: async () => {
        n++;
        if (n === 1) throw new Error("boom");
        return { conclusion: "ok", confidence: 0.7, claims: [] };
      },
    });
    const router = new ModelRouter({ primary: "mock/worker" });
    router.register(provider, ["mock/worker"]);
    const questions: ResearchPlanQuestion[] = [
      { id: "q1", role: "flow", question: "a", initialEvidenceIds: [] },
      { id: "q2", role: "state", question: "b", initialEvidenceIds: [] },
    ];
    const reports = await runWorkers(questions, [], router, {
      maxConcurrency: 1,
      modelId: "mock/worker",
    });
    expect(reports.length).toBe(1);
  });
});

describe("Phase 31 — follow-up planning", () => {
  const base: CriticReport = {
    acceptedClaims: [],
    rejectedClaims: [],
    missingInvestigations: [],
    alternativeHypotheses: [],
    confidenceAdjustment: 0,
  };

  it("turns missing investigations into bounded follow-up questions", () => {
    const critic = {
      ...base,
      missingInvestigations: ["who writes motorEnabled", "watchdog timer path"],
    };
    const qs = planFollowUp(critic, new Set(), []);
    expect(qs.length).toBe(2);
    expect(qs.every((q) => q.role === "state")).toBe(true);
    expect(qs[0]!.question).toContain("who writes motorEnabled");
  });

  it("returns [] when nothing is missing and caps at 3", () => {
    expect(planFollowUp(base, new Set(), [])).toEqual([]);
    const many = { ...base, missingInvestigations: ["a", "b", "c", "d", "e"] };
    expect(planFollowUp(many, new Set(), []).length).toBe(3);
  });
});

describe("Phase 33 — model quality registry", () => {
  it("penalizes fabricated evidence and prefers the clean model", () => {
    const reg = new ModelQualityRegistry();
    for (let i = 0; i < 5; i++) {
      reg.record("clean", { schemaValid: true, validEvidence: true, usefulClaim: true });
      reg.record("dirty", { schemaValid: true, validEvidence: false, usefulClaim: false });
      reg.recordSemanticFailure("dirty", "fabricated_evidence");
    }
    expect(reg.reliability("dirty", "research-worker")).toBeLessThan(
      reg.reliability("clean", "research-worker"),
    );
    expect(reg.pickForRole("research-worker", ["dirty", "clean"])).toBe("clean");
  });

  it("cooldown excludes a model from selection", () => {
    const reg = new ModelQualityRegistry();
    reg.record("a", { validEvidence: true, usefulClaim: true, schemaValid: true });
    reg.record("b", { validEvidence: false, usefulClaim: false, schemaValid: true });
    reg.cooldown("a", 60_000);
    expect(reg.isCooled("a")).toBe(true);
    expect(reg.pickForRole("critic", ["a", "b"])).toBe("b");
  });
});

describe("Phase 22/26 — end-to-end swarm research", () => {
  it("returns a capsule with verified claims on the F02 fixture", async () => {
    const root = copyFixture();
    const engine = new RepositoryEngine(root);
    engine.refresh();

    const provider = new MockProvider({
      structured: () => ({
        conclusion: "command loop restores motorEnabled after timeout",
        confidence: 0.9,
        claims: [
          {
            statement: "command loop writes enabled after timeout",
            evidence: [
              { path: "src/control/command-loop.ts", startLine: 1, endLine: 3 },
            ],
          },
        ],
      }),
    });
    const router = new ModelRouter({ primary: "mock/worker" });
    router.register(provider, ["mock/worker", "mock/critic"]);

    const bus = new EventBus();
    const capsule = await runResearch(
      {
        question: "why does motorEnabled stay true after timeout",
        budget: { maxModelCalls: 10, timeoutSeconds: 30 },
      },
      { engine, router, root, snapshotId: "snap_swarm", bus },
    );

    expect(capsule.repository.snapshotId).toBe("snap_swarm");
    expect(capsule.claims.some((c) => c.status === "verified")).toBe(true);
    expect(capsule.locations.length).toBeGreaterThanOrEqual(1);
    expect(bus.history().some((e) => e.type === "ResearchCompleted")).toBe(true);
  });
});
