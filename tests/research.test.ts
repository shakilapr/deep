import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { Localizer } from "../src/research-runtime/localizer.js";
import { verifyReports, detectContradictions } from "../src/research-runtime/verify.js";
import { compileCapsule } from "../src/research-runtime/capsule.js";
import { decideStop } from "../src/research-runtime/stopping.js";
import { runResearch } from "../src/research-runtime/research.js";
import { ModelRouter } from "../src/model-router/router.js";
import { MockProvider } from "../src/model-router/mock.js";
import { WorkerReport } from "../src/protocol/research.js";
import { VerifiedEvidence } from "../src/protocol/evidence.js";

const SOURCE = `export let motorEnabled = false;

export function clearTimeoutState(): void {
  // resets the watchdog after a timeout window
  motorEnabled = true;
  watchdogArmed = false;
}

let watchdogArmed = false;

export function armWatchdog(): void {
  watchdogArmed = true;
}
`;

let dir: string;
let engine: RepositoryEngine;
const SRC_PATH = "src/motor.ts";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "deep-research-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, ".deep", "index"), { recursive: true });
  writeFileSync(join(dir, SRC_PATH), SOURCE, "utf8");
  engine = new RepositoryEngine(dir);
  engine.refresh();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("Phase 23 — Localizer recall", () => {
  it("returns the file containing motorEnabled in top candidates", () => {
    const loc = new Localizer(engine);
    const candidates = loc.localize("why does motorEnabled stay true after timeout");
    const paths = candidates.map((c) => c.path);
    expect(paths).toContain(SRC_PATH);
  });
});

describe("Phase 25 — Evidence verification", () => {
  it("rejects fabricated path and out-of-range references", () => {
    const report: WorkerReport = {
      workerId: "worker_flow",
      modelId: "mock/worker",
      role: "flow",
      question: "q",
      conclusion: "c",
      confidence: 0.5,
      claims: [
        {
          statement: "bad path claim",
          evidence: [
            { snapshotId: "s", path: "src/does-not-exist.ts", startLine: 1, endLine: 2 },
          ],
        },
        {
          statement: "bad range claim",
          evidence: [
            { snapshotId: "s", path: SRC_PATH, startLine: 9000, endLine: 9001 },
          ],
        },
      ],
      hypotheses: [],
      unansweredQuestions: [],
    };
    const { evidence } = verifyReports([report], { root: dir, snapshotId: "s" });
    const statuses = [...evidence.values()].map((e) => e.status);
    expect(statuses).toContain("invalid_path");
    expect(statuses).toContain("invalid_range");
  });
});

describe("Phase 26 — Capsule compiler", () => {
  it("marks verified claims and has no raw transcript, locations <= claims", () => {
    const report: WorkerReport = {
      workerId: "worker_state",
      modelId: "mock/worker",
      role: "state",
      question: "q",
      conclusion: "motorEnabled is set true in clearTimeoutState",
      confidence: 0.8,
      claims: [
        {
          statement: "clearTimeoutState sets motorEnabled true",
          evidence: [
            { snapshotId: "s", path: SRC_PATH, startLine: 3, endLine: 6 },
          ],
        },
      ],
      hypotheses: [],
      unansweredQuestions: [],
    };
    const { evidence } = verifyReports([report], { root: dir, snapshotId: "s" });
    const capsule = compileCapsule({
      capsuleId: "cap_1",
      repository: { snapshotId: "s", root: dir, dirtyTreeHash: "n/a" },
      request: { originalQuestion: "q", normalizedGoal: "q" },
      workerReports: [report],
      verified: evidence,
    });
    expect(capsule.claims[0]!.status).toBe("verified");
    expect(capsule.locations.length).toBeLessThanOrEqual(capsule.claims.length);
    // No raw transcript embedded.
    expect(JSON.stringify(capsule)).not.toContain("workerId");
  });
});

describe("Phase 29 — Contradiction detection", () => {
  it("detects opposing watchdog claims", () => {
    const a: WorkerReport = {
      workerId: "worker_flow",
      modelId: "mock/worker",
      role: "flow",
      question: "q",
      conclusion: "c",
      confidence: 0.5,
      claims: [{ statement: "the watchdog never resubscribes after timeout", evidence: [] }],
      hypotheses: [],
      unansweredQuestions: [],
    };
    const b: WorkerReport = {
      workerId: "worker_state",
      modelId: "mock/worker",
      role: "state",
      question: "q",
      conclusion: "c",
      confidence: 0.5,
      claims: [{ statement: "the watchdog does resubscribe after timeout", evidence: [] }],
      hypotheses: [],
      unansweredQuestions: [],
    };
    const disagreements = detectContradictions([a, b]);
    expect(disagreements.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Phase 32 — Stopping policy", () => {
  it("stops on high confidence without contradiction", () => {
    const d = decideStop({
      confidence: 0.9,
      hasUnresolvedContradiction: false,
      diminishingReturns: false,
      budgetExhausted: false,
      executedRounds: 1,
      maxRounds: 5,
    });
    expect(d.stop).toBe(true);
  });
  it("does not stop when contradiction unresolved and budget remains", () => {
    const d = decideStop({
      confidence: 0.9,
      hasUnresolvedContradiction: true,
      diminishingReturns: false,
      budgetExhausted: false,
      executedRounds: 1,
      maxRounds: 5,
    });
    expect(d.stop).toBe(false);
  });
});

describe("Phase 22/24 — End-to-end research", () => {
  it("runs research and returns a capsule with a verified location", async () => {
    const workerReport = {
      conclusion: "motorEnabled is set true in clearTimeoutState",
      confidence: 0.8,
      claims: [
        {
          statement: "clearTimeoutState sets motorEnabled true",
          evidence: [{ path: SRC_PATH, startLine: 3, endLine: 6 }],
        },
      ],
      hypotheses: [],
      unansweredQuestions: [],
    };
    const provider = new MockProvider({ structured: () => workerReport });
    const router = new ModelRouter({ primary: "mock/worker" });
    router.register(provider, ["mock/worker", "mock/critic"]);

    const capsule = await runResearch(
      { question: "why does motorEnabled stay true after timeout" },
      { engine, router, root: dir, snapshotId: "snap_test" },
    );

    const verifiedLocations = capsule.locations.filter((l) => l.path === SRC_PATH);
    expect(verifiedLocations.length).toBeGreaterThanOrEqual(1);
    expect(capsule.repository.snapshotId).toBe("snap_test");
  });
});
