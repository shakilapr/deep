# Deep Work Plan

## Purpose

This plan converts the Deep architecture into an implementation sequence for a single installable CLI coding agent with:

- a frontier-model coding loop;
- openclaw-style orchestration;
- a native multi-model research tool;
- local repository intelligence;
- evidence verification;
- safe file editing and command execution.

Each phase has **one primary outcome**. A phase is complete only when every checklist item and exit criterion is satisfied.

---

## Delivery Rules

- Complete phases in order unless a dependency note explicitly allows parallel work.
- Do not add features from a later phase into an earlier phase.
- Keep every module behind a typed public interface.
- Add tests in the same phase as the feature.
- Do not mark a phase complete with known failing tests.
- Record architecture decisions in `docs/adr/`.
- Keep the CLI usable at the end of every phase.
- Prefer a modular monolith. Worker threads and child processes are internal implementation details, not separate products.
- The main coding model owns code changes.
- Research workers remain read-only unless a future phase explicitly changes that policy.
- Model-generated claims are not trusted until verified against repository evidence.

---

## Milestones

| Milestone | Included phases | Result |
|---|---:|---|
| M0 — Project Skeleton | 01–04 | Installable CLI with configuration, events, and persistence |
| M1 — Basic Coding Agent | 05–13 | Main model can inspect, edit, run commands, and show diffs |
| M2 — Repository Intelligence | 14–20 | Incremental repository index with symbols, snapshots, and evidence |
| M3 — Research MVP | 21–26 | One cheap research model returns a verified research capsule |
| M4 — Research Swarm | 27–32 | Multiple researchers, planning, criticism, and stopping rules |
| M5 — Production Safety | 33–36 | Permissions, secret protection, sandboxing, and audit logs |
| M6 — Advanced Intelligence | 37–41 | LSP, dependency graph, test mapping, history, and cache invalidation |
| M7 — Product Readiness | 42–47 | Compaction, observability, evaluation, packaging, and documentation |

---

# Phase 01 — Repository Bootstrap

**Primary outcome:** Create the monorepo structure and development foundation.

**Checklist**

- [ ] Create the root Git repository.
- [ ] Create the workspace package manager configuration.
- [ ] Add `apps/cli`.
- [ ] Add empty packages for `agent-core`, `coding-agent`, `research-runtime`, `repository-engine`, `workspace-runtime`, `model-router`, `policy-engine`, `persistence`, `protocol`, and `observability`.
- [ ] Configure TypeScript project references.
- [ ] Configure linting and formatting.
- [ ] Configure unit-test execution.
- [ ] Configure CI for type checking, linting, and tests.
- [ ] Add a root `README.md`.
- [ ] Add `CONTRIBUTING.md`.
- [ ] Add an architecture decision record directory at `docs/adr/`.

**Exit criteria**

- [ ] `pnpm install` succeeds on a clean machine.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm lint` succeeds.
- [ ] `pnpm test` succeeds.
- [ ] CI runs the same commands successfully.

---

# Phase 02 — CLI Entrypoint

**Primary outcome:** Provide one installable `Deep` command.

**Checklist**

- [ ] Implement the `Deep` binary entrypoint.
- [ ] Add `Deep --help`.
- [ ] Add `Deep --version`.
- [ ] Add a placeholder interactive command.
- [ ] Add a placeholder direct-task command: `Deep "task"`.
- [ ] Add consistent exit codes.
- [ ] Add top-level error handling.
- [ ] Add graceful `SIGINT` and `SIGTERM` handling.
- [ ] Add CLI smoke tests.

**Exit criteria**

- [ ] The package can be linked or installed globally.
- [ ] Running `Deep --help` works.
- [ ] Running `Deep` starts and exits cleanly.
- [ ] An uncaught internal error produces a readable message and non-zero exit code.

---

# Phase 03 — Configuration System

**Primary outcome:** Load and validate global and project configuration.

**Checklist**

- [ ] Define the configuration schema in `packages/protocol`.
- [ ] Support global configuration in the user config directory.
- [ ] Support project configuration in `.Deep/config.json`.
- [ ] Define precedence rules: defaults, global, project, environment, CLI flags.
- [ ] Add schema validation.
- [ ] Add readable validation errors.
- [ ] Add secret-reference fields without storing raw secrets in project files.
- [ ] Add `Deep config show`.
- [ ] Add `Deep config validate`.
- [ ] Add configuration tests.

**Exit criteria**

- [ ] Invalid configuration prevents startup with a precise error.
- [ ] Effective configuration can be printed.
- [ ] Project settings correctly override global settings.
- [ ] Sensitive values are redacted from output.

---

# Phase 04 — Persistence Foundation

**Primary outcome:** Store project and session metadata locally.

**Checklist**

- [ ] Select and integrate SQLite.
- [ ] Create a migration system.
- [ ] Create the global database.
- [ ] Create the project database.
- [ ] Add repository registration tables.
- [ ] Add session metadata tables.
- [ ] Add task metadata tables.
- [ ] Add transaction helpers.
- [ ] Add database backup and recovery behavior.
- [ ] Add persistence tests.

**Exit criteria**

- [ ] Databases are created automatically.
- [ ] Migrations are repeatable and idempotent.
- [ ] A session record survives process restart.
- [ ] A corrupted or incompatible database produces a recoverable error.

---

# Phase 05 — Typed Event Bus

**Primary outcome:** Establish one internal event system for runtime communication.

**Checklist**

- [ ] Define event types in `packages/protocol`.
- [ ] Implement an in-process event bus.
- [ ] Support synchronous publication.
- [ ] Support asynchronous subscribers.
- [ ] Add correlation IDs.
- [ ] Add session IDs and task IDs to relevant events.
- [ ] Add cancellation-related events.
- [ ] Add event ordering tests.
- [ ] Add subscriber-failure isolation.

**Exit criteria**

- [ ] Components can publish and subscribe without direct coupling.
- [ ] Subscriber failures do not crash unrelated subscribers.
- [ ] Events retain stable ordering within one task.
- [ ] Event payloads are fully typed.

---

# Phase 06 — Session Kernel

**Primary outcome:** Manage resumable coding conversations.

**Checklist**

- [ ] Define session and message schemas.
- [ ] Create sessions.
- [ ] Append user, assistant, tool-call, and tool-result messages.
- [ ] Persist messages incrementally.
- [ ] Resume a previous session.
- [ ] List recent sessions.
- [ ] Add session cancellation state.
- [ ] Add session locking to prevent concurrent writers.
- [ ] Add transcript export.
- [ ] Add session tests.

**Exit criteria**

- [ ] A conversation can be resumed after process restart.
- [ ] Message ordering is preserved.
- [ ] Two processes cannot mutate the same session simultaneously.
- [ ] Cancelled sessions retain their history.

---

# Phase 07 — Model Provider Contract

**Primary outcome:** Define one provider-independent model invocation interface.

**Checklist**

- [ ] Define model request and response types.
- [ ] Define streaming event types.
- [ ] Define tool-call representations.
- [ ] Define token-usage reporting.
- [ ] Define provider error categories.
- [ ] Define cancellation behavior.
- [ ] Implement one provider adapter.
- [ ] Add provider conformance tests.
- [ ] Add a mock provider for deterministic tests.

**Exit criteria**

- [ ] The same agent loop can use the real provider and mock provider.
- [ ] Streaming text and tool calls are represented consistently.
- [ ] Provider errors are normalized.
- [ ] Requests can be cancelled.

---

# Phase 08 — Unified Model Router

**Primary outcome:** Select and invoke configured models through one router.

**Checklist**

- [ ] Create a model catalogue.
- [ ] Store model capabilities.
- [ ] Resolve model aliases.
- [ ] Support a primary model.
- [ ] Support ordered fallback models.
- [ ] Track provider availability.
- [ ] Track request latency.
- [ ] Track token usage and estimated cost.
- [ ] Add operational retry rules.
- [ ] Add routing tests with mocked failures.

**Exit criteria**

- [ ] The router invokes the configured primary model.
- [ ] A transport failure moves to the next valid fallback.
- [ ] Usage is recorded per request.
- [ ] The caller receives one normalized response regardless of provider.

---

# Phase 09 — Main Agent Loop

**Primary outcome:** Run a complete model-tool-model coding turn.

**Checklist**

- [ ] Define the main-agent system prompt contract.
- [ ] Build messages from session state.
- [ ] Invoke the configured main model.
- [ ] Stream assistant output.
- [ ] Detect tool calls.
- [ ] Execute tool calls through the tool runtime.
- [ ] Append tool results to the session.
- [ ] Continue until the model returns a final response.
- [ ] Enforce a maximum turn and tool-call limit.
- [ ] Add cancellation.
- [ ] Add deterministic loop tests.

**Exit criteria**

- [ ] A user message can produce a final assistant response.
- [ ] The model can call a mock tool and continue reasoning.
- [ ] Infinite tool loops are stopped.
- [ ] Cancelling a turn stops model and tool execution.

---

# Phase 10 — Tool Runtime

**Primary outcome:** Register, authorize, validate, and execute typed tools.

**Checklist**

- [ ] Define the tool registration interface.
- [ ] Define JSON Schema input validation.
- [ ] Define typed tool results.
- [ ] Register tools by stable names.
- [ ] Reject unknown tools.
- [ ] Reject invalid arguments.
- [ ] Add execution timeouts.
- [ ] Add cancellation propagation.
- [ ] Publish tool lifecycle events.
- [ ] Add tool-runtime tests.

**Exit criteria**

- [ ] The agent can discover registered tools.
- [ ] Invalid tool input does not reach implementation code.
- [ ] Timed-out tools return a structured failure.
- [ ] Tool execution is observable through events.

---

# Phase 11 — Repository Read Tools

**Primary outcome:** Let the main agent inspect repository files safely.

**Checklist**

- [ ] Detect the repository root.
- [ ] Implement `list_files`.
- [ ] Implement `read_file`.
- [ ] Implement `read_range`.
- [ ] Implement basic `search_text`.
- [ ] Respect `.gitignore`.
- [ ] Respect Deep ignore patterns.
- [ ] Block reads outside the repository.
- [ ] Truncate oversized output safely.
- [ ] Add path traversal tests.
- [ ] Add binary-file handling.

**Exit criteria**

- [ ] The main agent can inspect text files.
- [ ] Reads outside the repository are denied.
- [ ] Ignored and binary files are handled predictably.
- [ ] Large files do not flood model context.

---

# Phase 12 — Patch Application

**Primary outcome:** Let the main agent make controlled source changes.

**Checklist**

- [ ] Implement atomic patch application.
- [ ] Validate the expected original context.
- [ ] Reject stale patches.
- [ ] Prevent writes outside the repository.
- [ ] Preserve file encoding and line endings where possible.
- [ ] Create automatic pre-edit snapshots.
- [ ] Implement patch rollback.
- [ ] Publish file-change events.
- [ ] Add patch conflict tests.
- [ ] Add multi-file patch tests.

**Exit criteria**

- [ ] Valid patches modify the intended files.
- [ ] Stale or ambiguous patches are rejected.
- [ ] Failed multi-file changes do not leave a partial state.
- [ ] A completed patch can be rolled back.

---

# Phase 13 — Command Runner

**Primary outcome:** Execute local commands with controlled limits.

**Checklist**

- [ ] Implement child-process execution.
- [ ] Stream stdout and stderr.
- [ ] Add working-directory control.
- [ ] Add environment-variable filtering.
- [ ] Add timeout enforcement.
- [ ] Add output-size limits.
- [ ] Add process-tree termination.
- [ ] Add command cancellation.
- [ ] Add shell and direct-exec modes.
- [ ] Add command-runner tests.

**Exit criteria**

- [ ] Commands run in the repository.
- [ ] Timed-out commands and child processes are terminated.
- [ ] Output is streamed and safely truncated.
- [ ] Cancelled commands do not remain running.

---

# Phase 14 — Git Integration

**Primary outcome:** Expose repository state and changes to the coding agent.

**Checklist**

- [ ] Implement `git_status`.
- [ ] Implement `git_diff`.
- [ ] Implement `git_log`.
- [ ] Detect the current branch and commit.
- [ ] Detect dirty and untracked files.
- [ ] Distinguish user changes from agent changes.
- [ ] Add a task-local change journal.
- [ ] Prevent Git push in the default policy.
- [ ] Add Git integration tests using temporary repositories.

**Exit criteria**

- [ ] The agent can inspect current changes.
- [ ] Pre-existing user changes are not mistaken for agent changes.
- [ ] The final response can report changed files accurately.
- [ ] Destructive remote Git operations are unavailable.

---

# Phase 15 — Terminal UI

**Primary outcome:** Provide the complete interactive coding experience.

**Checklist**

- [ ] Render conversation messages.
- [ ] Render streaming assistant output.
- [ ] Render tool execution status.
- [ ] Render command output.
- [ ] Render file diffs.
- [ ] Render token and cost usage.
- [ ] Add approval prompts.
- [ ] Add task cancellation.
- [ ] Add session selection.
- [ ] Add non-interactive fallback output.
- [ ] Add snapshot tests for major UI states.

**Exit criteria**

- [ ] A developer can complete a basic edit-and-test task from the TUI.
- [ ] Tool progress is visible without exposing raw internal state.
- [ ] The UI remains responsive during model and command execution.
- [ ] Non-interactive mode still works in CI and scripts.

---

# Phase 16 — Filesystem Index

**Primary outcome:** Maintain an incremental inventory of repository files.

**Checklist**

- [ ] Define the file-index schema.
- [ ] Scan tracked and relevant untracked files.
- [ ] Record path, type, size, timestamps, and content hash.
- [ ] Detect generated files.
- [ ] Detect vendored files.
- [ ] Apply ignore rules.
- [ ] Update only changed files.
- [ ] Remove deleted files from the index.
- [ ] Add file-watcher integration where supported.
- [ ] Add indexing tests.

**Exit criteria**

- [ ] The index matches repository contents.
- [ ] A second scan updates only changed entries.
- [ ] Deleted files disappear from the index.
- [ ] Generated and ignored files are labeled correctly.

---

# Phase 17 — Lexical Search Engine

**Primary outcome:** Provide ranked repository text search independent of models.

**Checklist**

- [ ] Integrate `ripgrep` or an equivalent search engine.
- [ ] Support exact string search.
- [ ] Support regular expressions.
- [ ] Support file filters.
- [ ] Support result limits.
- [ ] Add contextual lines.
- [ ] Rank results by path and match quality.
- [ ] Return stable structured matches.
- [ ] Cache repeat searches within one snapshot.
- [ ] Add search tests.

**Exit criteria**

- [ ] Searches return structured path and line data.
- [ ] Search respects repository scope and ignore rules.
- [ ] Large result sets are bounded.
- [ ] Repeat searches are faster or served from cache.

---

# Phase 18 — Syntax Index

**Primary outcome:** Extract language-independent code structure with Tree-sitter.

**Checklist**

- [ ] Add Tree-sitter integration.
- [ ] Support the first target language.
- [ ] Extract functions, classes, methods, interfaces, types, enums, and constants.
- [ ] Record symbol ranges.
- [ ] Extract imports and exports.
- [ ] Persist parse results by file hash.
- [ ] Handle parse errors without stopping indexing.
- [ ] Add parser-version metadata.
- [ ] Add syntax fixtures and tests.

**Exit criteria**

- [ ] Symbols are extracted accurately for supported fixtures.
- [ ] Broken files produce partial or failed parse records without crashing.
- [ ] Unchanged files are not reparsed.
- [ ] Symbol locations match source lines.

---

# Phase 19 — Symbol Query API

**Primary outcome:** Let agents search and navigate indexed symbols.

**Checklist**

- [ ] Implement `search_symbols`.
- [ ] Implement `get_symbol`.
- [ ] Implement syntax-based `get_definition`.
- [ ] Implement import/export lookups.
- [ ] Implement file-symbol listings.
- [ ] Add fuzzy identifier matching.
- [ ] Add ranking by exactness and scope.
- [ ] Return exact source ranges.
- [ ] Add symbol-query tests.

**Exit criteria**

- [ ] The agent can locate a symbol without scanning whole files.
- [ ] Exact matches rank above fuzzy matches.
- [ ] Source ranges can be passed directly to `read_range`.
- [ ] Unsupported languages fail gracefully.

---

# Phase 20 — Repository Snapshots

**Primary outcome:** Pin every task and research run to a reproducible repository state.

**Checklist**

- [ ] Define the snapshot schema.
- [ ] Record repository root.
- [ ] Record branch and commit.
- [ ] Hash modified files.
- [ ] Hash relevant untracked files.
- [ ] Record index version.
- [ ] Detect snapshot staleness.
- [ ] Persist snapshots.
- [ ] Add snapshot comparison.
- [ ] Add dirty-tree tests.

**Exit criteria**

- [ ] Two identical repository states produce the same logical snapshot identity.
- [ ] Editing a relevant file invalidates the snapshot.
- [ ] A snapshot can identify stale research evidence.
- [ ] Dirty repositories are represented without committing changes.

---

# Phase 21 — Evidence Model

**Primary outcome:** Represent repository claims with verifiable source references.

**Checklist**

- [ ] Define `EvidenceReference`.
- [ ] Define `VerifiedEvidence`.
- [ ] Include snapshot ID.
- [ ] Include file path and line range.
- [ ] Include optional symbol ID.
- [ ] Include content hash.
- [ ] Define evidence status values.
- [ ] Persist evidence records.
- [ ] Add evidence serialization tests.

**Exit criteria**

- [ ] Evidence can be stored and reloaded without information loss.
- [ ] Evidence always identifies a repository snapshot.
- [ ] Evidence always identifies an exact source range.
- [ ] Stale evidence can be detected mechanically.

---

# Phase 22 — Research Tool Contract

**Primary outcome:** Expose research as one native main-agent tool.

**Checklist**

- [ ] Define `ResearchCodebaseInput`.
- [ ] Define `ResearchCapsule`.
- [ ] Register `research_codebase`.
- [ ] Add scope controls.
- [ ] Add depth controls.
- [ ] Add token, call, time, and cost budgets.
- [ ] Add cancellation.
- [ ] Add a placeholder research implementation.
- [ ] Add tool-contract tests.

**Exit criteria**

- [ ] The main model can invoke `research_codebase`.
- [ ] Invalid budgets and scopes are rejected.
- [ ] Research execution can be cancelled.
- [ ] The placeholder returns a schema-valid capsule.

---

# Phase 23 — Deterministic Research Localizer

**Primary outcome:** Produce candidate files and symbols before using a research model.

**Checklist**

- [ ] Normalize the research question.
- [ ] Extract identifiers and quoted strings.
- [ ] Search exact text.
- [ ] Search related symbols.
- [ ] Expand to defining files.
- [ ] Expand to importers and exporters.
- [ ] Locate related test files by naming convention.
- [ ] Rank candidate locations.
- [ ] Enforce a maximum candidate budget.
- [ ] Add localization fixtures and tests.

**Exit criteria**

- [ ] A known issue fixture returns the correct file within the top candidates.
- [ ] Localization works without an LLM.
- [ ] Candidate output is structured and bounded.
- [ ] No full repository content is inserted into model context.

---

# Phase 24 — Single Research Worker

**Primary outcome:** Use one inexpensive model to answer a bounded repository question.

**Checklist**

- [ ] Define the research-worker prompt.
- [ ] Create an isolated worker session.
- [ ] Restrict the worker to read-only repository tools.
- [ ] Supply the deterministic candidate set.
- [ ] Require structured claims.
- [ ] Require evidence references.
- [ ] Enforce worker token and tool-call limits.
- [ ] Persist the worker transcript separately.
- [ ] Return a typed worker report.
- [ ] Add mock-model tests.

**Exit criteria**

- [ ] One worker can investigate a known fixture.
- [ ] Worker context is separate from the main session.
- [ ] The main session does not receive the worker transcript.
- [ ] The worker cannot modify the repository.

---

# Phase 25 — Evidence Verifier

**Primary outcome:** Mechanically verify every source citation produced by a worker.

**Checklist**

- [ ] Check snapshot existence.
- [ ] Check file existence.
- [ ] Check line-range validity.
- [ ] Check content hashes.
- [ ] Check symbol overlap when a symbol is supplied.
- [ ] Read and store the cited excerpt.
- [ ] Mark stale evidence.
- [ ] Mark weakly supporting evidence.
- [ ] Reject fabricated references.
- [ ] Add adversarial evidence tests.

**Exit criteria**

- [ ] Fabricated paths are rejected.
- [ ] Invalid line ranges are rejected.
- [ ] Changed files mark evidence stale.
- [ ] Verified evidence includes an exact excerpt hash.

---

# Phase 26 — Research Capsule Compiler

**Primary outcome:** Return a compact verified research result to the main model.

**Checklist**

- [ ] Convert worker claims into capsule claims.
- [ ] Attach only verified evidence.
- [ ] Separate verified, inferred, and disputed claims.
- [ ] Select relevant locations.
- [ ] Add confidence calculation.
- [ ] Add uncertainties.
- [ ] Add usage and cost information.
- [ ] Limit capsule size.
- [ ] Persist the final capsule.
- [ ] Add capsule snapshot tests.

**Exit criteria**

- [ ] The main model receives a concise capsule rather than the worker transcript.
- [ ] Unsupported claims are not labeled verified.
- [ ] Relevant files and ranges are explicit.
- [ ] Capsule size remains within configured limits.

---

# Phase 27 — Research Worker Scheduler

**Primary outcome:** Run multiple isolated research workers with bounded concurrency.

**Checklist**

- [ ] Define worker-task state.
- [ ] Implement a concurrency-limited queue.
- [ ] Support different models per worker.
- [ ] Propagate cancellation.
- [ ] Track worker budgets independently.
- [ ] Collect partial results.
- [ ] Isolate worker failures.
- [ ] Emit worker progress events.
- [ ] Persist worker state.
- [ ] Add concurrency tests.

**Exit criteria**

- [ ] Multiple workers can run in parallel.
- [ ] One failed worker does not cancel successful workers unless policy requires it.
- [ ] Global and per-worker budgets are enforced.
- [ ] Cancellation stops queued and running workers.

---

# Phase 28 — Research Planner

**Primary outcome:** Decompose one research request into independent bounded questions.

**Checklist**

- [ ] Define the research-plan schema.
- [ ] Classify common research task types.
- [ ] Generate one question per worker role.
- [ ] Avoid duplicate questions.
- [ ] Attach candidate evidence to each question.
- [ ] Limit the number of questions.
- [ ] Allow deterministic templates for common tasks.
- [ ] Validate plans before execution.
- [ ] Add planning tests.

**Exit criteria**

- [ ] A bug-localization request produces distinct flow, state, and test questions.
- [ ] Each question can be executed independently.
- [ ] Plans respect configured worker limits.
- [ ] Invalid or redundant plans are rejected or repaired.

---

# Phase 29 — Contradiction Detector

**Primary outcome:** Detect incompatible claims across worker reports.

**Checklist**

- [ ] Normalize claims by subject.
- [ ] Group claims about the same symbol or behavior.
- [ ] Detect direct contradictions.
- [ ] Detect conflicting file-location claims.
- [ ] Detect conflicting sequence or ownership claims.
- [ ] Link contradictions to evidence.
- [ ] Classify mechanically resolvable contradictions.
- [ ] Persist disagreement objects.
- [ ] Add contradiction fixtures and tests.

**Exit criteria**

- [ ] Known contradictory reports create a disagreement record.
- [ ] Equivalent wording is grouped where possible.
- [ ] Non-conflicting complementary claims are not falsely marked contradictory.
- [ ] Every disagreement links back to its source reports and evidence.

---

# Phase 30 — Critic Agent

**Primary outcome:** Challenge verified research conclusions before handoff.

**Checklist**

- [ ] Define the critic prompt.
- [ ] Give the critic verified claims only.
- [ ] Include explicit disagreements.
- [ ] Require accepted and rejected claim IDs.
- [ ] Require missing-investigation suggestions.
- [ ] Restrict the critic to read-only evidence tools.
- [ ] Enforce a strict budget.
- [ ] Persist the critic report.
- [ ] Add critic tests with mocked outputs.

**Exit criteria**

- [ ] The critic can reject an unsupported root-cause claim.
- [ ] The critic cannot promote unverified evidence to verified status.
- [ ] The critic identifies missing investigation paths in fixtures.
- [ ] The final capsule records critic adjustments.

---

# Phase 31 — Follow-Up Research Loop

**Primary outcome:** Run targeted additional research when evidence remains insufficient.

**Checklist**

- [ ] Define insufficiency conditions.
- [ ] Convert critic gaps into new focused questions.
- [ ] Reuse existing verified evidence.
- [ ] Prevent duplicate searches.
- [ ] Limit follow-up rounds.
- [ ] Track cumulative budget.
- [ ] Stop when no useful new evidence is found.
- [ ] Mark partial outcomes clearly.
- [ ] Add follow-up tests.

**Exit criteria**

- [ ] A missing-caller fixture triggers one focused follow-up.
- [ ] Follow-up research does not restart the whole investigation.
- [ ] Budget exhaustion returns a partial capsule.
- [ ] Infinite research loops are impossible.

---

# Phase 32 — Research Stopping Policy

**Primary outcome:** Decide when research is sufficient to return to the frontier model.

**Checklist**

- [ ] Define minimum evidence coverage.
- [ ] Define confidence thresholds.
- [ ] Define unresolved-major-contradiction rules.
- [ ] Define diminishing-return rules.
- [ ] Define executable-confirmation rules.
- [ ] Define budget-exhaustion behavior.
- [ ] Define partial-result behavior.
- [ ] Add stopping-decision explanations.
- [ ] Add policy tests.

**Exit criteria**

- [ ] High-confidence fixtures stop without unnecessary extra workers.
- [ ] Contradictory fixtures do not falsely report high confidence.
- [ ] Budget exhaustion returns an honest partial result.
- [ ] Every stop decision records its reason.

---

# Phase 33 — Semantic Model Reliability

**Primary outcome:** Route research work using evidence quality, not only transport success.

**Checklist**

- [ ] Define semantic failure categories.
- [ ] Record schema-validity rate.
- [ ] Record valid-evidence rate.
- [ ] Record useful-claim rate.
- [ ] Record contradiction rate.
- [ ] Record average cost and latency.
- [ ] Add semantic retry rules.
- [ ] Add model cooldown for repeated invalid evidence.
- [ ] Add role-specific model scores.
- [ ] Add routing tests.

**Exit criteria**

- [ ] A model returning fabricated paths loses evidence reliability.
- [ ] The router can retry a semantically failed task on another model.
- [ ] Transport and semantic failures remain distinct.
- [ ] Model selection can differ by research role.

---

# Phase 34 — Role-Based Tool Policy

**Primary outcome:** Enforce different permissions for main, research, critic, and utility agents.

**Checklist**

- [ ] Define agent roles.
- [ ] Define tool allowlists per role.
- [ ] Define repository path policies.
- [ ] Define write policies.
- [ ] Define command policies.
- [ ] Define network policies.
- [ ] Enforce policy before tool execution.
- [ ] Add approval hooks.
- [ ] Log denied operations.
- [ ] Add privilege-escalation tests.

**Exit criteria**

- [ ] Research workers cannot write files.
- [ ] Utility models cannot read repository content.
- [ ] The main agent cannot bypass approval-required actions.
- [ ] Policy denial is enforced outside model control.

---

# Phase 35 — Secret Protection

**Primary outcome:** Prevent accidental disclosure of local secrets to model providers.

**Checklist**

- [ ] Define default blocked path patterns.
- [ ] Add secret-pattern scanning.
- [ ] Redact secrets from tool outputs.
- [ ] Block sensitive files from research workers.
- [ ] Add explicit user override flow.
- [ ] Record which provider receives each source excerpt.
- [ ] Redact secrets from logs.
- [ ] Add common credential fixtures.
- [ ] Add false-positive handling.
- [ ] Add secret-protection tests.

**Exit criteria**

- [ ] Known secret fixtures are blocked or redacted.
- [ ] Secret values do not appear in logs or transcripts.
- [ ] A model cannot request blocked files indirectly.
- [ ] User overrides are explicit and auditable.

---

# Phase 36 — Command Approval and Sandboxing

**Primary outcome:** Control risky local execution.

**Checklist**

- [ ] Classify commands by risk.
- [ ] Require approval for medium- and high-risk classes as configured.
- [ ] Add environment isolation.
- [ ] Restrict working directories.
- [ ] Restrict network access where supported.
- [ ] Deny Git push by default.
- [ ] Deny package publishing by default.
- [ ] Add process resource limits.
- [ ] Add sandbox diagnostics.
- [ ] Add malicious-command tests.

**Exit criteria**

- [ ] High-risk commands cannot execute without approval.
- [ ] Denied network or filesystem access fails safely.
- [ ] Process limits are enforced.
- [ ] Sandbox limitations are clearly reported on unsupported platforms.

---

# Phase 37 — Audit Log

**Primary outcome:** Record every significant model and tool action for inspection.

**Checklist**

- [ ] Define audit event schema.
- [ ] Record model requests without raw secrets.
- [ ] Record tool calls.
- [ ] Record approvals.
- [ ] Record policy denials.
- [ ] Record changed files.
- [ ] Record command exit codes.
- [ ] Add correlation IDs.
- [ ] Add log rotation.
- [ ] Add `Deep audit` command.
- [ ] Add audit integrity tests.

**Exit criteria**

- [ ] A completed task can be reconstructed from audit metadata.
- [ ] Sensitive data is redacted.
- [ ] Audit records are ordered and correlated.
- [ ] Users can inspect actions from the CLI.

---

# Phase 38 — Language Server Integration

**Primary outcome:** Add precise definitions and references through LSP.

**Checklist**

- [ ] Detect supported languages.
- [ ] Start one language server per language and workspace.
- [ ] Implement `get_definition`.
- [ ] Implement `find_references`.
- [ ] Implement `find_implementations`.
- [ ] Add server startup timeout.
- [ ] Add server restart behavior.
- [ ] Cache stable query results by snapshot.
- [ ] Fall back to syntax search when unavailable.
- [ ] Add LSP integration tests.

**Exit criteria**

- [ ] Definitions and references work for the first supported language.
- [ ] LSP failure does not break repository research.
- [ ] Results contain exact source ranges.
- [ ] Server processes stop when the CLI exits.

---

# Phase 39 — Dependency Graph

**Primary outcome:** Build a queryable graph of files, symbols, imports, and calls.

**Checklist**

- [ ] Define graph node types.
- [ ] Define graph edge types.
- [ ] Build import edges.
- [ ] Build export edges.
- [ ] Build syntax-based call edges.
- [ ] Merge LSP reference data.
- [ ] Implement caller and callee queries.
- [ ] Implement dependent-file queries.
- [ ] Persist graph data by snapshot.
- [ ] Add graph fixtures and tests.

**Exit criteria**

- [ ] The graph can trace a known call path in fixtures.
- [ ] Imports and dependents are queryable.
- [ ] Incomplete edges are labeled with confidence.
- [ ] Graph updates are incremental.

---

# Phase 40 — Test Relationship Mapping

**Primary outcome:** Identify tests related to files and symbols.

**Checklist**

- [ ] Detect test directories and naming conventions.
- [ ] Parse configured test commands.
- [ ] Link tests by imports.
- [ ] Link tests by symbol references.
- [ ] Link tests by naming similarity.
- [ ] Record test confidence.
- [ ] Implement `get_related_tests`.
- [ ] Support targeted test execution.
- [ ] Persist recent test results.
- [ ] Add test-mapping fixtures.

**Exit criteria**

- [ ] Relevant tests rank near the top for known source fixtures.
- [ ] The main agent can run targeted tests from research output.
- [ ] Weak relationships are labeled.
- [ ] Test failures are linked to the current snapshot and patch state.

---

# Phase 41 — Git History Intelligence

**Primary outcome:** Make relevant history available to research workers.

**Checklist**

- [ ] Implement file history queries.
- [ ] Implement symbol-adjacent blame.
- [ ] Retrieve relevant commit messages.
- [ ] Detect recent changes to cited ranges.
- [ ] Link commits to files and symbols.
- [ ] Limit history context by relevance.
- [ ] Add history evidence references.
- [ ] Add history-query tests.

**Exit criteria**

- [ ] A research worker can inspect recent changes to a relevant symbol.
- [ ] History queries are bounded.
- [ ] Commit evidence is distinguishable from source evidence.
- [ ] Repositories without history degrade gracefully.

---

# Phase 42 — Cache Invalidation Engine

**Primary outcome:** Keep indexes and research artifacts correct after code changes.

**Checklist**

- [ ] Define artifact dependency metadata.
- [ ] Invalidate changed file indexes.
- [ ] Invalidate changed symbol records.
- [ ] Invalidate affected graph edges.
- [ ] Invalidate stale evidence.
- [ ] Invalidate summaries by content hash.
- [ ] Preserve unrelated cache entries.
- [ ] Add watcher-triggered invalidation.
- [ ] Add manual `Deep index --rebuild`.
- [ ] Add invalidation tests.

**Exit criteria**

- [ ] Editing one file does not rebuild the entire repository.
- [ ] Research capsules referencing changed code become stale.
- [ ] Unrelated cached analysis remains usable.
- [ ] A full rebuild produces the same final index as incremental updates.

---

# Phase 43 — Main-Session Compaction

**Primary outcome:** Keep long coding sessions within model context limits.

**Checklist**

- [ ] Define preserved session facts.
- [ ] Summarize old tool output.
- [ ] Preserve active task constraints.
- [ ] Preserve modified files.
- [ ] Preserve research capsule conclusions.
- [ ] Preserve test status.
- [ ] Remove duplicate source excerpts.
- [ ] Add manual `/compact`.
- [ ] Add automatic compaction thresholds.
- [ ] Add compaction regression tests.

**Exit criteria**

- [ ] Long sessions continue after compaction.
- [ ] Active task constraints are not lost.
- [ ] The model still knows modified files and test state.
- [ ] Worker transcripts remain outside main context.

---

# Phase 44 — Observability

**Primary outcome:** Measure model, research, repository, and execution behavior.

**Checklist**

- [ ] Add structured application logging.
- [ ] Add model-call metrics.
- [ ] Add token and cost metrics.
- [ ] Add tool latency metrics.
- [ ] Add research-worker metrics.
- [ ] Add evidence-validity metrics.
- [ ] Add index and cache metrics.
- [ ] Add command and test metrics.
- [ ] Add `Deep trace`.
- [ ] Add `Deep cost`.
- [ ] Add diagnostic export.

**Exit criteria**

- [ ] A task report shows total cost and token use.
- [ ] A research report shows worker success and evidence validity.
- [ ] Slow components can be identified.
- [ ] Logs can be exported without exposing secrets.

---

# Phase 45 — Evaluation Harness

**Primary outcome:** Compare the combined architecture against simpler baselines.

**Checklist**

- [ ] Define benchmark task format.
- [ ] Create known-bug repository fixtures.
- [ ] Implement direct-frontier baseline.
- [ ] Implement deterministic-retrieval baseline.
- [ ] Implement single-researcher baseline.
- [ ] Implement multi-researcher pipeline.
- [ ] Measure localization precision and recall.
- [ ] Measure patch and test success.
- [ ] Measure frontier-model token savings.
- [ ] Measure total cost and latency.
- [ ] Add reproducible benchmark commands.

**Exit criteria**

- [ ] All four strategies can run against the same fixture set.
- [ ] Results are stored in machine-readable form.
- [ ] The research architecture demonstrates measurable value or exposes where it does not.
- [ ] Regressions can be detected over time.

---

# Phase 46 — Packaging and Distribution

**Primary outcome:** Ship Deep as one reliable installable CLI.

**Checklist**

- [ ] Build production bundles.
- [ ] Package required parser assets.
- [ ] Detect optional external dependencies.
- [ ] Add platform-specific installation checks.
- [ ] Add `Deep doctor`.
- [ ] Add upgrade handling.
- [ ] Add clean uninstall behavior.
- [ ] Add release versioning.
- [ ] Add release CI.
- [ ] Test installation on supported platforms.

**Exit criteria**

- [ ] A new user can install and run Deep with one package command.
- [ ] No separate research service installation is required.
- [ ] Missing optional dependencies produce actionable guidance.
- [ ] Release artifacts pass smoke tests.

---

# Phase 47 — User Documentation

**Primary outcome:** Document installation, configuration, safety, and workflows.

**Checklist**

- [ ] Write the installation guide.
- [ ] Write the quick-start guide.
- [ ] Write the model-provider guide.
- [ ] Write the research-mode guide.
- [ ] Write the security and privacy guide.
- [ ] Write the configuration reference.
- [ ] Write the CLI command reference.
- [ ] Write troubleshooting guidance.
- [ ] Add example sessions.
- [ ] Add architecture diagrams.
- [ ] Add contributor documentation.

**Exit criteria**

- [ ] A new user can complete a basic coding task from the documentation.
- [ ] A user can configure main and research models.
- [ ] Security defaults and data-sharing behavior are clearly explained.
- [ ] Contributors can locate module boundaries and testing requirements.

---

# Release Gates

## Alpha Gate

Required phases:

- [ ] Phases 01–15 complete.
- [ ] Main agent can read, edit, run tests, and show a diff.
- [ ] Session resume works.
- [ ] Basic permission prompts work.
- [ ] No known critical data-loss bugs.

## Research MVP Gate

Required phases:

- [ ] Phases 16–26 complete.
- [ ] `research_codebase` returns a verified capsule.
- [ ] Research workers are read-only.
- [ ] Frontier-model context receives the capsule, not the worker transcript.
- [ ] At least one benchmark shows reduced frontier-model input.

## Research Swarm Gate

Required phases:

- [ ] Phases 27–33 complete.
- [ ] Multiple models can investigate independently.
- [ ] Contradictions are detected.
- [ ] Critic review works.
- [ ] Research stopping rules prevent unbounded loops.
- [ ] Semantic model reliability affects routing.

## Security Beta Gate

Required phases:

- [ ] Phases 34–37 complete.
- [ ] Secrets are protected.
- [ ] Risky commands require approval.
- [ ] Research workers cannot write.
- [ ] Audit logs are available.
- [ ] Prompt-injection and path-traversal tests pass.

## Public Beta Gate

Required phases:

- [ ] Phases 38–45 complete.
- [ ] LSP and graph features work for supported languages.
- [ ] Incremental cache invalidation is reliable.
- [ ] Session compaction works.
- [ ] Evaluation results are reproducible.
- [ ] Cost and quality regressions are monitored.

## Version 1.0 Gate

Required phases:

- [ ] All phases complete.
- [ ] Installation works on every supported platform.
- [ ] Documentation is complete.
- [ ] No open critical security issues.
- [ ] No known repository-corruption bugs.
- [ ] End-to-end benchmarks meet the defined quality and cost targets.
- [ ] Upgrade and rollback procedures are tested.

---

# Definition of Done for Every Phase

A phase is complete only when:

- [ ] Its primary outcome is implemented.
- [ ] All public interfaces are typed.
- [ ] Unit tests pass.
- [ ] Integration tests pass where applicable.
- [ ] Error behavior is tested.
- [ ] Cancellation behavior is tested where applicable.
- [ ] Security implications are reviewed.
- [ ] Relevant documentation is updated.
- [ ] No later-phase feature has been mixed into the phase.
- [ ] The CLI remains buildable and usable.
- [ ] The phase has a short completion note in `docs/progress/`.

---

# Recommended First Build Target

Do not attempt the complete system before validating the core economic assumption.

The first serious validation target is the **Research MVP Gate**:

```text
main coding agent
    +
deterministic repository localization
    +
one inexpensive research worker
    +
mechanical evidence verification
    +
compact research capsule
```

Measure whether this reduces frontier-model repository-reading cost while preserving or improving bug-localization quality. Build the multi-model swarm only after the single-worker pipeline demonstrates value.
