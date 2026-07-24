// qa.md evidence ladder + finding types. Read-only reporting only.
// NOTE: src/protocol/* is a fixed contract and is intentionally NOT modified;
// these types live in the research-runtime layer instead.

export type FindingLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

export type EvidenceType = "static" | "test" | "llm" | "log" | "manual";

export interface EvidenceItem {
  type: EvidenceType;
  description: string;
  ref?: { path: string; startLine?: number; endLine?: number };
}

export type Severity = "low" | "medium" | "high" | "critical";

export type Disposition =
  | "true_positive"
  | "false_positive"
  | "duplicate"
  | "intended"
  | "unreachable"
  | "accepted_risk"
  | "needs_review";

export interface FindingLocation {
  path: string;
  revision?: string;
  startLine: number;
  endLine: number;
  symbol?: string;
}

export interface Finding {
  id: string;
  title: string;
  category: string; // CWE id or short class, e.g. "logic" / "CWE-682"
  location: FindingLocation;
  violated_invariant?: string;
  trigger?: string;
  feasible_path?: Array<{ path: string; startLine: number; endLine: number; note?: string }>;
  expected?: string;
  actual?: string;
  reproducer?: string;
  execution_result?: string;
  supporting_evidence: EvidenceItem[];
  opposing_evidence: EvidenceItem[];
  assumptions: string[];
  affected_scope?: string;
  root_cause?: string;
  confidence: number; // 0..1 — how sure this is a real defect
  severity: Severity; // how damaging if triggered
  level: FindingLevel; // qa.md evidence ladder
  fingerprint: string;
  recommended_fix?: string; // text only — NEVER applied
  disposition?: Disposition;
}

export function fingerprintFinding(
  path: string,
  startLine: number,
  category: string,
  rule: string,
): string {
  const s = `${path}:${startLine}:${category}:${rule}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `fp_${h.toString(16)}`;
}
