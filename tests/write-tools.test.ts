import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { writeTools } from "../src/coding-agent/tools/writeTools.js";
import { PolicyEngine } from "../src/policy/policy.js";

function ctx(root: string) {
  return { role: "main", sessionId: "s", repoRoot: root, canApprove: true, requestApproval: async () => true } as any;
}

describe("write_file / edit_file (.md capability)", () => {
  let dir: string;
  it("write_file creates a .md file", async () => {
    dir = mkdtempSync(join(tmpdir(), "deep-write-"));
    const engine = new RepositoryEngine(dir);
    engine.refresh();
    const tools = writeTools(engine);
    const wf = tools.find((t) => t.definition.name === "write_file")!;
    const r = await wf.run({ path: "docs/NOTES.md", content: "# Title\nbody\n" }, ctx(dir));
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, "docs/NOTES.md"), "utf8")).toContain("# Title");
  });

  it("edit_file replaces an exact substring in .md", async () => {
    const engine = new RepositoryEngine(dir);
    engine.refresh();
    const ef = writeTools(engine).find((t) => t.definition.name === "edit_file")!;
    const r = await ef.run({ path: "docs/NOTES.md", before: "body", after: "updated body" }, ctx(dir));
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, "docs/NOTES.md"), "utf8")).toContain("updated body");

    // createOnly guard
    const wf = writeTools(engine).find((t) => t.definition.name === "write_file")!;
    const guard = await wf.run({ path: "docs/NOTES.md", content: "x", createOnly: true }, ctx(dir));
    expect(guard.ok).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it("policy denies research-worker write/edit", () => {
    const p = new PolicyEngine({ denyGitPush: true, requireApprovalForWrite: false, requireApprovalForCommand: ["high"] });
    expect(p.decide("research-worker", "write_file").allowed).toBe(false);
    expect(p.decide("research-worker", "edit_file").allowed).toBe(false);
    expect(p.decide("main", "write_file").allowed).toBe(true);
  });
});