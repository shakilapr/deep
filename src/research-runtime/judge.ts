// Phase 5 — Evidence Judge. Assigns an L-level from a STRUCTURED evidence
// package (qa.md critical architecture rule: judge sees the package, not the
// transcript). Confidence and severity remain strictly separate.
import type { EvidenceItem, Finding, FindingLevel, Severity } from "./finding.js";

export interface JudgeInput {
  title: string;
  category: string;
  location: Finding["location"];
  feasible_path?: Finding["feasible_path"];
  execution_result?: string;
  supporting_evidence: EvidenceItem[];
  opposing_evidence: EvidenceItem[];
  confidence: number;
  severity: Severity;
  violated_invariant?: string;
}

function hasIndependentEvidence(ev: EvidenceItem[]): boolean {
  // qa.md: "two LLMs agree" is weak. Independent = static/test/log/manual.
  return ev.some((e) => e.type !== "llm");
}

/**
 * qa.md judge policy:
 *  - no reproducible proof AND no rigorous proof  -> max plausible (L2)
 *  - two LLMs agree but no independent evidence   -> max candidate (L1)
 *  - executable reproduction with clear oracle      -> confirmed (L4)
 *  - L5 requires fix verified (out of scope: we never apply fixes)
 */
export function assignLevel(input: JudgeInput): FindingLevel {
  const hasRepro = !!input.execution_result && /fail|error|throw|panic|undefined is not/i.test(input.execution_result);
  const hasFeasiblePath = !!input.feasible_path && input.feasible_path.length > 0;
  const independent = hasIndependentEvidence(input.supporting_evidence);
  const strongOpposing = input.opposing_evidence.length > 0 && input.opposing_evidence.some((e) => e.type !== "llm");

  // Downgrade when independent opposing evidence clearly contradicts.
  if (strongOpposing && !hasRepro) {
    return hasFeasiblePath ? "L1" : "L0";
  }

  if (hasRepro && (hasFeasiblePath || independent)) {
    return "L4";
  }
  if (hasFeasiblePath && independent) {
    return "L3"; // reproducible-class evidence present (e.g. failing assertion reference)
  }
  if (hasFeasiblePath) {
    return "L2"; // plausible: feasible path, no independent confirmation yet
  }
  if (input.supporting_evidence.some((e) => e.type === "llm") && independent) {
    return "L2";
  }
  if (input.supporting_evidence.length > 0) {
    return "L1"; // candidate: something noticed, no feasible path proven
  }
  return "L0"; // raw signal only
}

export function judge(input: JudgeInput): { level: FindingLevel; confidence: number; severity: Severity } {
  const level = assignLevel(input);
  // Confidence is dampened when the level is low (less certain it's real).
  let confidence = input.confidence;
  if (level === "L0") confidence = Math.min(confidence, 0.3);
  else if (level === "L1") confidence = Math.min(confidence, 0.5);
  else if (level === "L2") confidence = Math.min(confidence, 0.7);
  else if (level === "L3") confidence = Math.min(confidence, 0.85);
  return { level, confidence, severity: input.severity };
}
