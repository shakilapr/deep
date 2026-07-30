import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wire } from "../src/cli/entry.js";

const FREE_PRIMARY = "openai/gpt-oss-20b:free";

let homeDir: string;
let workDir: string;
const oldCwd = process.cwd();
const oldHome = process.env.HOME;
const oldKey = process.env.OPENROUTER_API_KEY;
const realFetch = globalThis.fetch;

beforeAll(() => {
  homeDir = mkdtempSync(join(tmpdir(), "deep-disc-home-"));
  workDir = mkdtempSync(join(tmpdir(), "deep-disc-work-"));
  mkdirSync(join(workDir, ".deep"), { recursive: true });
  process.env.HOME = homeDir;
});
afterAll(() => {
  process.env.HOME = oldHome;
  process.env.OPENROUTER_API_KEY = oldKey;
  rmSync(homeDir, { recursive: true, force: true });
  rmSync(workDir, { recursive: true, force: true });
  process.chdir(oldCwd);
});
afterEach(() => {
  vi.mocked(globalThis.fetch).mockReset();
  globalThis.fetch = realFetch;
  process.chdir(oldCwd);
});

function stubCatalog(ids: string[]) {
  const data = {
    data: ids.map((id) => ({ id, pricing: { prompt: 0, completion: 0 } })),
  };
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch;
}

function stubFetchError() {
  globalThis.fetch = vi.fn(async () => {
    throw new Error("network unreachable");
  }) as unknown as typeof fetch;
}

describe("free-model discovery", () => {
  it("uses the live catalog as the primary when the API answers", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test";
    stubCatalog(["cohere/north-mini-code:free", "openai/gpt-oss-20b:free"]);
    process.chdir(workDir);
    const w = await wire(workDir);
    // selectForRole("main") resolves to the router primary, which is the first
    // discovered free model.
    expect(w.router.selectForRole("main")).toBe("cohere/north-mini-code:free");
  });

  it("falls back to the cached snapshot when the network fails", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test";
    writeFileSync(
      join(workDir, ".deep", "free-models.json"),
      JSON.stringify(["cached/a:free", "cached/b:free"]),
    );
    stubFetchError();
    process.chdir(workDir);
    const w = await wire(workDir);
    expect(w.router.selectForRole("main")).toBe("cached/a:free");
  });

  it("falls back to the hardcoded primary when there is no cache", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test";
    rmSync(join(workDir, ".deep", "free-models.json"), { force: true });
    stubFetchError();
    process.chdir(workDir);
    const w = await wire(workDir);
    expect(w.router.selectForRole("main")).toBe(FREE_PRIMARY);
  });
});
