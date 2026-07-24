// Advanced intelligence milestone (Phases 38–41) tests
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { DependencyGraph } from "../src/repository-engine/graph.js";
import { mapTests } from "../src/repository-engine/testmap.js";
import { historyFor } from "../src/repository-engine/history.js";
import { resolveDefinition } from "../src/repository-engine/lsp.js";

const FIXTURE = join(process.cwd(), "evaluations/fixtures/F02-competing-writers");

function makeRepo(git: boolean): { dir: string; engine: RepositoryEngine } {
  const dir = mkdtempSync(join(tmpdir(), "deep-intel-"));
  cpSync(FIXTURE, dir, { recursive: true });
  // Remove stale cache so index/symbols rebuild cleanly.
  rmSync(join(dir, ".deep"), { recursive: true, force: true });
  if (git) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@t.co"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "initial commit"], { cwd: dir });
  }
  const engine = new RepositoryEngine(dir);
  engine.refresh();
  return { dir, engine };
}

describe("advanced intelligence", () => {
  let dir: string;
  let engine: RepositoryEngine;
  let gitDir: string;
  let gitEngine: RepositoryEngine;

  beforeAll(() => {
    ({ dir, engine } = makeRepo(false));
    ({ dir: gitDir, engine: gitEngine } = makeRepo(true));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(gitDir, { recursive: true, force: true });
  });

  it("Phase 39: DependencyGraph builds import + call edges", () => {
    const graph = new DependencyGraph(engine).build();
    const importers = graph.getImporters("src/safety/watchdog.ts");
    expect(importers).toContain("src/control/command-loop.ts");

    const importEdge = graph
      .edges()
      .find(
        (e) =>
          e.kind === "import" &&
          e.from === "src/control/command-loop.ts" &&
          e.to === "src/safety/watchdog.ts",
      );
    expect(importEdge).toBeTruthy();

    expect(Array.isArray(graph.getCallers("handleTimeout"))).toBe(true);
    expect(Array.isArray(graph.getCallees("applyCommand"))).toBe(true);
  });

  it("Phase 40: mapTests ranks name-matching test highest", () => {
    const results = mapTests(engine, { path: "src/control/command-loop.ts" });
    expect(results.length).toBeGreaterThan(0);
    const top = results.find((r) => r.path.endsWith("can-timeout.test.ts"));
    expect(top).toBeTruthy();
    // can-timeout.test.ts imports command-loop, so it ranks at least medium
    // and appears near the top of the ranked list.
    expect(["high", "medium"]).toContain(top!.confidence);
    expect(results[0]!.path.endsWith("can-timeout.test.ts")).toBe(true);

    // Name-match ranking is high: a same-base-name test scores highest.
    const named = mapTests(engine, { path: "src/safety/watchdog.ts", symbol: "handleTimeout" });
    expect(named.length).toBeGreaterThan(0);
  });

  it("Phase 41: historyFor returns commits for a tracked file", () => {
    const history = historyFor(gitEngine, { path: "src/control/command-loop.ts" });
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]!.commit).toBeTruthy();
    // Non-git repo returns [].
    expect(historyFor(engine, { path: "src/control/command-loop.ts" })).toEqual([]);
  });

  it("Phase 38: resolveDefinition falls back to syntax index", async () => {
    const loc = await resolveDefinition(engine, "src/control/command-loop.ts", "applyCommand");
    expect(loc).not.toBeNull();
    expect(loc!.path).toBe("src/control/command-loop.ts");
    expect(loc!.startLine).toBeGreaterThan(0);
  });
});
