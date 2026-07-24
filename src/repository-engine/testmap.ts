// Phase 40 — Test relationship mapping
import { readFileSync, existsSync } from "node:fs";
import { join, basename, dirname, extname } from "node:path";
import type { RepositoryEngine } from "./engine.js";

export type TestConfidence = "high" | "medium" | "low";

export interface TestMapEntry {
  path: string;
  confidence: TestConfidence;
  reason: string;
}

function isTestFile(path: string): boolean {
  return (
    /\.test\.[tj]sx?$/.test(path) ||
    /\.spec\.[tj]sx?$/.test(path) ||
    path.startsWith("tests/") ||
    path.includes("/tests/")
  );
}

function stripSuffix(file: string): string {
  const base = basename(file, extname(file));
  return base.replace(/\.(test|spec)$/, "");
}

export function mapTests(
  engine: RepositoryEngine,
  target: { path?: string; symbol?: string },
): TestMapEntry[] {
  const files = engine.index.files();
  const testFiles = files.filter(isTestFile);

  let targetPath = target.path;
  if (!targetPath && target.symbol) {
    const sym = engine.symbols.get(target.symbol);
    targetPath = sym?.path;
  }

  const targetBase = targetPath ? stripSuffix(targetPath) : undefined;
  const targetDir = targetPath ? dirname(targetPath) : undefined;

  const rank: Record<TestConfidence, number> = { high: 3, medium: 2, low: 1 };
  const results = new Map<string, TestMapEntry>();

  const consider = (path: string, confidence: TestConfidence, reason: string) => {
    const existing = results.get(path);
    if (!existing || rank[confidence] > rank[existing.confidence]) {
      results.set(path, { path, confidence, reason });
    }
  };

  for (const tf of testFiles) {
    const tfBase = stripSuffix(tf);

    // high: shares base name with target
    if (targetBase && tfBase === targetBase) {
      consider(tf, "high", `test file name matches target base name "${targetBase}"`);
      continue;
    }

    // medium: imports the target module or references the symbol
    let content = "";
    try {
      const full = join(engine.root, tf);
      if (existsSync(full)) content = readFileSync(full, "utf8");
    } catch { /* ignore */ }

    let matchedMedium = false;
    if (content) {
      if (targetBase && new RegExp(`from\\s+["'][^"']*${targetBase}(\\.js)?["']`).test(content)) {
        consider(tf, "medium", `imports the target module "${targetBase}"`);
        matchedMedium = true;
      } else if (target.symbol && new RegExp(`\\b${target.symbol}\\b`).test(content)) {
        consider(tf, "medium", `references the symbol "${target.symbol}"`);
        matchedMedium = true;
      }
    }
    if (matchedMedium) continue;

    // low: same directory as target
    if (targetDir && dirname(tf) === targetDir) {
      consider(tf, "low", `test file in the same directory as target`);
    }
  }

  return [...results.values()]
    .sort((a, b) => rank[b.confidence] - rank[a.confidence])
    .slice(0, 10);
}
