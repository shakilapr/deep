// Phase 09/10/11/12/13 — agent loop + tool runtime integration tests
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
import { ToolError, ToolContext } from "../src/protocol/tools.js";
import type { ModelResponse, ModelRequest } from "../src/protocol/model.js";

let root: string;
let engine: RepositoryEngine;
let policy: PolicyEngine;
let bus: EventBus;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "deep-agent-loop-"));
  mkdirSync(join(root, ".deep", "index"), { recursive: true });
  writeFileSync(join(root, "hello.txt"), "hello world foo\n", "utf8");
  engine = new RepositoryEngine(root);
  engine.refresh();
  policy = new PolicyEngine({
    denyGitPush: true,
    requireApprovalForWrite: false,
    requireApprovalForCommand: [],
  });
  bus = new EventBus();
});

afterAll(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeRouter(complete: (req: ModelRequest) => ModelResponse): ModelRouter {
  const router = new ModelRouter({ primary: "mock/main" });
  router.register(new MockProvider({ complete }), ["mock/main"]);
  return router;
}

function deps(router: ModelRouter, runtime = buildToolRuntime(engine, policy, bus)) {
  return { router, toolRuntime: runtime ?? buildToolRuntime(engine, policy, bus), policy, root, sessionId: "s1", bus };
}

describe("Phase 09 — agent loop", () => {
  it("happy path: tool call then final answer", async () => {
    let calls = 0;
    const router = makeRouter((req) => {
      calls++;
      if (calls === 1) {
        return {
          role: req.role,
          content: "",
          toolCalls: [{ id: "c1", name: "search_text", arguments: { pattern: "foo" } }],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }
      return {
        role: req.role,
        content: "found foo in hello.txt",
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });
    const res = await runAgentLoop("find foo", deps(router));
    expect(res.final).toBe("found foo in hello.txt");
    expect(res.toolCalls).toBeGreaterThanOrEqual(1);
    expect(res.turns).toBeLessThanOrEqual(3);
    expect(res.cancelled).toBe(false);
  });

  it("max-turn/tool limits prevent infinite loops", async () => {
    const router = makeRouter((req) => ({
      role: req.role,
      content: "",
      toolCalls: [{ id: "cX", name: "search_text", arguments: { pattern: "foo" } }],
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const res = await runAgentLoop("loop forever", deps(router), {
      maxTurns: 5,
      maxToolCalls: 4,
    });
    expect(res.turns).toBeLessThanOrEqual(5);
    expect(res.toolCalls).toBeLessThanOrEqual(4);
    expect(res.final === "tool limit reached" || res.turns === 5).toBe(true);
  });

  it("cancellation via aborted signal", async () => {
    const router = makeRouter((req) => ({
      role: req.role,
      content: "should not run",
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const ac = new AbortController();
    ac.abort();
    const res = await runAgentLoop("cancel me", deps(router), { signal: ac.signal });
    expect(res.cancelled).toBe(true);
  });
});

describe("Phase 10 — tool runtime wiring", () => {
  it("registers expected tools", () => {
    const runtime = buildToolRuntime(engine, policy, bus);
    const names = runtime.list();
    for (const n of ["read_file", "apply_patch", "run_command", "git_status"]) {
      expect(names).toContain(n);
    }
  });

  it("unknown tool throws ToolError", async () => {
    const runtime = buildToolRuntime(engine, policy, bus);
    const ctx: ToolContext = {
      role: "main",
      sessionId: "s1",
      repoRoot: root,
      canApprove: true,
    };
    await expect(runtime.execute("nope_tool", {}, ctx)).rejects.toBeInstanceOf(ToolError);
  });

  it("research-worker denied for apply_patch", async () => {
    const runtime = buildToolRuntime(engine, policy, bus);
    const ctx: ToolContext = {
      role: "research-worker",
      sessionId: "s1",
      repoRoot: root,
      canApprove: false,
    };
    await expect(
      runtime.execute("apply_patch", { files: [] }, ctx),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

describe("Phase 11/12/13 — tool behavior", () => {
  const ctx = (): ToolContext => ({
    role: "main",
    sessionId: "s1",
    repoRoot: root,
    canApprove: true,
    requestApproval: async () => true,
  });

  it("read_file returns content", async () => {
    const runtime = buildToolRuntime(engine, policy, bus);
    const res = await runtime.execute("read_file", { path: "hello.txt" }, ctx());
    expect(res.ok).toBe(true);
    expect((res.data as any).content).toContain("hello world foo");
  });

  it("apply_patch modifies the file", async () => {
    const runtime = buildToolRuntime(engine, policy, bus);
    const res = await runtime.execute(
      "apply_patch",
      { files: [{ path: "hello.txt", before: "hello world foo", after: "hello patched foo" }] },
      ctx(),
    );
    expect(res.ok).toBe(true);
    const content = readFileSync(join(root, "hello.txt"), "utf8");
    expect(content).toContain("hello patched foo");
  });

  it("run_command executes with exit code 0", async () => {
    const runtime = buildToolRuntime(engine, policy, bus);
    const res = await runtime.execute(
      "run_command",
      { command: 'node -e "console.log(1)"' },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect((res.data as any).exitCode).toBe(0);
    expect((res.data as any).stdout).toContain("1");
  });
});
