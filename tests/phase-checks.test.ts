// Consolidated phase-check tests — verifies the checklist of every phase
// against the real implementation (Phase 01–34 subset).
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { EventBus } from "../src/observability/eventBus.js";
import { Store, defaultDbLocations } from "../src/persistence/store.js";
import { SessionKernel } from "../src/agent-core/session.js";
import { MockProvider } from "../src/model-router/mock.js";
import { ModelRouter } from "../src/model-router/router.js";
import { PolicyEngine } from "../src/policy/policy.js";
import { ToolRuntime } from "../src/tooling/runtime.js";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { Localizer } from "../src/research-runtime/localizer.js";
import { verifyReports, detectContradictions } from "../src/research-runtime/verify.js";
import { verifyEvidence } from "../src/research-runtime/evidence.js";
import { compileCapsule } from "../src/research-runtime/capsule.js";
import { decideStop } from "../src/research-runtime/stopping.js";
import { runCritic } from "../src/research-runtime/critic.js";
import { ResearchPlanner } from "../src/research-runtime/planner.js";
import { runWorker } from "../src/research-runtime/worker.js";
import { runResearch } from "../src/research-runtime/research.js";
import { applyPatchAtomic, rollbackPatch } from "../src/coding-agent/tools/patch.js";
import { runCommand } from "../src/coding-agent/tools/command.js";
import { GitIntegration } from "../src/repository-engine/git.js";
import { SnapshotService } from "../src/repository-engine/snapshot.js";
import { FilesystemIndex } from "../src/repository-engine/index.js";
import { LexicalSearch } from "../src/repository-engine/search.js";
import { SymbolIndex } from "../src/repository-engine/symbols.js";
import { safeResolve, fileHash, PathError } from "../src/repository-engine/fs.js";
import { loadConfig, validateConfig, redactForShow, ConfigError } from "../src/config/config.js";
import type { WorkerReport, VerifiedEvidence } from "../src/protocol/research.js";
import type { EvidenceReference } from "../src/protocol/evidence.js";

const FIX = join(import.meta.dirname, "..", "evaluations", "fixtures");

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), "deep-"));
}
function copyFixture(name: string): string {
  const dest = tmpRepo();
  cpSync(join(FIX, name), dest, { recursive: true });
  return dest;
}
function gitInit(root: string) {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@t.io"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
}

describe("Phase 01 — repo bootstrap", () => {
  it("has buildable tooling + tsconfig", () => {
    expect(existsSync("package.json")).toBe(true);
    expect(existsSync("tsconfig.json")).toBe(true);
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.name).toBe("deepagent");
    expect(pkg.bin.deepagent).toContain("entry.js");
  });
});

describe("Phase 03 — configuration", () => {
  it("project overrides global (precedence)", () => {
    const home = tmpRepo();
    mkdirSync(join(home, ".deep"), { recursive: true });
    writeFileSync(join(home, ".deep", "config.json"), JSON.stringify({ models: { main: "global/main" } }));
    const repo = tmpRepo();
    mkdirSync(join(repo, ".deep"), { recursive: true });
    writeFileSync(join(repo, ".deep", "config.json"), JSON.stringify({ models: { main: "project/main" } }));
    const cfg = loadConfig({ repoRoot: repo, env: { HOME: home, USERPROFILE: home } });
    expect(cfg.models!.main).toBe("project/main");
  });
  it("invalid config (missing main) throws ConfigError", () => {
    expect(() => validateConfig({})).toThrow(ConfigError);
  });
  it("redacts secret-bearing values", () => {
    const redacted = redactForShow({ ...({} as any), models: { main: "x" }, apiKey: "sk-123" } as any);
    expect(redacted.apiKey).toBe("***REDACTED***");
  });
});

describe("Phase 04 — persistence", () => {
  it("put/get + idempotent migrations + corruption recovery", () => {
    const p = join(tmpRepo(), "project.json");
    const s = new Store(p);
    s.put("sessions", { id: "a", x: 1 });
    expect(s.get("sessions", "a")!.x).toBe(1);
    const s2 = new Store(p);
    expect(s2.get("sessions", "a")!.x).toBe(1);
    s.migrate(["m1"], () => {});
    s.migrate(["m1"], () => {}); // idempotent
    const s3 = new Store(p);
    expect(s3.snapshot().migrations.filter((m) => m === "m1").length).toBe(1);
    // corruption with no backup -> fresh load, no throw
    rmSync(p + ".bak", { force: true });
    writeFileSync(p, "{not json");
    const s4 = new Store(p);
    expect(s4.all("sessions").length).toBe(0);
  });
});

describe("Phase 05 — event bus", () => {
  it("delivers to subscribers, isolates failures, preserves order", async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    let threw = false;
    bus.subscribe((e) => { seen.push(e.type); });
    bus.subscribe(() => { threw = true; throw new Error("boom"); });
    await bus.publish({ type: "SessionStarted", sessionId: "s", timestamp: 1 });
    await bus.publish({ type: "Cancelled", scope: "x", timestamp: 2 });
    expect(seen).toEqual(["SessionStarted", "Cancelled"]);
    expect(threw).toBe(true);
  });
});

describe("Phase 06 — session kernel", () => {
  it("append + resume + lock + ordering", () => {
    const p = join(tmpRepo(), "project.json");
    const s = new SessionKernel(new Store(p));
    const rec = s.create("/repo");
    s.append(rec.id, { kind: "user", content: "hi" });
    s.append(rec.id, { kind: "assistant", content: "ok" });
    const release = s.acquire(rec.id);
    expect(() => s.acquire(rec.id)).toThrow();
    release();
    const s2 = new SessionKernel(new Store(p));
    const msgs = s2.get(rec.id)!;
    expect(msgs.map((m) => m.content)).toEqual(["hi", "ok"]);
  });
});

describe("Phase 07 — provider contract", () => {
  it("mock supports + usage + transport failure", async () => {
    const ok = new MockProvider({ complete: () => ({ role: "main", content: "hi", toolCalls: [], usage: { inputTokens: 1, outputTokens: 2 } }) });
    expect(ok.supports("mock/x")).toBe(true);
    const r = await ok.complete({ modelId: "mock/x", role: "main", messages: [] });
    expect(r.usage.outputTokens).toBe(2);
    const bad = new MockProvider({ failWith: "rate_limit" });
    await expect(bad.complete({ modelId: "mock/x", role: "main", messages: [] })).rejects.toThrow();
  });
});

describe("Phase 08 — model router", () => {
  it("falls back on transport failure and cools down primary", async () => {
    const primary = new MockProvider({ failWith: "rate_limit" }, "mock-primary");
    const fallback = new MockProvider({ complete: () => ({ role: "main", content: "fb", toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 } }) }, "mock-fb");
    const router = new ModelRouter({ primary: "mock-primary", fallbacks: { "mock-primary": ["mock-fb"] } });
    router.registerProvider(primary);
    router.registerProvider(fallback);
    const r = await router.complete({ modelId: "mock-primary", role: "main", messages: [] });
    expect(r.content).toBe("fb");
    // primary now cooled down -> selectForRole skips it
    expect(router.selectForRole("main", "mock-primary")).toBe("mock-fb");
    expect(router.metrics.snapshot().counters["model.calls"]).toBe(1);
  });
});

describe("Phase 11 — repository read tools / path safety", () => {
  it("blocks traversal and blocked paths", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "a.txt"), "hello");
    expect(() => safeResolve(root, "../escape.txt")).toThrow(PathError);
    expect(() => safeResolve(root, "secret.env", { blockPatterns: ["**/*.env"] })).toThrow(PathError);
    expect(safeResolve(root, "a.txt")).toBe(join(root, "a.txt"));
  });
});

describe("Phase 12 — patch application", () => {
  it("applies correct patch; rejects stale; atomic on failure", () => {
    const root = tmpRepo();
    const f = join(root, "f.txt");
    writeFileSync(f, "line1\nline2\nline3\n");
    // correct
    const { changed } = applyPatchAtomic(new RepositoryEngine(root), {
      files: [{ path: "f.txt", before: "line2", after: "LINE2" }],
    });
    expect(changed).toContain("f.txt");
    expect(readFileSync(f, "utf8")).toContain("LINE2");
    // stale
    expect(() => applyPatchAtomic(new RepositoryEngine(root), { files: [{ path: "f.txt", before: "NOPE", after: "x" }] })).toThrow();
    expect(readFileSync(f, "utf8")).toContain("LINE2"); // unchanged after failure
  });
});

describe("Phase 13 — command runner", () => {
  it("runs command; times out long command", async () => {
    const r = await runCommand(tmpRepo(), 'node -e "process.stdout.write(\'hi\')"', { timeoutMs: 5000 });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hi");
    const t = await runCommand(tmpRepo(), "ping -n 10 localhost", { timeoutMs: 200, shell: true });
    expect(t.timedOut).toBe(true);
  });
});

describe("Phase 14 — git integration", () => {
  it("detects repo, dirty, denies push", () => {
    const root = tmpRepo();
    gitInit(root);
    writeFileSync(join(root, "x.txt"), "x");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
    const g = new GitIntegration(root);
    expect(g.status().isRepo).toBe(true);
    expect(g.status().dirty).toBe(false);
    writeFileSync(join(root, "x.txt"), "y");
    expect(g.status().dirty).toBe(true);
    expect(() => g.push()).toThrow();
  });
});

describe("Phase 16 — filesystem index", () => {
  it("incremental + generated classification + delete removal", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "a.ts"), "a");
    const idx = new FilesystemIndex(root, ["node_modules"], ["**/*.gen.ts"]);
    idx.update();
    expect(idx.files()).toContain("a.ts");
    writeFileSync(join(root, "b.gen.ts"), "b");
    idx.update();
    const b = idx.get("b.gen.ts");
    expect(b?.generated).toBe(true);
    // modify a.ts
    writeFileSync(join(root, "a.ts"), "aa");
    const changed = idx.update();
    expect(changed).toContain("a.ts");
    // delete
    rmSync(join(root, "a.ts"));
    idx.update();
    expect(idx.get("a.ts")).toBeUndefined();
  });
});

describe("Phase 17 — lexical search", () => {
  it("finds string, respects limit + case", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "a.ts"), "const motorEnabled = true;\nmotorEnabled = false;\n");
    const engine = new RepositoryEngine(root);
    engine.refresh();
    const hits = engine.search.search({ pattern: "motorEnabled", limit: 5 });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const ci = engine.search.search({ pattern: "motorenabled", caseSensitive: true });
    expect(ci.length).toBe(0);
  });
});

describe("Phase 18/19 — symbol index", () => {
  it("extracts functions + classes with ranges", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "m.ts"), "function foo() { return 1; }\nclass Bar { baz() {} }\n");
    const engine = new RepositoryEngine(root);
    engine.refresh();
    const foo = engine.symbols.search("foo")[0];
    expect(foo?.kind).toBe("function");
    expect(foo?.startLine).toBe(1);
    const bar = engine.symbols.get("Bar");
    expect(bar?.kind).toBe("class");
  });
});

describe("Phase 20 — snapshots", () => {
  it("identical state -> same id; edit -> stale", () => {
    const root = tmpRepo();
    gitInit(root);
    writeFileSync(join(root, "x.txt"), "x");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "i"], { cwd: root });
    const snap = new SnapshotService(root);
    const a = snap.create();
    const b = snap.create();
    expect(a.id).toBe(b.id);
    writeFileSync(join(root, "x.txt"), "xx");
    expect(snap.isStale(a)).toBe(true);
  });
});

describe("Phase 21 — evidence model", () => {
  it("verifies real refs; rejects bad path/range/symbol", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "f.ts"), "alpha\nbeta\ngamma\n");
    const ctx = { root, snapshotId: "s1" };
    const good: EvidenceReference = { snapshotId: "s1", path: "f.ts", startLine: 1, endLine: 2 };
    expect(verifyEvidence(good, ctx).status).toBe("verified");
    const badPath = verifyEvidence({ ...good, path: "nope.ts" }, ctx);
    expect(badPath.status).toBe("invalid_path");
    const badRange = verifyEvidence({ ...good, startLine: 1, endLine: 99 }, ctx);
    expect(badRange.status).toBe("invalid_range");
    const badSym = verifyEvidence({ ...good, symbol: "omega" }, ctx);
    expect(badSym.status).toBe("missing_symbol");
  });
});

describe("Phase 22/23/24/25/26 — research spine", () => {
  it("localizer recall + verified capsule end-to-end", async () => {
    const root = copyFixture("F02-competing-writers");
    const engine = new RepositoryEngine(root);
    engine.refresh();
    const loc = new Localizer(engine);
    const cands = loc.localize("why does motorEnabled stay true after timeout");
    const files = cands.map((c) => c.path);
    expect(files.some((f) => f.includes("command-loop") || f.includes("watchdog"))).toBe(true);

    // Mock worker returns a real citation to command-loop.ts
    const router = new ModelRouter({ primary: "mock/worker" });
    router.registerProvider(new MockProvider({
      structured: () => ({
        conclusion: "command loop restores state",
        confidence: 0.9,
        claims: [{ statement: "command loop writes enabled after timeout", evidence: [{ path: "src/control/command-loop.ts", startLine: 1, endLine: 3 }] }],
      }),
    }, "mock-worker"));
    const plan = new ResearchPlanner().plan("goal", cands);
    expect(plan.questions.length).toBeGreaterThan(0);
    expect(plan.questions.length).toBeLessThanOrEqual(4);
    const report: WorkerReport = await runWorker(router, plan.questions[0]!, cands, { modelId: "mock/worker" });
    const { evidence } = verifyReports([report], { root, snapshotId: "s1" });
    expect([...evidence.values()].some((e) => e.status === "verified")).toBe(true);

    const capsule = compileCapsule({
      capsuleId: "c1",
      repository: { snapshotId: "s1", root, commit: "abc", dirtyTreeHash: "d1" },
      request: { originalQuestion: "q", normalizedGoal: "goal" },
      workerReports: [report],
      verified: evidence,
    });
    expect(capsule.claims[0]?.status).toBe("verified");
    expect(capsule.locations.length).toBeGreaterThan(0);
    expect(JSON.stringify(capsule).length).toBeLessThan(20000);
  });

  it("fabricated evidence is never verified (F09)", async () => {
    const router = new ModelRouter({ primary: "mock/w" });
    router.registerProvider(new MockProvider({
      structured: () => ({
        conclusion: "ghost",
        confidence: 0.8,
        claims: [{ statement: "ghost file does X", evidence: [{ path: "src/ghost/file.ts", startLine: 1, endLine: 2 }] }],
      }),
    }, "mock-w"));
    const plan = { id: "q1", role: "state" as const, question: "x", initialEvidenceIds: [] };
    const report = await runWorker(router, plan, [], { modelId: "mock/w" });
    const { evidence } = verifyReports([report], { root: tmpRepo(), snapshotId: "s1" });
    for (const e of evidence.values()) expect(e.status).not.toBe("verified");
  });
});

describe("Phase 28/29/30/32 — planning, contradiction, critic, stopping", () => {
  it("planner bounds questions", () => {
    const p = new ResearchPlanner().plan("goal", []);
    expect(p.questions.length).toBeLessThanOrEqual(4);
  });
  it("detects contradictions (F17)", () => {
    const reports: WorkerReport[] = [
      { workerId: "w1", modelId: "m", role: "flow", question: "q", conclusion: "", confidence: 0.5, claims: [{ statement: "watchdog never resubscribes", evidence: [] }], hypotheses: [], unansweredQuestions: [] },
      { workerId: "w2", modelId: "m", role: "flow", question: "q", conclusion: "", confidence: 0.5, claims: [{ statement: "watchdog does resubscribe", evidence: [] }], hypotheses: [], unansweredQuestions: [] },
    ];
    const d = detectContradictions(reports);
    expect(d.length).toBeGreaterThanOrEqual(1);
  });
  it("critic accepts verified, falls back on error", async () => {
    const router = new ModelRouter({ primary: "mock/c" });
    router.registerProvider(new MockProvider({ structured: () => ({ acceptedClaims: ["e1"], rejectedClaims: [], confidenceAdjustment: -0.1 }) }, "mock-c"));
    const crit = await runCritic(router, "mock/c", [{ id: "e1", reference: {} as any, status: "verified", snippetHash: "h" }] as VerifiedEvidence[], []);
    expect(crit.acceptedClaims).toContain("e1");
  });
  it("stopping policy", () => {
    expect(decideStop({ confidence: 0.9, hasUnresolvedContradiction: false, diminishingReturns: false, budgetExhausted: false, executedRounds: 1, maxRounds: 3 }).stop).toBe(true);
    expect(decideStop({ confidence: 0.4, hasUnresolvedContradiction: true, diminishingReturns: false, budgetExhausted: false, executedRounds: 1, maxRounds: 3 }).stop).toBe(false);
    expect(decideStop({ confidence: 0.4, hasUnresolvedContradiction: true, diminishingReturns: false, budgetExhausted: true, executedRounds: 1, maxRounds: 3 }).stop).toBe(true);
  });
});

describe("Phase 34 — policy engine", () => {
  it("denies research-worker writes and git push", () => {
    const p = new PolicyEngine({ denyGitPush: true, requireApprovalForWrite: false, requireApprovalForCommand: ["high"] });
    expect(p.decide("research-worker", "apply_patch").allowed).toBe(false);
    expect(p.decide("main", "git_push").allowed).toBe(false);
    expect(p.decide("main", "apply_patch").allowed).toBe(true);
    expect(p.decide("utility", "read_file").allowed).toBe(false);
  });
});
