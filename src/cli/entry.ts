// Phase 02 — CLI entrypoint (`deep`)
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname, isAbsolute } from "node:path";
import { loadConfig, redactForShow, ConfigError } from "../config/config.js";
import { RepositoryEngine } from "../repository-engine/engine.js";
import { EventBus } from "../observability/eventBus.js";
import { Store, defaultDbLocations } from "../persistence/store.js";
import { PolicyEngine } from "../policy/policy.js";
import { ModelRouter } from "../model-router/router.js";
import { MockProvider } from "../model-router/mock.js";
import { HttpProvider } from "../model-router/http.js";
import { ReplayProvider, loadReplayFile } from "../model-router/replay.js";
import { buildToolRuntime } from "../coding-agent/tools/index.js";
import { runAgentLoop } from "../agent-core/agentLoop.js";
import { runResearch } from "../research-runtime/research.js";
import { buildFindings } from "../research-runtime/grading.js";
import { buildReport } from "../research-runtime/report.js";
import { SuppressionStore } from "../research-runtime/suppressions.js";
import { toSarif } from "../research-runtime/sarif.js";
import { rebuildAll } from "../repository-engine/cacheInvalidation.js";
import { DependencyGraph } from "../repository-engine/graph.js";
import { createLspProvider } from "../repository-engine/lsp.js";
import { SessionKernel } from "../agent-core/session.js";
import { printMessage, printResearchProgress, printCost } from "./tui.js";
import { startRepl } from "./tui-app.js";
import { metrics } from "../observability/logging.js";
import { formatTrace, formatCost } from "../observability/trace.js";
import { evaluateFixture } from "../evaluation/harness.js";

const USAGE = `deep — CLI coding agent

Usage:
  deep <task>              Run the coding agent on a task in the current repo
  deep research <question> [--depth quick|normal|deep]  Research the codebase and print a ResearchCapsule
  deep config show         Show resolved configuration (secrets redacted)
  deep config validate     Validate configuration
  deep doctor              Check environment/repo health
  deep resume              List resumable sessions
  deep sessions            List sessions
  deep index [--rebuild]   Refresh (or fully rebuild) the repository index
  deep trace               Print metrics + recent event summary
  deep cost                Print token/cost summary
  deep audit               Print the audit log for this repo
  deep review <q> [A|B|C] [--tests] [--sarif=out.sarif]  Research bugs (read-only), emit L-graded findings + SARIF
  deep graph [file]        Print the dependency graph (or one file's imports/importers)
  deep log [--graph]      Print git log (or commit graph)
  deep evaluate <dir>      Run the evaluation harness on a fixture directory
  deep --help | -h         Show this help
  deep --version | -v      Show version
  `;

export type ParsedArgs =
  | { command: "help" }
  | { command: "version" }
  | { command: "task"; task: string }
  | { command: "research"; question: string; depth?: "quick" | "normal" | "deep" }
  | { command: "config-show" }
  | { command: "config-validate" }
  | { command: "doctor" }
  | { command: "sessions" }
  | { command: "index"; rebuild?: boolean }
  | { command: "trace" }
  | { command: "cost" }
  | { command: "audit" }
  | { command: "evaluate"; fixtureDir: string }
  | { command: "graph"; target?: string }
  | { command: "log" }
  | { command: "review"; tier?: "A" | "B" | "C" | "D" | "E"; tests?: boolean; sarif?: string; question?: string }
  | { command: "repl" };

export function parseArgs(args: string[]): ParsedArgs {
  const [first, ...rest] = args;
  if (first === "--help" || first === "-h") return { command: "help" };
  if (!first || first === "repl" || first === "chat") return { command: "repl" };
  if (first === "--version" || first === "-v") return { command: "version" };
  if (first === "research") {
    let depth: "quick" | "normal" | "deep" = "normal";
    const questionParts: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i]!;
      if (a === "--depth" || a.startsWith("--depth=")) {
        const val = a.startsWith("--depth=") ? a.slice("--depth=".length) : rest[++i];
        if (val === "quick" || val === "normal" || val === "deep") depth = val;
      } else {
        questionParts.push(a);
      }
    }
    return { command: "research", question: questionParts.join(" ").trim(), depth };
  }
  if (first === "config") {
    if (rest[0] === "show") return { command: "config-show" };
    if (rest[0] === "validate") return { command: "config-validate" };
    return { command: "help" };
  }
  if (first === "doctor") return { command: "doctor" };
  if (first === "resume" || first === "sessions") return { command: "sessions" };
  if (first === "index") return { command: "index", rebuild: rest.includes("--rebuild") };
  if (first === "trace") return { command: "trace" };
  if (first === "cost") return { command: "cost" };
  if (first === "audit") return { command: "audit" };
  if (first === "graph") return { command: "graph", target: rest[0] };
  if (first === "evaluate") return { command: "evaluate", fixtureDir: rest.join(" ") };
  if (first === "log") return { command: "log" };
  if (first === undefined || first === "repl" || first === "chat") return { command: "repl" };
  if (first === "review") {
    const tier = (rest.find((r) => /^[A-E]$/i.test(r)) ?? "B").toUpperCase() as "A" | "B" | "C" | "D" | "E";
    const sarifArg = rest.find((r) => r.startsWith("--sarif"));
    let sarif: string | undefined;
    if (sarifArg) {
      const eq = sarifArg.indexOf("=");
      sarif = eq >= 0 ? sarifArg.slice(eq + 1) : rest[rest.indexOf(sarifArg) + 1];
    }
    const question = rest
      .filter((r) => !/^[A-E]$/i.test(r) && r !== "--tests" && !r.startsWith("--sarif") && r !== sarif)
      .join(" ")
      .trim() || undefined;
    return { command: "review", tier, tests: rest.includes("--tests"), sarif, question };
  }
  return { command: "task", task: [first, ...rest].join(" ") };
}

function packageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

export interface RunDeps {
  cwd?: string;
  out?: (line: string) => void;
}

interface Wiring {
  root: string;
  bus: EventBus;
  store: Store;
  engine: RepositoryEngine;
  policy: PolicyEngine;
  router: ModelRouter;
}

// Zero-dependency .env loader (only sets keys not already present in env).
function loadDotEnv(): void {
  try {
    const p = join(process.cwd(), ".env");
    if (!existsSync(p)) return;
    const text = readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

// Phase 48 — Free-model primary + fallback chain (verified READY by check-free-models).
const FREE_PRIMARY = "openai/gpt-oss-20b:free";
const FREE_FALLBACKS = [
  "cohere/north-mini-code:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "inclusionai/ling-3.0-flash:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-nano-9b-v2:free",
];

export function wire(root: string): Wiring {
  loadDotEnv();
  const bus = new EventBus();
  const store = new Store(defaultDbLocations().project(root));
  let cfg: ReturnType<typeof loadConfig> | undefined;
  try {
    cfg = loadConfig({ repoRoot: root });
  } catch {
    /* fall back to defaults */
  }
  const engine = new RepositoryEngine(root, cfg?.repository);
  engine.lsp = createLspProvider(process.env.DEEP_LSP === "1", root);
  engine.refresh();
  const policy = new PolicyEngine({
    denyGitPush: cfg?.policy?.denyGitPush ?? true,
    requireApprovalForWrite: cfg?.policy?.requireApprovalForWrite ?? false,
    requireApprovalForCommand: cfg?.policy?.requireApprovalForCommand ?? ["high"],
  });
  const apiKey = process.env.OPENROUTER_API_KEY;
  const primary = process.env.DEEP_MODEL ?? (apiKey ? FREE_PRIMARY : cfg?.models?.main ?? "mock/main");
  const router = new ModelRouter(
    { primary, fallbacks: apiKey ? { [FREE_PRIMARY]: FREE_FALLBACKS } : undefined, semanticRetry: true },
    bus,
  );
  const mock = new MockProvider(
    {
      // Produce structured research-worker reports that cite real candidate files
      // parsed from the deterministic-localizer prompt, so the capsule is populated.
      structured: (req) => {
        const text = req.messages.map((m) => m.content).join("\n");
        if (text.includes("VERIFIED EVIDENCE")) {
          return { acceptedClaims: [], rejectedClaims: [], missingInvestigations: [], alternativeHypotheses: [], confidenceAdjustment: 0 };
        }
        const cands = [...text.matchAll(/- ([\w./-]+?)(?:#(\w+))? \(([\d?]+)\)/g)].map((x) => ({
          path: x[1]!,
          line: parseInt(x[3]!, 10) || 1,
        }));
        const src = cands.find((c) => /\.(ts|tsx|js|jsx)$/.test(c.path)) ?? cands[0];
        if (src) {
          return {
            conclusion: `Analysis of ${src.path}`,
            confidence: 0.85,
            claims: [{ statement: `Relevant state is written in ${src.path}.`, evidence: [{ path: src.path, startLine: Math.max(1, src.line - 1), endLine: src.line + 1 }] }],
          };
        }
        return { conclusion: "no candidates", confidence: 0.3, claims: [] };
      },
    },
    "mock",
  );
  router.register(mock, ["mock/main", "mock/worker", "mock/critic"]);
  if (apiKey) {
    const http = new HttpProvider({
      baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey,
      headers: { "HTTP-Referer": "https://github.com/opencode", "X-Title": "Deep" },
      defaultModel: FREE_PRIMARY,
    });
    router.register(http, [FREE_PRIMARY, ...FREE_FALLBACKS]);
  }
  const replayFile = process.env.DEEP_REPLAY;
  if (replayFile) {
    const responses = loadReplayFile(replayFile);
    router.register(new ReplayProvider(responses), [FREE_PRIMARY, ...FREE_FALLBACKS]);
  }
  return { root, bus, store, engine, policy, router };
}

export async function runCommand(argv: string[], deps: RunDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => process.stdout.write(line + "\n"));
  const root = deps.cwd ?? process.cwd();
  const parsed = parseArgs(argv);
  const [first, ...rest] = argv;

  switch (parsed.command) {
    case "help":
      out(USAGE);
      return 0;
    case "version":
      out(packageVersion());
      return 0;
    case "config-show": {
      const cfg = loadConfig({ repoRoot: root });
      out(JSON.stringify(redactForShow(cfg), null, 2));
      return 0;
    }
    case "config-validate": {
      try {
        loadConfig({ repoRoot: root });
        out("valid");
        return 0;
      } catch (e) {
        if (e instanceof ConfigError) {
          out(`invalid config (${e.field}): ${e.message}`);
          return 1;
        }
        throw e;
      }
    }
    case "doctor": {
      const [major, minor] = process.versions.node.split(".").map(Number);
      const nodeOk = major! > 22 || (major === 22 && minor! >= 5);
      out(`node ${process.versions.node} ${nodeOk ? "ok (>=22.5)" : "too old (need >=22.5)"}`);
      if (!nodeOk) {
        out("doctor: node version is too old (need >=22.5)");
        return 1;
      }
      try {
        const engine = new RepositoryEngine(root);
        engine.refresh();
        const ov = engine.overview();
        out(`repo ${root} ok: ${ov.files} files, ${ov.symbols} symbols, git=${ov.git.isRepo ?? "unknown"}`);
      } catch (e) {
        out(`doctor: repo check failed: ${(e as Error).message}`);
        return 1;
      }
      return 0;
    }
    case "sessions": {
      const store = new Store(defaultDbLocations().project(root));
      const kernel = new SessionKernel(store);
      const sessions = kernel.list();
      if (sessions.length === 0) out("no sessions");
      for (const s of sessions) {
        out(`${s.id}  messages=${s.messageCount}  updated=${new Date(s.updatedAt).toISOString()}`);
      }
      return 0;
    }
    case "index": {
      const engine = new RepositoryEngine(root);
      if (parsed.rebuild) {
        // Phase 42 — manual full rebuild.
        const changed = rebuildAll(engine);
        out(`rebuilt index: ${engine.overview().files} files, ${changed.length} entries touched`);
      } else {
        const changed = engine.refresh();
        out(`index refreshed: ${engine.overview().files} files, ${changed.length} changed`);
      }
      return 0;
    }
    case "trace": {
      const bus = new EventBus();
      out(formatTrace({ metrics, bus }));
      return 0;
    }
    case "cost": {
      out(formatCost(metrics));
      return 0;
    }
    case "audit": {
      try {
        const mod = await import("../observability/audit.js");
        const AuditLog = (mod as any).AuditLog;
        const log = new AuditLog(root);
        const entries = log.query?.() ?? [];
        if (entries.length === 0) out("no audit entries");
        for (const e of entries) out(JSON.stringify(e));
        return 0;
      } catch {
        out("no audit log available");
        return 0;
      }
    }
    case "evaluate": {
      const fixtureRoot = isAbsolute(parsed.fixtureDir) ? parsed.fixtureDir : join(root, parsed.fixtureDir);
      const w = wire(fixtureRoot);
      const report = await evaluateFixture(fixtureRoot, {
        engine: w.engine,
        router: w.router,
        root: fixtureRoot,
      });
      out(JSON.stringify(report, null, 2));
      return 0;
    }
    case "graph": {
      const engine = new RepositoryEngine(root);
      engine.refresh();
      const g = new DependencyGraph(engine).build();
      if (parsed.target) {
        out(`imports-of ${parsed.target}:`);
        for (const e of g.getDependents(parsed.target)) out(`  -> ${e}`);
        out(`importers-of ${parsed.target}:`);
        for (const e of g.getImporters(parsed.target)) out(`  <- ${e}`);
      } else {
        out(`dependency graph: ${g.edges().length} edges`);
        for (const e of g.edges().slice(0, 50)) out(`  ${e.from} --${e.kind}--> ${e.to}`);
      }
      return 0;
    }
    case "log": {
      const engine = new RepositoryEngine(root);
      const log = engine.git.log({ graph: rest.includes("--graph") });
      out(log || "(not a git repository)");
      return 0;
    }
    case "research": {
      const w = wire(root);
      printResearchProgress(
        [
          { label: "localize candidates", state: "done" },
          { label: "run research workers", state: "running" },
          { label: "verify evidence + compile capsule", state: "pending" },
        ],
        out,
      );
      const snapshotId = w.engine.snapshots.create().id;
      const capsule = await runResearch(
        { question: parsed.question, depth: parsed.depth ?? "normal" },
        { engine: w.engine, router: w.router, root: w.root, snapshotId },
      );
      const supp = new SuppressionStore(w.store);
      const findings = await buildFindings(capsule, {
        engine: w.engine,
        verification: { allowTestExecution: false },
        store: supp,
      });
      out(JSON.stringify(buildReport(capsule, findings), null, 2));
      printMessage(
        "assistant",
        `Research done: ${capsule.claims.length} claims, ${capsule.locations.length} verified locations, confidence ${capsule.conclusion.confidenceLabel}.`,
        out,
      );
      printCost(
        {
          calls: capsule.usage.calls,
          inputTokens: capsule.usage.inputTokens,
          outputTokens: capsule.usage.outputTokens,
          costUsd: capsule.usage.estimatedCostUsd,
        },
        out,
      );
      return 0;
    }
    case "review": {
      // qa.md CI tiers. Read-only research + reporting; never edits the repo.
      const depth = parsed.tier === "A" ? "quick" : parsed.tier === "C" || parsed.tier === "D" ? "deep" : "normal";
      const w = wire(root);
      const snapshotId = w.engine.snapshots.create().id;
      const capsule = await runResearch(
        { question: parsed.question ?? "Audit this codebase for defects", depth, budget: { timeoutSeconds: 600 } },
        { engine: w.engine, router: w.router, root: w.root, snapshotId },
      );
      const supp = new SuppressionStore(w.store);
      const findings = await buildFindings(capsule, {
        engine: w.engine,
        verification: { allowTestExecution: parsed.tests, minimumConfidence: 0.4 },
        store: supp,
      });
      const report = buildReport(capsule, findings);
      if (parsed.sarif) {
        writeFileSync(parsed.sarif, JSON.stringify(toSarif(report), null, 2));
        out(`SARIF written to ${parsed.sarif}`);
      } else {
        out(JSON.stringify(report, null, 2));
      }
      printMessage(
        "assistant",
        `Audit (tier ${parsed.tier}) done: ${findings.length} findings — ` +
          `L0:${report.levelCounts.L0} L1:${report.levelCounts.L1} L2:${report.levelCounts.L2} ` +
          `L3:${report.levelCounts.L3} L4:${report.levelCounts.L4}. ` +
          `May block merge: ${report.mayBlockMerge.length}.`,
        out,
      );
      return 0;
    }
    case "repl": {
      // Interactive REader/Prompt loop (default when `deep` is run with no args).
      const w = wire(root);
      startRepl(root, out);
      return 0;
    }
    case "task": {
      const w = wire(root);
      const toolRuntime = buildToolRuntime(w.engine, w.policy, w.bus);
      const kernel = new SessionKernel(w.store, w.bus);
      const session = kernel.create(root);
      const result = await runAgentLoop(parsed.task, {
        router: w.router,
        toolRuntime,
        policy: w.policy,
        root: w.root,
        sessionId: session.id,
      });
      printMessage("assistant", result.final, out);
      return 0;
    }
  }
}

async function main(): Promise<void> {
  const onSignal = () => {
    process.stdout.write("\ninterrupted\n");
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    process.exitCode = await runCommand(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

// Run only when executed directly (not when imported by tests).
const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, "/") : "";
if (invoked.endsWith("/cli/entry.ts") || invoked.endsWith("/cli/entry.js")) {
  void main();
}
