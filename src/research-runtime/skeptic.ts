// Phase 3b — Static Skeptic. Independent (non-LLM) disprover that searches for
// evidence CONTRADICTING a candidate: dominant validation, sanitizers,
// unreachable branches, type guarantees. This provides the "independent
// evidence type" qa.md requires (LLM agreement alone is weak).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RepositoryEngine } from "../repository-engine/engine.js";
import type { EvidenceItem, FindingLocation } from "./finding.js";

const GUARD_RE =
  /\b(if\s*\(|throw|return|assert|validate|sanitiz|escape|guard|check|ensure|require\(|Array\.isArray|Number\.is(?:Finite|Integer|NaN)|typeof\s+\w+\s*===|instanceof|try\s*\{|catch\s*\()\b/i;

export function staticDisprove(
  engine: RepositoryEngine,
  location: FindingLocation,
  claimText = "",
): EvidenceItem[] {
  const full = join(engine.root, location.path);
  if (!existsSync(full)) return [];
  const lines = readFileSync(full, "utf8").split("\n");

  // Look at the suspicious line and a window above it for a guarding check.
  const from = Math.max(0, location.startLine - 12);
  const to = Math.min(lines.length, location.endLine + 2);
  const window = lines.slice(from, to).join("\n");

  const opposing: EvidenceItem[] = [];

  if (GUARD_RE.test(window)) {
    opposing.push({
      type: "static",
      description:
        "A guard/validation/early-return is present near the suspected location; the defect may be unreachable or already handled.",
      ref: { path: location.path, startLine: from + 1, endLine: to },
    });
  }

  // If the claim is about a null/undefined deref, check for an immediate guard
  // on the very line or the line above.
  if (/null|undefined|dereferenc/i.test(claimText)) {
    const suspect = lines[location.startLine - 1] ?? "";
    const above = lines[location.startLine - 2] ?? "";
    if (/\?\.|\?\?|&&|\|\||if\s*\(/.test(suspect + "\n" + above)) {
      opposing.push({
        type: "static",
        description: "Optional chaining / null-coalescing / conditional guards the dereference.",
        ref: { path: location.path, startLine: location.startLine - 1, endLine: location.startLine },
      });
    }
  }

  return opposing;
}
