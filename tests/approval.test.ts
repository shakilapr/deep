import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ModelRouter } from "../src/model-router/router.js";
import { MockProvider } from "../src/model-router/mock.js";
import { PolicyEngine } from "../src/policy/policy.js";
import { EventBus } from "../src/observability/eventBus.js";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { buildToolRuntime } from "../src/coding-agent/tools/index.js";
import { runAgentLoop } from "../src/agent-core/agentLoop.js";
import { parseArgs } from "../src/cli/entry.js";
import { buildApproval } from "../src/cli/approval.js";
import type { ModelResponse, ModelRequest } from "../src/protocol/model.js";

let root: string;
let engine: RepositoryEngine;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "deep-approval-"));
  mkdirSync(join(root, ".deep", "index"), { recursive: true });
  writeFileSync(join(root, "hello.txt"), "hello world foo\n", "utf8");
  engine = new RepositoryEngine(root);
  engine.refresh();
});
afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function routerReturning(toolCalls: ModelResponse["toolCalls"], final: string): ModelRouter {
  const router = new ModelRouter({ primary: "mock/main" });
  let calls = 0;
  router.register(
    new MockProvider({
      complete: (req: ModelRequest) => {
        calls++;
        if (calls === 1) {
          return {
            role: req.role,
            content: "",
            toolCalls,
            usage: { inputTokens: 1, outputTokens: 1 },
          } as ModelResponse;
        }
        return { role: req.role, content: final, toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } } as ModelResponse;
      },
    }),
    ["mock/main"],
  );
  return router;
}

describe("parseArgs --yes flag", () => {
  it("strips --yes and marks yes on task", () => {
    const p = parseArgs(["--yes", "fix the bug"]);
    expect(p).toEqual({ command: "task", task: "fix the bug", yes: true });
  });
  it("strips -y anywhere and keeps the rest of the task", () => {
    const p = parseArgs(["-y", "rm", "-rf"]);
    expect(p).toEqual({ command: "task", task: "rm -rf", yes: true });
  });
  it("repl with --yes", () => {
    expect(parseArgs(["--yes"])).toEqual({ command: "repl", yes: true });
    expect(parseArgs([])).toEqual({ command: "repl", yes: false });
  });
});

describe("buildApproval", () => {
  it("auto-approves when --yes style flag is given", async () => {
    const fn = buildApproval(true, () => {});
    expect(await fn("apply_patch")).toBe(true);
  });
  it("denies and reports when non-interactive", async () => {
    const lines: string[] = [];
    const fn = buildApproval(false, (l) => lines.push(l));
    expect(await fn("rm -rf /")).toBe(false);
    expect(lines.join("\n")).toMatch(/non-interactive/);
  });
});

describe("agent loop honors requestApproval", () => {
  const policy = (writeApproval: boolean) =>
    new PolicyEngine({
      denyGitPush: true,
      requireApprovalForWrite: writeApproval,
      requireApprovalForCommand: ["high"],
    });

  const makeDeps = (router: ModelRouter, requestApproval: (a: string) => Promise<boolean>) => ({
    router,
    toolRuntime: buildToolRuntime(engine, policy(true), new EventBus()),
    policy: policy(true),
    root,
    sessionId: "s1",
    requestApproval,
  });

  it("denies a write when approval is refused", async () => {
    const router = routerReturning(
      [{ id: "c1", name: "apply_patch", arguments: { files: [{ path: "hello.txt", before: "hello world foo", after: "hello patched foo" }] } }],
      "done",
    );
    const res = await runAgentLoop("edit the file", makeDeps(router, async () => false));
    expect(res.final).toBe("done");
    expect(readFileSync(join(root, "hello.txt"), "utf8")).toBe("hello world foo\n");
  });

  it("applies a write when approval is granted", async () => {
    const router = routerReturning(
      [{ id: "c1", name: "apply_patch", arguments: { files: [{ path: "hello.txt", before: "hello world foo", after: "hello patched foo" }] } }],
      "done",
    );
    const res = await runAgentLoop("edit the file", makeDeps(router, async () => true));
    expect(res.final).toBe("done");
    expect(readFileSync(join(root, "hello.txt"), "utf8")).toContain("hello patched foo");
  });
});
