// Phase 4 — Reproduction Agent. Attempts EXECUTABLE confirmation using
// read-only commands only (tsc --noEmit and the nearest existing test). It
// NEVER writes a new test file or modifies the repo. qa.md: a failing
// assertion / trace is the strongest non-formal confirmation.
import { spawn } from "node:child_process";
import type { RepositoryEngine } from "../repository-engine/engine.js";
import { mapTests } from "../repository-engine/testmap.js";
import type { FindingLocation } from "./finding.js";

function run(cmd: string, cwd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, windowsHide: true });
    let out = "";
    const cap = (s: string) => (out + s).slice(-4000);
    child.stdout?.on("data", (d) => (out = cap(d.toString())));
    child.stderr?.on("data", (d) => (out = cap(d.toString())));
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? -1, out });
    });
  });
}

export interface ReproResult {
  execution_result?: string;
  reproducer?: string;
}

export async function runReadonlyConfirmation(
  engine: RepositoryEngine,
  location: FindingLocation,
  allowTestExecution: boolean,
): Promise<ReproResult> {
  if (!allowTestExecution) return {};
  const parts: string[] = [];
  try {
    const tsc = await run("npx tsc --noEmit", engine.root, 120_000);
    parts.push(`tsc --noEmit: ${tsc.code === 0 ? "pass" : "fail"}`);
  } catch {
    parts.push("tsc --noEmit: error");
  }

  let reproducer: string | undefined;
  try {
    const tests = mapTests(engine, { path: location.path, symbol: location.symbol }).slice(0, 1);
    if (tests.length > 0) {
      const tf = tests[0]!.path;
      const vt = await run(`npx vitest run ${JSON.stringify(tf)}`, engine.root, 120_000);
      parts.push(`vitest(${tf}): ${vt.code === 0 ? "pass" : "fail"}`);
      reproducer = `npx vitest run ${tf}`;
      if (vt.code !== 0) parts.push(`output: ${vt.out.split("\n").slice(-5).join(" | ")}`);
    }
  } catch {
    parts.push("vitest: error");
  }

  return { execution_result: parts.join("; "), reproducer };
}
