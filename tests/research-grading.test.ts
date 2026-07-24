// Phase 48 — tests for qa.md-grade grading, judge, and file-scoped graph.
import { describe, it, expect } from "vitest";
import { assignLevel, judge } from "../src/research-runtime/judge.js";
import { fingerprintFinding } from "../src/research-runtime/finding.js";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { DependencyGraph } from "../src/repository-engine/graph.js";

describe("fingerprintFinding", () => {
  it("is deterministic and stable", () => {
    const a = fingerprintFinding("src/x.ts", 10, "logic", "offbyone");
    const b = fingerprintFinding("src/x.ts", 10, "logic", "offbyone");
    expect(a).toBe(b);
    expect(a).toMatch(/^fp_[0-9a-f]+$/);
  });
});

describe("judge.assignLevel (qa.md evidence ladder)", () => {
  const base = {
    title: "t",
    category: "logic",
    location: { path: "p", startLine: 1, endLine: 2 },
    supporting_evidence: [] as any[],
    opposing_evidence: [] as any[],
    confidence: 0.9,
    severity: "high" as const,
  };

  it("raw signal only -> L0", () => {
    expect(assignLevel(base)).toBe("L0");
  });

  it("only LLM evidence -> L1 (candidate)", () => {
    expect(assignLevel({ ...base, supporting_evidence: [{ type: "llm", description: "x" }] })).toBe("L1");
  });

  it("feasible path + independent static evidence -> L3", () => {
    const lvl = assignLevel({
      ...base,
      feasible_path: [{ path: "p", startLine: 1, endLine: 2 }],
      supporting_evidence: [{ type: "static", description: "reachable" }],
    });
    expect(lvl).toBe("L3");
  });

  it("feasible path + failing repro -> L4 (confirmed)", () => {
    const lvl = assignLevel({
      ...base,
      feasible_path: [{ path: "p", startLine: 1, endLine: 2 }],
      execution_result: "vitest: fail; assertion thrown",
    });
    expect(lvl).toBe("L4");
  });

  it("strong independent opposing evidence without repro -> downgraded to L1", () => {
    const lvl = assignLevel({
      ...base,
      feasible_path: [{ path: "p", startLine: 1, endLine: 2 }],
      opposing_evidence: [{ type: "static", description: "guarded" }],
    });
    expect(lvl).toBe("L1");
  });

  it("keeps confidence and severity separate", () => {
    const r = judge({ ...base, feasible_path: [{ path: "p", startLine: 1, endLine: 2 }], supporting_evidence: [{ type: "static", description: "x" }] });
    expect(r.level).toBe("L3");
    expect(r.severity).toBe("high");
  });
});

describe("DependencyGraph file-scoped call edges", () => {
  const engine = new RepositoryEngine(process.cwd());
  engine.refresh();
  const g = new DependencyGraph(engine).build();

  it("attach fromFile/toFile on call edges", () => {
    const callEdges = g.edges().filter((e) => e.kind === "call" && e.fromFile);
    expect(callEdges.length).toBeGreaterThan(0);
  });

  it("getCallers accepts an optional file scope and buildCallPath returns a chain", () => {
    const anyCall = g.edges().find((e) => e.kind === "call" && e.to && e.toFile);
    expect(anyCall).toBeTruthy();
    if (anyCall) {
      const callers = g.getCallers(anyCall.to, anyCall.toFile);
      expect(callers.length).toBeGreaterThanOrEqual(1);
      const path = g.buildCallPath(anyCall.to, anyCall.toFile);
      expect(Array.isArray(path)).toBe(true);
    }
  });
});
