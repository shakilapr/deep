// Phase 42 — cache invalidation engine
import { describe, it, expect } from "vitest";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { invalidateChanged, rebuildAll } from "../src/repository-engine/cacheInvalidation.js";

const FIX = join(import.meta.dirname, "..", "evaluations", "fixtures", "F02-competing-writers");

describe("Phase 42 — cache invalidation", () => {
  it("invalidates changed files without touching unrelated cache", () => {
    const root = mkdtempSync(join(tmpdir(), "deep-cache-"));
    cpSync(FIX, root, { recursive: true });
    const engine = new RepositoryEngine(root);
    engine.refresh();
    engine.graph.build();
    expect(engine.index.get("src/control/command-loop.ts")).toBeDefined();
    expect(engine.symbols.symbolsInFile("src/control/command-loop.ts").length).toBeGreaterThan(0);

    // Edit the file -> invalidate it.
    const report = invalidateChanged(engine, ["src/control/command-loop.ts"]);
    expect(report.removedFiles).toContain("src/control/command-loop.ts");
    expect(report.removedSymbols).toBeGreaterThan(0);
    expect(engine.index.get("src/control/command-loop.ts")).toBeUndefined();
    expect(engine.symbols.symbolsInFile("src/control/command-loop.ts")).toHaveLength(0);

    // Unrelated file still cached.
    expect(engine.index.get("src/safety/watchdog.ts")).toBeDefined();

    // Rebuild restores everything.
    rebuildAll(engine);
    expect(engine.index.get("src/control/command-loop.ts")).toBeDefined();
    expect(engine.symbols.symbolsInFile("src/control/command-loop.ts").length).toBeGreaterThan(0);
    rmSync(root, { recursive: true, force: true });
  });
});
