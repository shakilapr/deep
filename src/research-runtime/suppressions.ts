// Phase 7 — Learning / Suppression store. Persists triage dispositions so the
// system improves over time (also closes the earlier "memory" gap). Reuses the
// existing Store; never edits the audited repository.
import { Store, Persistable } from "../persistence/store.js";
import type { Disposition, FindingLevel } from "./finding.js";

export interface SuppressionRecord extends Persistable {
  fingerprint: string;
  reason: string;
  evidence: string;
  owner: string;
  introduced_at: string;
  expires_at?: string;
  scope: { file?: string; rule?: string; configuration?: string };
  disposition: Disposition;
  level: FindingLevel;
}

export type SuppressionInput = {
  fingerprint: string;
  reason: string;
  evidence: string;
  owner: string;
  scope: { file?: string; rule?: string; configuration?: string };
  disposition: Disposition;
  level: FindingLevel;
  expires_at?: string;
};

export class SuppressionStore {
  constructor(private store: Store, private collection = "suppressions") {}

  add(rec: SuppressionInput): SuppressionRecord {
    const full: SuppressionRecord = {
      id: `sup_${rec.fingerprint}`,
      introduced_at: new Date().toISOString(),
      ...rec,
    };
    this.store.put(this.collection, full as unknown as Persistable);
    return full;
  }

  get(fingerprint: string): SuppressionRecord | undefined {
    return this.store.get(this.collection, `sup_${fingerprint}`) as unknown as SuppressionRecord | undefined;
  }

  list(): SuppressionRecord[] {
    return this.store
      .all(this.collection)
      .map((r) => r as unknown as SuppressionRecord)
      .filter((r) => !r.expires_at || new Date(r.expires_at) > new Date());
  }

  /** True if this finding is actively suppressed (not expired). */
  isSuppressed(fingerprint: string): boolean {
    return !!this.get(fingerprint);
  }
}
