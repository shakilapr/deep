import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { applyPatchAtomic } from "../src/coding-agent/tools/patch.js";

describe("patch rollback restores to the repo file (cwd != root)", () => {
  it("restores original content after a stale patch, regardless of process.cwd()", () => {
    const dir = mkdtempSync(join(tmpdir(), "deep-rollback-"));
    const filePath = "f.txt";
    writeFileSync(join(dir, filePath), "ORIGINAL\n");
    const engine = new RepositoryEngine(dir);
    engine.refresh();

    // A stale patch (before not present) triggers restore(); previously this
    // moved the backup to process.cwd()/f.txt, corrupting the rollback.
    expect(() =>
      applyPatchAtomic(engine, { files: [{ path: filePath, before: "NOPE", after: "X" }] }),
    ).toThrow();

    // The repo file must still hold the original content.
    const after = readFileSync(join(dir, filePath), "utf8");
    expect(after).toBe("ORIGINAL\n");

    // And no stray backup or orphan file should have been created in cwd.
    expect(() => readFileSync(join(process.cwd(), filePath), "utf8")).toThrow();
  });
});