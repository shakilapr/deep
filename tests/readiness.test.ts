import { describe, it, expect } from "vitest";
import { join } from "node:path";

import { compactSession } from "../src/agent-core/compaction.js";
import { formatTrace, formatCost } from "../src/observability/trace.js";
import { Metrics } from "../src/observability/logging.js";
import { EventBus } from "../src/observability/eventBus.js";
import { evaluateFixture } from "../src/evaluation/harness.js";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { ModelRouter } from "../src/model-router/router.js";
import { MockProvider } from "../src/model-router/mock.js";
import type { SessionMessage } from "../src/agent-core/session.js";

describe("Phase 43 — compaction", () => {
  it("preserves goal + research conclusion and drops duplicates", () => {
    let n = 0;
    const msg = (kind: SessionMessage["kind"], content: string): SessionMessage => ({
      id: `m${n++}`,
      kind,
      content,
      timestamp: Date.now(),
    });
    const bigExcerpt = "line one of tool output\n" + "x".repeat(1000);
    const messages: SessionMessage[] = [
      msg("user", "Fix the watchdog timeout bug"),
      msg("tool_result", bigExcerpt),
      msg("tool_result", bigExcerpt), // exact duplicate
      msg(
        "assistant",
        "Research done: 2 claims, 1 verified locations, confidence high.",
      ),
    ];
    const result = compactSession(messages);
    expect(result.preserved.goal).toBe("Fix the watchdog timeout bug");
    expect(result.removedExcerpts).toBeGreaterThanOrEqual(1);
    expect(
      result.preserved.researchConclusions.some((c) => c.includes("Research done")),
    ).toBe(true);
    // Duplicate dropped: only one tool_result remains, summarized.
    const toolResults = result.messages.filter((m) => m.kind === "tool_result");
    expect(toolResults.length).toBe(1);
    expect(toolResults[0]!.content).toContain("[truncated");
  });
});

describe("Phase 44 — observability formatting", () => {
  it("formatCost mentions cost/tokens; formatTrace returns a string", () => {
    const metrics = new Metrics();
    metrics.inc("tokens.input", 100);
    metrics.inc("tokens.output", 50);
    metrics.inc("cost.usd", 0.01);
    const cost = formatCost(metrics);
    expect(typeof cost).toBe("string");
    expect(/cost|tokens/i.test(cost)).toBe(true);
    const trace = formatTrace({ metrics, bus: new EventBus() });
    expect(typeof trace).toBe("string");
    expect(trace.length).toBeGreaterThan(0);
  });
});

describe("Phase 45 — evaluation harness", () => {
  it("evaluates F02 fixture with verified evidence", async () => {
    const fixtureDir = join(process.cwd(), "evaluations", "fixtures", "F02-competing-writers");
    const engine = new RepositoryEngine(fixtureDir);
    engine.refresh();

    const provider = new MockProvider({
      structured: (req: any) => {
        const text = req.messages.map((m: any) => m.content).join("\n");
        if (text.includes("VERIFIED EVIDENCE")) {
          return {
            acceptedClaims: [],
            rejectedClaims: [],
            missingInvestigations: [],
            alternativeHypotheses: [],
            confidenceAdjustment: 0,
          };
        }
        return {
          conclusion: "The watchdog clears the enabled state; the command loop rewrites it.",
          confidence: 0.85,
          claims: [
            {
              statement: "The watchdog clears the enabled state.",
              evidence: [{ path: "src/safety/watchdog.ts", startLine: 1, endLine: 3 }],
            },
            {
              statement: "The command loop can write the enabled state afterward.",
              evidence: [{ path: "src/control/command-loop.ts", startLine: 1, endLine: 3 }],
            },
          ],
          hypotheses: [],
          unansweredQuestions: [],
        };
      },
    });
    const router = new ModelRouter({ primary: "mock/worker" });
    router.register(provider, ["mock/worker", "mock/critic"]);

    const report = await evaluateFixture(fixtureDir, { engine, router, root: fixtureDir });
    expect(report.fixtureId).toBe("F02");
    expect(report.verifiedEvidenceValidity).toBe(1);
    expect(report.capsuleConfidence).toBeGreaterThan(0);
    expect(report.rootCauseCovered).toBe(true);
    expect(report.recallAt5).toBeGreaterThan(0);
  });
});
