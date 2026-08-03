// Phase 02 — CLI entrypoint (`deep`)
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
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
import { buildApproval } from "./approval.js";
import { metrics } from "../observability/logging.js";
import { formatTrace, formatCost } from "../observability/trace.js";
import { evaluateFixture } from "../evaluation/harness.js";

const USAGE = `deepagent — CLI coding agent

Usage:
  deepagent <task>              Run the coding agent on a task in the current repo
  deepagent research <question> [--depth quick|normal|deep]  Research the codebase and print a ResearchCapsule
  deepagent config show         Show resolved configuration (secrets redacted)
  deepagent config validate     Validate configuration
  deepagent doctor              Check environment/repo health
  deepagent resume              List resumable sessions
  deepagent sessions            List sessions
  deepagent index [--rebuild]   Refresh (or fully rebuild) the repository index
  deepagent trace               Print metrics + recent event summary
  deepagent cost               Print token/cost summary
  deepagent audit               Print the audit log for this repo
  deepagent review <q> [A|B|C] [--tests] [--sarif=out.sarif]  Research bugs (read-only), emit L-graded findings + SARIF
  deepagent graph [file]        Print the dependency graph (or one file's imports/importers)
  deepagent log [--graph]      Print git log (or commit graph)
  deepagent evaluate <dir>      Run the evaluation harness on a fixture directory
  deepagent --help | -h         Show this help
  deepagent --version | -v      Show version
  `;

export type ParsedArgs =
  | { command: "help" }
  | { command: "version" }
  | { command: "task"; task: string; yes?: boolean }
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
  | { command: "repl"; yes?: boolean };

export function parseArgs(args: string[]): ParsedArgs {
  const yes = args.includes("--yes") || args.includes("-y");
  const cleaned = args.filter((a) => a !== "--yes" && a !== "-y");
  const [first, ...rest] = cleaned;
  if (first === "--help" || first === "-h") return { command: "help" };
  if (!first || first === "repl" || first === "chat") return { command: "repl", yes };
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
  if (first === undefined || first === "repl" || first === "chat") return { command: "repl", yes };
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
  return { command: "task", task: [first, ...rest].join(" "), yes };
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

// Phase 48 — Free-model chain is discovered at runtime from the OpenRouter catalog.
const FREE_PRIMARY = "openai/gpt-oss-20b:free";

/**
 * Fetch the currently-available free models from OpenRouter. Falls back to a
 * cached snapshot in .deep/free-models.json when the network is unavailable so
 * offline runs still use real (previously-verified) model ids rather than
 * fabricated ones.
 */
async function discoverFreeModels(apiKey: string): Promise<string[]> {
  const cacheFile = join(process.cwd(), ".deep", "free-models.json");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/opencode",
        "X-Title": "Deep",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`catalog returned ${res.status}`);
    const data = (await res.json()) as {
      data?: Array<{ id: string; pricing?: { prompt?: number; completion?: number } }>;
    };
    const ids = (data.data ?? [])
      .filter(
        (m) =>
          (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0) ||
          m.id.endsWith(":free"),
      )
      .map((m) => m.id);
    try {
      mkdirSync(join(process.cwd(), ".deep"), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(ids));
    } catch {
      /* best-effort cache */
    }
    return ids;
  } catch {
    try {
      return JSON.parse(readFileSync(cacheFile, "utf8")) as string[];
    } catch {
      return [];
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function wire(root: string): Promise<Wiring> {
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
  const envModel = process.env.DEEP_MODEL ?? process.env.DEEP_MODELS_MAIN;
  const requested = envModel ?? cfg?.models?.main;
  const isMockRequest = typeof requested === "string" && requested.startsWith("mock/");
  const mockIsExplicit =
    isMockRequest && (envModel !== undefined || (cfg?.source ?? "defaults") !== "defaults");
  if (!mockIsExplicit && !apiKey) {
    throw new Error(
      "no model configured: set OPENROUTER_API_KEY (recommended) for real models, " +
        "or set DEEP_MODEL=mock/main to run in mock/demo mode.",
    );
  }
  const primary = mockIsExplicit
    ? requested!
    : apiKey
      ? envModel && !isMockRequest
        ? requested!
        : FREE_PRIMARY
      : requested!;
  let router: ModelRouter;
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
  if (mockIsExplicit) {
    router = new ModelRouter({ primary, semanticRetry: true }, bus);
    router.register(mock, ["mock/main", "mock/worker", "mock/critic"]);
  } else {
    const free = await discoverFreeModels(apiKey!);
    const freeList = free.length > 0 ? free : [FREE_PRIMARY];
    const explicitReal = envModel && !isMockRequest ? envModel : undefined;
    const primaryModel = explicitReal ?? freeList[0]!;
    const others = freeList.filter((m) => m !== primaryModel);
    router = new ModelRouter(
      {
        primary: primaryModel,
        fallbacks: others.length ? { [primaryModel]: others } : undefined,
        semanticRetry: true,
      },
      bus,
    );
    const http = new HttpProvider({
      baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey: apiKey!,
      headers: { "HTTP-Referer": "https://github.com/opencode", "X-Title": "Deep" },
      defaultModel: primaryModel,
    });
    router.register(http, explicitReal ? [explicitReal, ...freeList] : freeList);
  }
  const replayFile = process.env.DEEP_REPLAY;
  if (replayFile) {
    const responses = loadReplayFile(replayFile);
    router.register(new ReplayProvider(responses), [FREE_PRIMARY]);
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
      // Model/provider readiness (advisory — does not affect the exit code).
      const apiKey = process.env.OPENROUTER_API_KEY;
      const envModel = process.env.DEEP_MODEL ?? process.env.DEEP_MODELS_MAIN;
      let modelStatus: string;
      if (envModel) {
        modelStatus = `explicit (${envModel})`;
      } else if (apiKey) {
        modelStatus = "OpenRouter key present — free models discovered at runtime";
      } else {
        let hasConfigModel = false;
        try {
          hasConfigModel = (loadConfig({ repoRoot: root }).source ?? "defaults") !== "defaults";
        } catch {
          /* ignore */
        }
        modelStatus = hasConfigModel ? "configured via config file" : "NONE — research/task will refuse to run without a model";
      }
      out(`model: ${modelStatus}`);
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
        if (!AuditLog) {
          out("audit log unavailable (AuditLog not exported)");
          return 1;
        }
        const log = new AuditLog(root);
        const entries = log.query?.() ?? [];
        if (entries.length === 0) out("no audit entries");
        for (const e of entries) out(JSON.stringify(e));
        return 0;
      } catch (e) {
        out(`audit log failed: ${(e as Error).message}`);
        return 1;
      }
    }
    case "evaluate": {
      const fixtureRoot = isAbsolute(parsed.fixtureDir) ? parsed.fixtureDir : join(root, parsed.fixtureDir);
      const w = await wire(fixtureRoot);
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
      const w = await wire(root);
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
      const w = await wire(root);
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
      const w = await wire(root);
      startRepl(root, out, { autoApprove: !!parsed.yes });
      return 0;
    }
    case "task": {
      const w = await wire(root);
      const toolRuntime = buildToolRuntime(w.engine, w.policy, w.bus);
      const kernel = new SessionKernel(w.store, w.bus);
      const session = kernel.create(root);
      const result = await runAgentLoop(parsed.task, {
        router: w.router,
        toolRuntime,
        policy: w.policy,
        root: w.root,
        sessionId: session.id,
        requestApproval: buildApproval(!!parsed.yes, out),
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
