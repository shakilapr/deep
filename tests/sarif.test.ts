import { describe, it, expect } from "vitest";
import { toSarif } from "../src/research-runtime/sarif.js";
import { buildReport } from "../src/research-runtime/report.js";
import type { Finding, FindingLevel } from "../src/research-runtime/finding.js";
import type { ResearchCapsule } from "../src/protocol/research.js";

function fakeFinding(level: FindingLevel, path: string): Finding {
  return {
    id: "f1",
    title: "demo",
    category: "logic",
    location: { path, startLine: 10, endLine: 12, symbol: "foo" },
    supporting_evidence: [{ type: "static", description: "x" }],
    opposing_evidence: [],
    assumptions: [],
    confidence: 0.9,
    severity: "high",
    level,
    fingerprint: "fp_demo",
    disposition: "needs_review",
  };
}

const capsule = { locations: [] } as unknown as ResearchCapsule;

describe("toSarif", () => {
  it("emits a valid 2.1.0 log and maps levels", () => {
    const report = buildReport(capsule, [
      fakeFinding("L4", "src/a.ts"),
      fakeFinding("L3", "src/b.ts"),
      fakeFinding("L1", "src/c.ts"), // should be omitted (none)
    ]);
    const sarif = toSarif(report);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.name).toBe("deep");
    expect(sarif.runs[0].results.length).toBe(2);
    const levels = sarif.runs[0].results.map((r) => r.level);
    expect(levels).toContain("error"); // L4
    expect(levels).toContain("warning"); // L3
    // L1 filtered out
    expect(sarif.runs[0].results.every((r) => r.level !== "none")).toBe(true);
  });

  it("includes fingerprint and disposition in properties", () => {
    const report = buildReport(capsule, [fakeFinding("L4", "src/a.ts")]);
    const sarif = toSarif(report);
    const props = sarif.runs[0].results[0].properties as any;
    expect(props.fingerprint).toBe("fp_demo");
    expect(props.level).toBe("L4");
  });
});
