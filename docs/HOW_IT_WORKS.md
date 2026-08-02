# How Deep actually works

This document describes the real runtime behavior of the `deep` CLI, grounded in
the source under `src/`. It is intentionally not aspirational — everything below
corresponds to code paths that exist today.

Deep is a local-first CLI coding agent with a native, multi-model research
runtime. One process, one command, a modular monolith. The two user-facing
capabilities are:

1. **`deep <task>` / REPL** — an agent loop that calls tools to inspect and edit
   the repository, then answers the user.
2. **`deep research <question>` / `deep review`** — a research runtime that
   localizes candidates, dispatches cheap read-only workers, verifies every
   source claim mechanically, and returns a compact `ResearchCapsule` (or a
   graded findings report).

## Entry and wiring

`src/cli/entry.ts` is the entrypoint. `parseArgs` maps argv to a discriminated
`ParsedArgs`. `runCommand(argv, { cwd, out })` dispatches on the parsed command
and returns a process exit code.

`wire(root)` (now `async`) constructs the shared runtime objects used by the
model-driven commands:

- `EventBus` — in-process typed event bus (`src/observability/eventBus.ts`).
- `Store` — atomic JSON persistence (`src/persistence/store.ts`).
- `RepositoryEngine` — filesystem/symbol index, snapshots, git, history
  (`src/repository-engine/engine.ts`). It is refreshed (incremental) before use.
- `PolicyEngine` — role-based tool allow/deny + risk gating
  (`src/policy/policy.ts`).
- `ModelRouter` — normalized provider interface with cooldowns, circuit breaker,
  and semantic retry (`src/model-router/router.ts`).

### Model configuration (fail-loud, never silently mocked)

`wire` decides how to obtain a model and **refuses to run if none is configured**,
so a new user gets a clear error instead of fabricated output. The precedence is:

1. `DEEP_MODEL` or `DEEP_MODELS_MAIN` env var (explicit).
2. `OPENROUTER_API_KEY` env var → use OpenRouter's free models.
3. A model set in a project/global `.deep/config.json`.

If none of those are present, `wire` throws: *"no model configured: set
OPENROUTER_API_KEY ... or set DEEP_MODEL=mock/main to run in mock/demo mode."*

- **Mock mode is opt-in only** (`DEEP_MODEL=mock/main` or a config file that sets
  `models.main` to a `mock/*` id). When active, `MockProvider`
  (`src/model-router/mock.ts`) is registered and `research`/`review` can run fully
  offline for demos and tests.
- **With an API key**, free models are **discovered live** from the OpenRouter
  catalog (`GET /api/v1/models`, 8s `AbortController` timeout) and cached to
  `.deep/free-models.json`. On network failure or timeout it falls back to the
  cache, then to a single known-good seed id. The runtime never carries a
  fabricated model list.
- `loadDotEnv()` reads `.env` from the current working directory (only sets keys
  not already present).

### Command surface

Read-only / housekeeping commands (`doctor`, `index`, `graph`, `log`, `trace`,
`cost`, `audit`, `config show|validate`, `reviews`, `evaluate`) construct what
they need directly. Model-driven commands (`research`, `review`, `repl`, `task`)
call `await wire(root)`.

Notable behaviors:

- **`doctor`** checks Node >= 22.5 and repository health, then prints an
  advisory model/provider readiness line (e.g. `model: NONE`, `model: OpenRouter
  key present`, or `model: explicit (mock/main)`). It does not fail on missing
  model.
- **`audit`** reads the append-only JSONL audit log at `<root>/.deep/audit/`
  (`src/observability/audit.ts`); every entry is passed through `redactObject`
  before being written, and tool-call entries record only the tool name + ok (never
  the arguments), so runtime tool args/secrets are not persisted.
- **`evaluate`** runs the evaluation harness over a fixture directory
  (`src/evaluation/harness.ts`), used by the readiness tests.

## The agent loop (`deep <task>` and the REPL)

`runAgentLoop` (`src/agent-core/agentLoop.ts`) is a bounded turn loop:

1. Build a system message listing available tools (the names come from the
   `ToolRuntime`).
2. Ask the router for a completion with `router.complete({ modelId:
   selectForRole("main"), role: "main", messages, tools })`.
3. If the model returns tool calls, execute each via `ToolRuntime.execute` in
   turn, append the tool result back into the conversation, and loop.
4. If there are no tool calls, the content is the final answer. The loop is bounded
   by `maxTurns` (12) and `maxToolCalls` (30); tool-result text is capped to keep
   conversations within provider input limits.

The REPL (`src/cli/tui-app.ts`) reuses the same `wire` + `ToolRuntime` +
`runAgentLoop` and adds `/research`, `/task`, `/models`, `/cost`, `/context`,
`/cancel`, `/session` commands.

## Tools and the tool runtime

`buildToolRuntime` (`src/coding-agent/tools/index.ts`) registers read tools, the
atomic patch tool, write tools, the command runner, git tools, and workspace
tools. `ToolRuntime.execute` (`src/tooling/runtime.ts`) runs the same sequence for
every tool call:

1. Resolve the tool; reject if the role is not allowed.
2. **Policy decision first** (`PolicyEngine.decide`) — before any tool code runs.
3. If allowed but `requiresApproval`, call `ctx.requestApproval(action)`; on
   `false` return `{ ok:false, data:{denied:true} }` without executing.
4. Validate args against the tool's JSON schema (required props + primitive
   types).
5. Run the tool under a per-tool timeout (`withTimeout`), honoring an
   `AbortSignal`.

## Policy and approvals (safety)

`PolicyEngine.decide` (`src/policy/policy.ts`) is role- and tool-aware:

- **Read-only tools** are always allowed.
- **Research/critic/utility roles** may only ever use read-only tools (they can
  never write or execute).
- **Write tools** (`apply_patch`, `write_file`, `edit_file`) — `edit_file` is
  gated the same as the patch tool. When `requireApprovalForWrite` is on, writes
  require approval.
- **`run_command`** — risk is classified **server-side** from the actual command
  string via `classifyRisk` (`src/coding-agent/tools/command.ts`), **never** from
  caller-supplied `args.risk`. So a model cannot label `rm -rf /` as "low" to
  bypass approval. If the classified risk is in `requireApprovalForCommand` (default
  `["high"]`), the command requires approval.
- **`git_push`** is denied outright when `denyGitPush` is true (the default).

The model loop used to auto-approve everything (`requestApproval: async () => true`).
It now instead uses `deps.requestApproval ?? (async () => false)` — i.e. **fail-closed**
by default. `buildApproval` (`src/cli/approval.ts`) builds the concrete strategy:

- `--yes` (or `DEEP_AUTO_APPROVE=1`) → auto-approve (autonomous mode).
- Interactive TTY present → a real `Allow <action>? [y/N]` readline prompt.
- Non-interactive (CI/pipe, no TTY) → deny with a "pass --yes" hint.

This means the default for `deep <task>` is **autonomous for low/medium risk** but
**high-risk commands prompt on a TTY and are denied when headless unless `--yes`
is given**. The approval function accepts an injectable `prompt` so it is testable
headlessly.

Command risk classification by example: `rm -rf*`, `git push`, `npm publish`,
`sudo`, `mkfs`, `dd if=`, fork-bomb patterns, `shutdown`/`reboot` → **high**;
`npm i/uninstall`, `git reset|clean|checkout`, `rm`, `mv` → **medium**; everything
else → **low**.

## The research runtime

`runResearch` (`src/research-runtime/research.ts`) is the core economic bet: keep
expensive model context out of the loop. The pipeline is deterministic-first and
evidence-grounded:

1. **Localize** (`src/research-runtime/localizer.ts`) — runs **before any model
   call**, against the repository index, to produce candidate file/line
   references for the question.
2. **Plan** (`ResearchPlanner`) — decomposes the question into a bounded set of
   sub-questions (`maxWorkers` scales with `--depth`: quick=1, normal=2, deep=3).
3. **Worker swarm** (`scheduler.runWorkers`) — dispatches cheap, **read-only**
   research workers (they go through the same router but the `research-worker`
   role is policy-locked to read-only tools). Each worker returns a structured
   `WorkerReport` with claims and cited evidence.
4. **Verify** (`verifyReports`) — every claim's evidence is checked
   **mechanically** against the snapshot (real file/line/symbol/hash), so an
   evidence reference that doesn't exist is rejected rather than trusted.
5. **Contradiction detection** (`detectContradictions`) across worker reports.
6. **Critic + follow-up** — if contradictions exist and confidence is low (and
   budget/rounds remain), a `critic` role runs to challenge verified conclusions,
   then `planFollowUp` schedules a bounded extra round.
7. **Stopping policy** (`decideStop`) — bounded by `MAX_ROUNDS` (2) and budget.
8. **Capsule** — `compileCapsule` produces a compact `ResearchCapsule`: verified
   claims + locations, conclusion + confidence, and token/cost usage — **never**
   the raw worker transcripts.

Budgets are enforced with an `AbortController` (timeout) plus `maxModelCalls` /
`maxCostUsd` caps. The orchestrator emits `ResearchCompleted` on the bus.

### From capsule to developer-facing artifacts

- `deep research` prints a pretty-printed `ResearchReport`:
  `{ capsule, findings, levelCounts, mayBlockMerge }` (`buildReport` in
  `src/research-runtime/report.ts`).
- `deep review [tier] [--tests] [--sarif=out.sarif]` runs the same research, then
  grades findings (an L0–L5 evidence ladder per `qa.md`) and can emit SARIF
  (`src/research-runtime/sarif.ts`). Review is read-only and never edits the repo.

## Model routing

`ModelRouter` (`src/model-router/router.ts`) is the single normalized interface
providers plug into:

- `HttpProvider` (`src/model-router/http.ts`) — OpenAI-compatible (OpenRouter).
  `complete` serializes messages/tools to the OpenAI chat-completions shape,
  supports `response_format` JSON schema for structured requests, and maps HTTP
  status to typed `ProviderError` kinds: 401/403→`auth`, 429→`rate_limit`,
  408→`timeout`, 5xx→`unavailable`. (An offline integration test in
  `tests/http-provider.test.ts` exercises parsing + error mapping against a local
  server.)
- `MockProvider` — for offline/demo/test runs.
- `ReplayProvider` / `RecordingProvider` (`src/model-router/replay.ts`) — record
  and replay provider responses for deterministic, network-free tests.

`complete` walks a fallback chain (`primary` + `fallbacks[primary]`) per request.
On `rate_limit`/`unavailable` it marks a cooldown; after repeated failures the
circuit opens for the model. With `semanticRetry` on, an empty (no content, no
tool calls) worker answer is treated as a soft failure and the next model is tried
— free models sometimes return empty finals, and this keeps the loop honest.
`selectForRole(role, preferred?)` picks candidates honoring cooldowns and, when
capability data exists, prefers higher-reliability models.

## Configuration

Config is layered and merged (`src/config/config.ts`): `DEFAULT_CONFIG`
(`src/protocol/config.ts`) ← global `~/.deep/config.json` ← project
`<root>/.deep/config.json` ← `DEEP_MODELS_MAIN`/`DEEP_RESEARCH_WORKERS` env ← CLI
flags. `validateConfig` is a schema check (required `models.main`, sane workers,
no raw secrets). `redactForShow` masks secret-bearing keys for `config show`.
The default config sets `requireApprovalForCommand: ["high"]`,
`requireApprovalForWrite: false`, `denyGitPush: true`.

## Observability

- **Event bus** — typed in-process pub/sub (`src/observability/eventBus.ts`);
  subscribers are isolated (one failing subscriber doesn't break others).
- **Metrics** — counters for model calls, tokens, cost (`src/observability/logging.ts`);
  surfaced via `deep trace` and `deep cost`.
- **Audit log** — append-only JSONL under `<root>/.deep/audit/`, every entry
  redacted via `redactObject` (`src/policy/secret.ts`). Records security-relevant
  events: `ToolCallCompleted`, `ApprovalRequested`/`ApprovalResolved`,
  `ResearchCompleted`, `ModelRequestCompleted`.
- **Secret protection** — `scanText`/`redactSecrets`/`isBlockedPath` cover known
  secret shapes (AWS keys, `sk-` tokens) and block reading `.env`-style paths even
  for read tools.

## Testing

The suite (`vitest`, ~139 tests across 20 files) is deliberately practical and
covers the different user paths:

- `tests/approval.test.ts` — approvals through the real agent loop (deny vs allow
  writes), `parseArgs` `--yes` handling, `buildApproval` behavior.
- `tests/approval-prompt.test.ts` — injected-prompt approval paths.
- `tests/scenarios.test.ts` — persona-driven `runCommand` scenarios: brand-new
  user (no config → fail-loud), key-present `doctor`, `research`/`review`
  end-to-end with the mock provider, `index`/`graph`/`audit`/`config validate`,
  and the evaluation harness on the F02 fixture.
- `tests/free-model-discovery.test.ts` — runtime discovery (live catalog / cache
  fallback / seeded fallback) by mocking `fetch`.
- `tests/http-provider.test.ts` — real `HttpProvider` against a local OpenAI-style
  server.
- Plus unit/contract tests for the research spine, policy, tools, snapshot
  staleness, SARIF, and architecture invariants.

Run with:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc -> dist/
npm test            # vitest run
```

## Repository layout (the modular monolith)

```
src/protocol          shared typed contracts (config, events, model, tools, evidence, research)
src/observability     event bus, logging/metrics, audit, trace
src/persistence       atomic JSON store (SQLite-swappable interface)
src/config            layered config loader + validation + redaction
src/model-router      Provider contract; HttpProvider, MockProvider, Replay; reliability registry
src/policy            role-based tool policy, server-side risk, secret protection
src/agent-core        session kernel, main agent loop, compaction
src/coding-agent      tools (read, patch, write, command, git, workspace) + tool runtime
src/repository-engine filesystem index, lexical/symbol search, snapshots, git, history, deps, LSP
src/research-runtime  localizer -> planner -> workers -> verify -> critic -> capsule -> report/sarif
src/cli               entrypoint, parseArgs, wire, approval, REPL, TUI
src/evaluation        evaluation harness over ground-truth fixtures
scripts               check-free-models.js (manual diagnostic, not the runtime path)
tests                 the test suites above
```

## Security-relevant defaults

- High-risk commands prompt on a TTY and are **denied** when non-interactive,
  unless the operator passes `--yes` / sets `DEEP_AUTO_APPROVE=1`.
- Risk is classified from the command string, not from caller-supplied metadata.
- `git push` is denied unless `policy.denyGitPush` is false.
- Research/critic workers can only read; they cannot write or execute commands.
- The audit log records tool names and outcomes, not arguments; all entries are
  secret-redacted.
- No model configured → loud failure; the tool never silently produces fake
  research findings.