// Production-safety milestone tests (Phases 34–37, 13).
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  scanText,
  redactSecrets,
  isBlockedPath,
  redactObject,
} from "../src/policy/secret.js";
import { AuditLog } from "../src/observability/audit.js";
import { EventBus } from "../src/observability/eventBus.js";
import { classifyRisk, runCommand } from "../src/coding-agent/tools/command.js";
import { PolicyEngine } from "../src/policy/policy.js";

describe("Phase 36 — secret protection", () => {
  it("scanText finds AWS keys and sk- tokens", () => {
    const text = "aws=AKIAIOSFODNN7EXAMPLE token=sk-1234567890abcdefghij end";
    const hits = scanText(text);
    const matches = hits.map((h) => h.match);
    expect(matches).toContain("AKIAIOSFODNN7EXAMPLE");
    expect(matches).toContain("sk-1234567890abcdefghij");
  });

  it("redactSecrets masks secrets", () => {
    const text = "aws=AKIAIOSFODNN7EXAMPLE token=sk-1234567890abcdefghij";
    const red = redactSecrets(text);
    expect(red).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(red).not.toContain("sk-1234567890abcdefghij");
    expect(red).toContain("***REDACTED***");
  });

  it("isBlockedPath blocks .env", () => {
    expect(isBlockedPath(".env")).toBe(true);
    expect(isBlockedPath("config/.env.production")).toBe(true);
    expect(isBlockedPath("src/index.ts")).toBe(false);
  });

  it("redactObject masks nested secret strings", () => {
    const obj = { a: { b: "key sk-1234567890abcdefghij here" }, c: 5 };
    const red = redactObject(obj) as any;
    expect(red.a.b).toContain("***REDACTED***");
    expect(red.a.b).not.toContain("sk-1234567890abcdefghij");
    expect(red.c).toBe(5);
  });
});

describe("Phase 37 — audit log", () => {
  it("records events from the bus and redacts secrets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deep-audit-"));
    const audit = new AuditLog(dir);
    const bus = new EventBus();
    audit.attach(bus);

    await bus.publish({
      type: "ToolCallCompleted",
      sessionId: "s1",
      role: "main",
      tool: "read_file",
      callId: "c1",
      ok: true,
      timestamp: Date.now(),
    });

    const entries = audit.query();
    expect(entries.length).toBeGreaterThanOrEqual(1);

    audit.record({ secret: "sk-1234567890abcdefghij" });
    const all = audit.query();
    const withSecret = all.find((e) => "secret" in e);
    expect(withSecret).toBeDefined();
    expect(withSecret!.secret).toBe("***REDACTED***");
  });
});

describe("Phase 35/13 — command classification & runner", () => {
  it("classifies risk", () => {
    expect(classifyRisk("rm -rf /")).toBe("high");
    expect(classifyRisk("echo hi")).toBe("low");
    expect(classifyRisk("npm install lodash")).toBe("medium");
  });

  it("runCommand works for a safe command", async () => {
    const res = await runCommand(process.cwd(), "echo hello", { timeoutMs: 10_000 });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("hello");
    expect(res.risk).toBe("low");
  });
});

describe("Phase 34 — policy", () => {
  it("denies git_push when denyGitPush true", () => {
    const engine = new PolicyEngine({
      denyGitPush: true,
      requireApprovalForWrite: false,
      requireApprovalForCommand: [],
    });
    const d = engine.decide("main", "git_push");
    expect(d.allowed).toBe(false);
  });

  it("denies research-worker calling apply_patch", () => {
    const engine = new PolicyEngine({
      denyGitPush: false,
      requireApprovalForWrite: false,
      requireApprovalForCommand: [],
    });
    const d = engine.decide("research-worker", "apply_patch");
    expect(d.allowed).toBe(false);
  });
});

describe("Phase 34 — command risk + write gating", () => {
  it("classifies run_command risk server-side (rm -rf is high)", () => {
    const engine = new PolicyEngine({
      denyGitPush: true,
      requireApprovalForWrite: false,
      requireApprovalForCommand: ["high"],
    });
    const d = engine.decide("main", "run_command", { command: "rm -rf /" });
    expect(d.allowed).toBe(true);
    expect(d.requiresApproval).toBe(true);
    expect(d.reason).toContain("high");
  });

  it("ignores caller-supplied risk and still gates destructive commands", () => {
    const engine = new PolicyEngine({
      denyGitPush: true,
      requireApprovalForWrite: false,
      requireApprovalForCommand: ["high"],
    });
    // A caller labelling a destructive command as "low" must NOT bypass approval.
    const d = engine.decide("main", "run_command", { command: "rm -rf /", risk: "low" });
    expect(d.requiresApproval).toBe(true);
  });

  it("does not require approval for low-risk commands", () => {
    const engine = new PolicyEngine({
      denyGitPush: true,
      requireApprovalForWrite: false,
      requireApprovalForCommand: ["high"],
    });
    const d = engine.decide("main", "run_command", { command: "echo hello" });
    expect(d.requiresApproval).toBe(false);
  });

  it("gates edit_file behind write approval like apply_patch", () => {
    const engine = new PolicyEngine({
      denyGitPush: true,
      requireApprovalForWrite: true,
      requireApprovalForCommand: ["high"],
    });
    expect(engine.decide("main", "edit_file", { path: "a.md" }).requiresApproval).toBe(true);
    expect(engine.decide("main", "apply_patch", { files: [] }).requiresApproval).toBe(true);
  });

  it("permits writes without approval when requireApprovalForWrite is false", () => {
    const engine = new PolicyEngine({
      denyGitPush: true,
      requireApprovalForWrite: false,
      requireApprovalForCommand: ["high"],
    });
    expect(engine.decide("main", "edit_file", { path: "a.md" }).requiresApproval).toBe(false);
  });
});
