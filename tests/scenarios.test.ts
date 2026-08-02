import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "../src/cli/entry.js";

// Captured before any chdir so we can point at the real fixture directory.
const PROJECT_ROOT = process.cwd();

let repoDir: string;
let homeDir: string;
const oldHome = process.env.HOME;
const oldKey = process.env.OPENROUTER_API_KEY;
const oldModel = process.env.DEEP_MODEL;
const oldModelsMain = process.env.DEEP_MODELS_MAIN;

beforeAll(() => {
  homeDir = mkdtempSync(join(tmpdir(), "deep-scen-home-"));
  repoDir = mkdtempSync(join(tmpdir(), "deep-scen-repo-"));
  mkdirSync(join(repoDir, ".deep"), { recursive: true });
  mkdirSync(join(repoDir, "src"), { recursive: true });
  writeFileSync(join(repoDir, "src", "app.ts"), "export const x = 1;\n", "utf8");
  process.env.HOME = homeDir;
});
afterAll(() => {
  process.env.HOME = oldHome;
  process.env.OPENROUTER_API_KEY = oldKey;
  process.env.DEEP_MODEL = oldModel;
  process.env.DEEP_MODELS_MAIN = oldModelsMain;
  rmSync(homeDir, { recursive: true, force: true });
  rmSync(repoDir, { recursive: true, force: true });
});

interface RunResult {
  code: number;
  error?: unknown;
  lines: string[];
  out: string;
}

// Run a CLI command with an isolated cwd + env, capturing output lines.
async function run(args: string[], env: Record<string, string | undefined> = {}): Promise<RunResult> {
  const oldCwd = process.cwd();
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  process.chdir(repoDir);
  const lines: string[] = [];
  let code = -1;
  let error: unknown;
  try {
    code = await runCommand(args, { cwd: repoDir, out: (l) => lines.push(l) });
  } catch (e) {
    error = e;
  } finally {
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    process.chdir(oldCwd);
  }
  return { code, error, lines, out: lines.join("\n") };
}

function findJson(text: string): unknown {
  // Reports are pretty-printed (JSON.stringify(..., null, 2)), so they span
  // multiple lines. Extract the outermost {...} block and parse that.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const NO_MODEL = { OPENROUTER_API_KEY: undefined, DEEP_MODEL: undefined, DEEP_MODELS_MAIN: undefined };
const MOCK = { OPENROUTER_API_KEY: undefined, DEEP_MODEL: "mock/main" };

describe("user: brand-new, no configuration", () => {
  it("doctor still succeeds but reports no model configured", async () => {
    const r = await run(["doctor"], NO_MODEL);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/model:/);
    expect(r.out).toMatch(/NONE/);
  });

  it("research refuses to run instead of silently mocking", async () => {
    const r = await run(["research", "why does this break?"], NO_MODEL);
    expect(r.code).toBe(-1);
    expect(r.error).toBeDefined();
    expect(String((r.error as Error)?.message)).toMatch(/no model configured/i);
  });
});

describe("user: runs `deep` with an OpenRouter key (offline-safe)", () => {
  it("doctor reports the key without hitting the network", async () => {
    const r = await run(["doctor"], { OPENROUTER_API_KEY: "sk-test", DEEP_MODEL: undefined });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/OpenRouter key present/);
  });
});

describe("user: developer investigating with `research`", () => {
  it("produces a ResearchReport capsule end-to-end with the mock provider", async () => {
    const r = await run(["research", "where is x defined?"], MOCK);
    expect(r.code).toBe(0);
    const json = findJson(r.out) as { capsule?: unknown; levelCounts?: unknown };
    expect(json).toBeDefined();
    expect(json.capsule).toBeDefined();
    expect(json.levelCounts).toBeDefined();
  }, 30000);

  it("honors the --depth flag and still returns a capsule", async () => {
    const r = await run(["research", "where is x defined?", "--depth", "quick"], MOCK);
    expect(r.code).toBe(0);
    expect(findJson(r.out)).toBeDefined();
  }, 30000);
});

describe("user: reviewer running CI `review`", () => {
  it("emits an L-graded findings report", async () => {
    const r = await run(["review"], MOCK);
    expect(r.code).toBe(0);
    const json = findJson(r.out) as { levelCounts?: Record<string, number> };
    expect(json).toBeDefined();
    expect(json.levelCounts).toBeDefined();
  }, 30000);
});

describe("user: maintainer using read-only housekeeping commands", () => {
  it("`index` refreshes the repository index", async () => {
    const r = await run(["index"], NO_MODEL);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/index (refreshed|rebuilt)/);
  });

  it("`graph` prints dependency edges", async () => {
    const r = await run(["graph"], NO_MODEL);
    expect(r.code).toBe(0);
    expect(r.lines.length).toBeGreaterThan(0);
  });

  it("`audit` reports when there are no audit entries", async () => {
    const r = await run(["audit"], NO_MODEL);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/no audit entries/);
  });

  it("`config validate` reports a valid configuration", async () => {
    const r = await run(["config", "validate"], NO_MODEL);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/valid/);
  });
});

describe("user: evaluator checking a fixture", () => {
  it("runs the evaluation harness on a real fixture directory", async () => {
    const fixture = join(PROJECT_ROOT, "evaluations", "fixtures", "F02-competing-writers");
    const r = await run(["evaluate", fixture], MOCK);
    expect(r.code).toBe(0);
    const json = findJson(r.out) as { fixtureId?: string; verifiedEvidenceValidity?: number };
    expect(json).toBeDefined();
    expect(json.fixtureId).toBe("F02");
  }, 30000);
});
