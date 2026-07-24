// Phase 21 — Evidence model types

export type EvidenceStatus =
  | "verified"
  | "invalid_path"
  | "invalid_range"
  | "missing_symbol"
  | "stale"
  | "weak_support";

export interface EvidenceReference {
  snapshotId: string;
  path: string;
  symbol?: string;
  startLine: number;
  endLine: number;
  expectedContentHash?: string;
}

export interface VerifiedEvidence {
  id: string;
  reference: EvidenceReference;
  status: EvidenceStatus;
  snippetHash: string;
  excerpt?: string;
}
