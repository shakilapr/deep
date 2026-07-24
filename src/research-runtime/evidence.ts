// Phase 21 — Evidence model helpers
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { EvidenceReference, EvidenceStatus, VerifiedEvidence } from "../protocol/evidence.js";
import { fileHash } from "../repository-engine/fs.js";

export function snippet(excerpt: string): string {
  return fileHash(excerpt);
}

/** Extract the exact cited lines from a file. */
export function readRangeContent(root: string, ref: EvidenceReference): { text: string; exists: boolean } {
  const full = join(root, ref.path);
  if (!existsSync(full)) return { text: "", exists: false };
  const lines = readFileSync(full, "utf8").split("\n");
  const s = Math.max(1, ref.startLine);
  const e = Math.min(lines.length, ref.endLine);
  return { text: lines.slice(s - 1, e).join("\n"), exists: true };
}

export interface VerifyContext {
  root: string;
  snapshotId: string;
  /** Hashes of current file content keyed by path; if provided, staleness is checked. */
  currentHashes?: Map<string, string>;
  snapshotHash?: (path: string) => string | undefined;
}

export function verifyEvidence(ref: EvidenceReference, ctx: VerifyContext): VerifiedEvidence {
  const id = `ev_${fileHash(JSON.stringify(ref))}`;
  const full = join(ctx.root, ref.path);
  if (!existsSync(full)) {
    return { id, reference: ref, status: "invalid_path", snippetHash: snippet("") };
  }
  const lines = readFileSync(full, "utf8").split("\n");
  if (ref.startLine < 1 || ref.endLine > lines.length || ref.startLine > ref.endLine) {
    return { id, reference: ref, status: "invalid_range", snippetHash: snippet("") };
  }
  const excerpt = lines.slice(ref.startLine - 1, ref.endLine).join("\n");
  const sh = snippet(excerpt);

  // Staleness: compare current file hash vs expected.
  if (ref.expectedContentHash) {
    const cur = fileHash(readFileSync(full, "utf8"));
    if (cur !== ref.expectedContentHash) {
      return { id, reference: ref, status: "stale", snippetHash: sh, excerpt };
    }
  }
  // Symbol overlap (if provided) — check the symbol name appears in the range.
  if (ref.symbol) {
    if (!excerpt.includes(ref.symbol)) {
      return { id, reference: ref, status: "missing_symbol", snippetHash: sh, excerpt };
    }
  }
  return { id, reference: ref, status: "verified", snippetHash: sh, excerpt };
}
