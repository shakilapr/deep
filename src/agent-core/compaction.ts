// Phase 43 — Main-session compaction
import type { SessionMessage } from "./session.js";

export interface CompactResult {
  messages: SessionMessage[];
  preserved: {
    goal?: string;
    constraints: string[];
    modifiedFiles: string[];
    testStatus: string[];
    researchConclusions: string[];
    unresolvedRisks: string[];
  };
  removedExcerpts: number;
}

const FILE_RE = /(?:modified|wrote|edited|created|updated)\s+([\w./\\-]+\.\w{1,5})/gi;
const TEST_RE = /^.*\b(\d+\s+(?:passed|failed)|tests?\s+(?:passed|failed|green|red)|PASS|FAIL)\b.*$/gim;
const RISK_RE = /^.*\b(risk|unresolved|TODO|blocked)\b.*$/gim;
const CONSTRAINT_RE = /^.*\b(must not|do not|only|constraint|never)\b.*$/gim;

export function compactSession(
  messages: SessionMessage[],
  opts?: { maxCharsPerToolResult?: number; goalHint?: string },
): CompactResult {
  const maxChars = opts?.maxCharsPerToolResult ?? 400;

  const preserved: CompactResult["preserved"] = {
    goal: opts?.goalHint,
    constraints: [],
    modifiedFiles: [],
    testStatus: [],
    researchConclusions: [],
    unresolvedRisks: [],
  };

  // Latest user task becomes the goal.
  for (const m of messages) {
    if (m.kind === "user" && m.content.trim()) preserved.goal = m.content.trim();
  }

  const seenExcerpts = new Set<string>();
  let removedExcerpts = 0;
  const out: SessionMessage[] = [];

  const pushUnique = (arr: string[], v: string) => {
    if (v && !arr.includes(v)) arr.push(v);
  };

  for (const m of messages) {
    // Extract preserved facts from all messages.
    for (const match of m.content.matchAll(FILE_RE)) pushUnique(preserved.modifiedFiles, match[1]!);
    for (const match of m.content.matchAll(TEST_RE)) pushUnique(preserved.testStatus, match[0]!.trim());
    for (const match of m.content.matchAll(RISK_RE)) pushUnique(preserved.unresolvedRisks, match[0]!.trim());
    if (m.kind === "user" || m.kind === "system") {
      for (const match of m.content.matchAll(CONSTRAINT_RE)) pushUnique(preserved.constraints, match[0]!.trim());
    }
    if (m.kind === "assistant" && /Research done|conclusion/i.test(m.content)) {
      pushUnique(preserved.researchConclusions, m.content.trim());
    }

    if (m.kind === "tool_result") {
      const key = m.content;
      if (seenExcerpts.has(key)) {
        // Duplicate excerpt: drop entirely.
        removedExcerpts++;
        continue;
      }
      seenExcerpts.add(key);
      if (m.content.length > maxChars) {
        const firstLine = m.content.split(/\r?\n/, 1)[0] ?? "";
        const truncated = m.content.length - firstLine.length;
        out.push({ ...m, content: `${firstLine}\n[truncated ${truncated} chars]` });
        removedExcerpts++;
        continue;
      }
    }
    out.push(m);
  }

  return { messages: out, preserved, removedExcerpts };
}
