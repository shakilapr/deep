// qa.md reporting wrapper: a ResearchCapsule plus L-graded Findings and a
// level distribution. This is the developer-facing artifact (no code changes).
import type { ResearchCapsule } from "../protocol/research.js";
import type { Finding, FindingLevel } from "./finding.js";

export interface ResearchReport {
  capsule: ResearchCapsule;
  findings: Finding[];
  levelCounts: Record<FindingLevel, number>;
  mayBlockMerge: Finding[]; // L3+ findings with deterministic evidence
}

export function buildReport(capsule: ResearchCapsule, findings: Finding[]): ResearchReport {
  const levelCounts: Record<FindingLevel, number> = {
    L0: 0,
    L1: 0,
    L2: 0,
    L3: 0,
    L4: 0,
    L5: 0,
  };
  for (const f of findings) levelCounts[f.level]++;
  const mayBlockMerge = findings.filter(
    (f) => (f.level === "L3" || f.level === "L4") && f.execution_result,
  );
  return { capsule, findings, levelCounts, mayBlockMerge };
}
