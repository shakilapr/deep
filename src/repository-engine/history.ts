// Phase 41 — Git history intelligence
import { execFileSync } from "node:child_process";
import type { RepositoryEngine } from "./engine.js";

export interface HistoryEntry {
  commit: string;
  message: string;
  author?: string;
  date?: string;
}

function parseOneline(raw: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(" ");
    if (sp === -1) {
      out.push({ commit: trimmed, message: "" });
    } else {
      out.push({ commit: trimmed.slice(0, sp), message: trimmed.slice(sp + 1) });
    }
  }
  return out;
}

export function historyFor(
  engine: RepositoryEngine,
  target: { path?: string; symbol?: string; lines?: [number, number] },
): HistoryEntry[] {
  if (!engine.git.status().isRepo) return [];

  const path = target.path;

  // Try line-range (blame-style) log if symbol + lines + path given.
  if (path && target.lines) {
    const [start, end] = target.lines;
    try {
      const raw = execFileSync(
        "git",
        ["log", `-L`, `${start},${end}:${path}`, "--no-patch", "--oneline", "--max-count=10"],
        { cwd: engine.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const parsed = parseOneline(raw).slice(0, 10);
      if (parsed.length) return parsed;
    } catch {
      /* fall back to path log */
    }
  }

  if (!path) return [];
  const raw = engine.git.log({ paths: [path], maxCount: 10 });
  return parseOneline(raw).slice(0, 10);
}
