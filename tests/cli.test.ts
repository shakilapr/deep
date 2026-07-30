import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfig,
  validateConfig,
  redactForShow,
  ConfigError,
} from "../src/config/config.js";
import { parseArgs, runCommand } from "../src/cli/entry.js";
import { printResearchProgress, printDiff, printMessage, printCost } from "../src/cli/tui.js";
import { runResearch } from "../src/research-runtime/research.js";
import { RepositoryEngine } from "../src/repository-engine/engine.js";
import { ModelRouter } from "../src/model-router/router.js";
import { MockProvider } from "../src/model-router/mock.js";

let repoDir: string;
let homeDir: string;
const oldHome = process.env.HOME;

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), "deep-repo-"));
  homeDir = mkdtempSync(join(tmpdir(), "deep-home-"));
  mkdirSync(join(repoDir, ".deep"), { recursive: true });
  writeFileSync(
    join(repoDir, ".deep", "config.json"),
    JSON.stringify({ models: { main: "mock/x" } }),
  );
  mkdirSync(join(homeDir, ".deep"), { recursive: true });
  writeFileSync(
    join(homeDir, ".deep", "config.json"),
    JSON.stringify({ research: { maxWorkers: 2 } }),
  );
  process.env.HOME = homeDir;
});

afterAll(() => {
  process.env.HOME = oldHome;
  rmSync(repoDir, { recursive: true, force: true });
  rmSync(homeDir, { recursive: true, force: true });
});

describe("Phase 03 — config", () => {
  it("loads project config over defaults and global", () => {
    const cfg = loadConfig({ repoRoot: repoDir });
    expect(cfg.models?.main).toBe("mock/x");
    expect(cfg.source).toContain("defaults");
  });

  it("validateConfig throws ConfigError when models.main missing", () => {
    expect(() => validateConfig({ models: {} as never })).toThrow(ConfigError);
  });

  it("redactForShow hides apiKey fields", () => {
    const cfg = loadConfig({ repoRoot: repoDir }) as Record<string, unknown>;
    cfg.apiKey = "sk-123";
    const shown = redactForShow(cfg as never);
    expect(shown.apiKey).toBe("***REDACTED***");
  });
});

describe("Phase 02 — CLI parsing", () => {
  it("parses --help and -h", () => {
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs(["-h"]).command).toBe("help");
    expect(parseArgs([]).command).toBe("repl");
  });

  it("parses --version", () => {
    expect(parseArgs(["--version"]).command).toBe("version");
    expect(parseArgs(["-v"]).command).toBe("version");
  });

  it("parses a task string", () => {
    const p = parseArgs(["fix the bug"]);
    expect(p).toEqual({ command: "task", task: "fix the bug", yes: false });
  });

  it("parses research question", () => {
    const p = parseArgs(["research", "why does X fail"]);
    expect(p).toEqual({ command: "research", question: "why does X fail", depth: "normal" });
  });

  it("parses --depth flag out of the research question", () => {
    const p = parseArgs(["research", "why does X fail", "--depth", "quick"]);
    expect(p).toEqual({ command: "research", question: "why does X fail", depth: "quick" });
    const p2 = parseArgs(["research", "--depth=deep", "why does X fail"]);
    expect(p2).toEqual({ command: "research", question: "why does X fail", depth: "deep" });
  });

  it("parses config subcommands, doctor, sessions", () => {
    expect(parseArgs(["config", "show"]).command).toBe("config-show");
    expect(parseArgs(["config", "validate"]).command).toBe("config-validate");
    expect(parseArgs(["doctor"]).command).toBe("doctor");
    expect(parseArgs(["resume"]).command).toBe("sessions");
    expect(parseArgs(["sessions"]).command).toBe("sessions");
  });

  it("runCommand help/version exit 0 and print", async () => {
    const lines: string[] = [];
    expect(await runCommand(["--help"], { out: (l) => lines.push(l) })).toBe(0);
    expect(lines.join("\n")).toContain("Usage");
    expect(await runCommand(["--version"], { out: (l) => lines.push(l) })).toBe(0);
  });

  it("config show prints resolved config from cwd", async () => {
    const lines: string[] = [];
    const code = await runCommand(["config", "show"], { cwd: repoDir, out: (l) => lines.push(l) });
    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.models.main).toBe("mock/x");
  });

  it("config validate prints valid", async () => {
    const lines: string[] = [];
    const code = await runCommand(["config", "validate"], { cwd: repoDir, out: (l) => lines.push(l) });
    expect(code).toBe(0);
    expect(lines).toContain("valid");
  });

  it("doctor reports model/provider readiness", async () => {
    const lines: string[] = [];
    // Clear any ambient model config so the readiness line is deterministic.
    const oldKey = process.env.OPENROUTER_API_KEY;
    const oldModel = process.env.DEEP_MODEL;
    const oldModelsMain = process.env.DEEP_MODELS_MAIN;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DEEP_MODEL;
    delete process.env.DEEP_MODELS_MAIN;
    try {
      const code = await runCommand(["doctor"], { cwd: repoDir, out: (l) => lines.push(l) });
      expect(code).toBe(0);
      expect(lines.join("\n")).toMatch(/model:/);
    } finally {
      process.env.OPENROUTER_API_KEY = oldKey;
      process.env.DEEP_MODEL = oldModel;
      process.env.DEEP_MODELS_MAIN = oldModelsMain;
    }
  });
});

describe("Phase 15 — TUI", () => {
  it("printResearchProgress renders step states", () => {
    const lines: string[] = [];
    printResearchProgress(
      [
        { label: "plan", state: "done" },
        { label: "workers", state: "running" },
        { label: "capsule", state: "pending" },
      ],
      (l) => lines.push(l),
    );
    expect(lines[0]).toContain("[x] plan");
    expect(lines[1]).toContain("[>] workers");
    expect(lines[2]).toContain("[ ] capsule");
  });

  it("printDiff shows path and diff markers", () => {
    const lines: string[] = [];
    printDiff("src/a.ts", "old line\nsame", "new line\nsame", (l) => lines.push(l));
    const text = lines.join("\n");
    expect(text).toContain("diff src/a.ts");
    expect(text).toContain("- old line");
    expect(text).toContain("+ new line");
  });

  it("printMessage and printCost render text", () => {
    const lines: string[] = [];
    printMessage("assistant", "hello\nworld", (l) => lines.push(l));
    printCost({ calls: 3, inputTokens: 100, outputTokens: 50, costUsd: 0.1234 }, (l) => lines.push(l));
    expect(lines[0]).toBe("[deep] hello");
    expect(lines[1]).toBe("[deep] world");
    expect(lines[2]).toContain("3 calls");
  });
});

describe("End-to-end research spine", () => {
  it("verifies real evidence in a temp repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deep-e2e-"));
    try {
      writeFileSync(
        join(dir, "motor.ts"),
        "export const motorEnabled = true;\nexport function toggleMotor() {\n  return !motorEnabled;\n}\n",
      );
      const engine = new RepositoryEngine(dir);
      engine.refresh();
      const mock = new MockProvider(
        {
          structured: () => ({
            conclusion: "motorEnabled controls the motor state",
            confidence: 0.9,
            claims: [
              {
                statement: "motorEnabled is defined in motor.ts",
                evidence: [{ path: "motor.ts", startLine: 1, endLine: 3 }],
              },
            ],
          }),
        },
        "mock",
      );
      const router = new ModelRouter({ primary: "mock/worker" });
      router.register(mock, ["mock/worker", "mock/critic", "mock/main"]);
      const snapshotId = engine.snapshots.create().id;
      const capsule = await runResearch(
        { question: "where is motorEnabled set?", depth: "quick" },
        { engine, router, root: dir, snapshotId },
      );
      expect(capsule.claims.length).toBeGreaterThan(0);
      expect(capsule.claims[0]!.status).toBe("verified");
      expect(capsule.locations.length).toBeGreaterThan(0);
      expect(capsule.locations[0]!.path).toBe("motor.ts");
      expect(capsule.conclusion.summary).toContain("motorEnabled");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
