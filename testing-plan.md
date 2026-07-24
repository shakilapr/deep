# Deep Complete Testing Plan

## Purpose

This document defines how Deep will be tested to prove that its architecture works as intended.

Deep is expected to behave as one installable local CLI coding agent containing:

- a frontier-model coding agent;
- openclaw-style orchestration;
- a native multi-model research runtime;
- a deterministic repository intelligence engine;
- evidence verification;
- safe file editing and command execution;
- model routing, fallback, budgeting, and observability.

This plan tests not only individual functions, but also the most important architectural claims:

1. The product behaves as one CLI application.
2. Research workers remain isolated from the main coding context.
3. Research workers cannot modify the repository.
4. Deterministic repository tools are used before expensive model exploration.
5. Every verified research claim points to real, current source evidence.
6. Stale evidence is detected after source changes.
7. The frontier model receives a compact research capsule rather than worker transcripts.
8. Operational model failure and semantic research failure are handled differently.
9. Research, editing, testing, and cancellation remain bounded.
10. User files, secrets, and pre-existing changes are protected.
11. The research architecture reduces frontier-model context cost without unacceptable quality loss.
12. The CLI remains usable after failures, restarts, interrupted commands, and partial research runs.

Each testing phase below has one primary objective, a checklist, and an exit gate.

---

# 1. Testing Principles

## 1.1 Test behavior at the lowest useful level

Use:

- unit tests for deterministic logic;
- contract tests for package boundaries;
- integration tests for collaborating components;
- end-to-end tests for complete user workflows;
- benchmark tests for quality, cost, and latency;
- security tests for permissions and data exposure;
- chaos tests for failures and interrupted execution.

Do not use live language models for tests that can be validated with mocks or deterministic fixtures.

## 1.2 Separate deterministic correctness from model quality

Deterministic components must have exact pass/fail tests:

- path validation;
- snapshot hashing;
- evidence validation;
- cache invalidation;
- permission enforcement;
- state transitions;
- budget enforcement;
- event ordering.

Model-dependent behavior must be evaluated statistically:

- bug localization;
- claim usefulness;
- research coverage;
- patch success;
- token savings;
- semantic fallback effectiveness.

## 1.3 Make model tests reproducible

Use three model modes:

### Mock mode

A scripted provider returns predefined responses.

Use for:

- unit tests;
- state-machine tests;
- routing tests;
- failure handling;
- schema validation;
- cancellation;
- budget enforcement.

### Replay mode

Previously captured provider responses are replayed locally.

Use for:

- integration tests;
- prompt regressions;
- parser compatibility;
- model-output edge cases.

### Live mode

Real providers and models are used.

Use for:

- nightly evaluation;
- release candidate benchmarks;
- provider conformance;
- model quality measurements.

Live tests must not block ordinary pull-request validation unless explicitly marked.

## 1.4 Every architecture invariant must have a test

An architecture decision is not considered implemented until at least one automated test proves it.

## 1.5 No flaky tests in release gates

A flaky test must be:

- fixed;
- quarantined;
- or removed from the release gate with a documented reason.

Repeated retries must not hide instability.

---

# 2. Architecture Invariants Under Test

The following invariants are mandatory.

## A01 — One-product invariant

The user installs and runs one `Deep` command. Research does not require a separately installed server.

## A02 — Main-agent ownership invariant

Only the main coding agent may request repository writes under normal operation.

## A03 — Research read-only invariant

Research workers, planners, critics, and utility agents cannot write files or execute unrestricted commands.

## A04 — Context-isolation invariant

Worker transcripts remain outside the main model context. Only the final research capsule and explicitly requested evidence are transferred.

## A05 — Snapshot invariant

Every research run and evidence item is tied to a repository snapshot.

## A06 — Evidence invariant

A claim may be labeled `verified` only when its path, range, content hash, and optional symbol are validated against the pinned snapshot.

## A07 — Staleness invariant

Evidence becomes stale when referenced source content changes.

## A08 — Deterministic-first invariant

Repository localization runs before research-model exploration unless explicitly disabled for a test.

## A09 — Bounded-execution invariant

Every model loop, worker run, tool call, command, and research cycle has enforceable limits.

## A10 — Failure-isolation invariant

One worker, provider, parser, or language-server failure does not corrupt unrelated sessions or repository state.

## A11 — Operational-fallback invariant

Timeouts, rate limits, transport failures, and provider failures use operational fallback.

## A12 — Semantic-fallback invariant

Fabricated paths, invalid evidence, schema failures, and non-answers use semantic retry or model replacement.

## A13 — User-change protection invariant

Pre-existing user changes are detected and preserved.

## A14 — Atomic-edit invariant

Failed multi-file edits do not leave a partial patch.

## A15 — Secret-protection invariant

Blocked secrets are not sent to model providers or written to normal logs.

## A16 — Cancellation invariant

Cancellation propagates through model calls, workers, tools, and child processes.

## A17 — Cost-accounting invariant

Every model call records model, provider, tokens, estimated cost, task, and role.

## A18 — Resume invariant

Sessions and incomplete tasks can be recovered after a process restart without transcript corruption.

## A19 — Cache-correctness invariant

Incremental indexes and cached artifacts produce the same logical result as a clean rebuild.

## A20 — Honest-uncertainty invariant

The system returns partial or uncertain research instead of presenting unsupported conclusions as verified.

---

# 3. Test Levels

| Level | Purpose | Typical targets |
|---|---|---|
| Unit | Validate isolated deterministic behavior | parsers, policies, hashes, schemas |
| Contract | Validate package boundaries | model provider, repository engine, tool runtime |
| Component | Validate one package with real dependencies | persistence, model router, indexer |
| Integration | Validate multiple packages together | agent loop plus tools, research plus evidence |
| End-to-end | Validate user workflows | install, research, edit, test, resume |
| Property-based | Explore broad input spaces | paths, patches, schemas, state transitions |
| Fuzz | Find crashes and parsing weaknesses | model output, config, patches, search inputs |
| Mutation | Prove tests detect logic changes | policy, evidence, state machine |
| Performance | Validate speed and resource limits | indexing, search, context compilation |
| Security | Validate trust boundaries | secrets, path traversal, command policy |
| Chaos | Validate failure tolerance | process kill, database lock, provider outage |
| Evaluation | Measure probabilistic model quality | localization, patch success, cost reduction |

---

# 4. Test Environments

## 4.1 Local developer environment

Used for:

- unit tests;
- focused integration tests;
- fixture development;
- debugger-based investigation.

## 4.2 Pull-request CI

Runs:

- formatting;
- linting;
- type checking;
- unit tests;
- contract tests;
- fast integration tests;
- security static checks;
- deterministic end-to-end smoke tests.

## 4.3 Nightly CI

Runs:

- complete integration suite;
- cross-platform tests;
- property-based tests;
- fuzz tests;
- mutation tests;
- performance regression tests;
- recorded-response model tests;
- selected live-model evaluation.

## 4.4 Release-candidate environment

Runs:

- clean installation tests;
- migration tests;
- full security suite;
- chaos tests;
- complete benchmark suite;
- live provider conformance;
- upgrade and rollback validation.

## 4.5 Supported platform matrix

At minimum:

| Platform | Required level |
|---|---|
| Linux x64 | Full test suite |
| Windows x64 | Full CLI, filesystem, process, and path suite |
| macOS arm64 | Full CLI, filesystem, process, and path suite |
| macOS x64 | Installation and smoke suite |
| Linux arm64 | Installation and smoke suite if distributed |

---

# 5. Test Fixture Repository Catalogue

Create fixture repositories under `evaluations/fixtures/`.

Each fixture must include:

- a README describing the intended bug or architecture;
- a known root cause;
- expected relevant files;
- expected relevant symbols;
- expected call or state path;
- expected test command;
- optional known patch;
- machine-readable ground truth.

## F01 — Local single-file bug

Purpose:

- verify direct main-agent inspection;
- verify research is not always required.

## F02 — Competing state writers

Purpose:

- verify symbol/reference retrieval;
- verify state-research worker;
- verify root-cause localization.

Example:

- watchdog writes `enabled = false`;
- command loop later restores `enabled = requested`.

## F03 — Async race

Purpose:

- verify multi-file control-flow investigation;
- verify uncertainty handling;
- verify critic behavior.

## F04 — Configuration override

Purpose:

- verify configuration research;
- verify hidden behavior controlled by environment or feature flag.

## F05 — Alternate platform implementation

Purpose:

- verify platform-specific files;
- verify critic checks alternate implementations.

## F06 — Generated code boundary

Purpose:

- verify generated files are identified;
- verify recommended edits target source generators rather than generated output.

## F07 — Missing regression test

Purpose:

- verify related-test discovery;
- verify test recommendation.

## F08 — Misleading comments

Purpose:

- verify source code outweighs comments;
- verify prompt-injection resistance.

## F09 — Fabricated evidence response

Purpose:

- mock a worker that returns nonexistent paths and ranges;
- verify semantic fallback.

## F10 — Stale snapshot

Purpose:

- modify a cited file after research;
- verify staleness detection.

## F11 — Dirty working tree

Purpose:

- verify pre-existing user changes remain protected.

## F12 — Multi-language repository

Purpose:

- verify parser and LSP fallback behavior.

## F13 — Large monorepo

Purpose:

- verify incremental indexing;
- verify bounded search and context.

## F14 — Broken language server

Purpose:

- verify syntax fallback and failure isolation.

## F15 — Malicious project scripts

Purpose:

- verify command approval and sandboxing.

## F16 — Secret-containing repository

Purpose:

- verify path blocking and redaction.

## F17 — Conflicting research workers

Purpose:

- verify contradiction detection and critic resolution.

## F18 — No conclusive root cause

Purpose:

- verify partial capsule and honest uncertainty.

## F19 — Provider outage

Purpose:

- verify operational fallback and recovery.

## F20 — Process interruption

Purpose:

- verify cancellation, persistence, and resume.

---

# 6. Ground-Truth Format

Each benchmark fixture should contain a file such as:

```json
{
  "fixtureId": "F02",
  "task": "Find why motorEnabled becomes true after timeout",
  "rootCause": {
    "files": [
      "src/safety/watchdog.ts",
      "src/control/command-loop.ts"
    ],
    "symbols": [
      "handleTimeout",
      "applyCommand"
    ],
    "summary": "The command loop restores a stale requested state after the watchdog clears the enabled state."
  },
  "relevantFiles": [
    "src/safety/watchdog.ts",
    "src/control/command-loop.ts",
    "src/control/command-arbiter.ts",
    "tests/can-timeout.test.ts"
  ],
  "requiredClaims": [
    "The watchdog clears the enabled state.",
    "The command loop can write the enabled state afterward."
  ],
  "rejectedClaims": [
    "The timeout is never detected."
  ],
  "testCommand": "pnpm test -- can-timeout",
  "expectedPatchFiles": [
    "src/control/command-arbiter.ts",
    "tests/can-timeout.test.ts"
  ]
}
```

---

# Phase 01 — Test Infrastructure Bootstrap

**Primary objective:** Establish one repeatable testing foundation for every package.

**Checklist**

- [ ] Select the unit and integration test framework.
- [ ] Configure code coverage.
- [ ] Configure temporary directory helpers.
- [ ] Configure temporary Git repository helpers.
- [ ] Configure process-test helpers.
- [ ] Configure deterministic clocks.
- [ ] Configure deterministic UUID generation for tests.
- [ ] Configure mock model providers.
- [ ] Configure snapshot testing.
- [ ] Configure test tags: `unit`, `integration`, `e2e`, `live`, `slow`, `security`.
- [ ] Configure CI test sharding.
- [ ] Add a test-result artifact format.
- [ ] Add a flaky-test quarantine mechanism.
- [ ] Add test documentation.

**Exit gate**

- [ ] A sample test runs in every package.
- [ ] Coverage is aggregated across the monorepo.
- [ ] CI can run fast and slow suites separately.
- [ ] Test failures preserve useful logs and temporary artifacts.

---

# Phase 02 — Protocol and Schema Testing

**Primary objective:** Prove that shared contracts reject invalid data and remain backward compatible.

**Checklist**

- [ ] Test configuration schemas.
- [ ] Test event schemas.
- [ ] Test tool-call schemas.
- [ ] Test model request and response schemas.
- [ ] Test session and message schemas.
- [ ] Test research request schemas.
- [ ] Test worker report schemas.
- [ ] Test evidence schemas.
- [ ] Test research capsule schemas.
- [ ] Test versioned serialization.
- [ ] Test missing required fields.
- [ ] Test unknown enum values.
- [ ] Test oversized payload rejection.
- [ ] Add property-based generation of invalid objects.
- [ ] Add migration compatibility tests for prior schema versions.

**Exit gate**

- [ ] Invalid protocol data is rejected before reaching business logic.
- [ ] Valid serialized records can be stored and reloaded.
- [ ] One previous supported schema version can be migrated.
- [ ] Schema tests achieve 100% branch coverage for validation rules.

---

# Phase 03 — Configuration Testing

**Primary objective:** Prove configuration precedence, validation, and secret handling.

**Checklist**

- [ ] Test default-only configuration.
- [ ] Test global configuration.
- [ ] Test project configuration.
- [ ] Test environment overrides.
- [ ] Test CLI flag overrides.
- [ ] Test complete precedence order.
- [ ] Test invalid model identifiers.
- [ ] Test invalid budget values.
- [ ] Test invalid path patterns.
- [ ] Test unreadable configuration files.
- [ ] Test malformed JSON or JSON5.
- [ ] Test sensitive-value redaction.
- [ ] Test configuration reload behavior.
- [ ] Fuzz configuration inputs.

**Exit gate**

- [ ] Effective configuration is deterministic.
- [ ] Invalid configuration never starts a partial runtime.
- [ ] Secrets are never printed by `config show`.
- [ ] Configuration errors identify the exact field and source file.

---

# Phase 04 — Persistence and Migration Testing

**Primary objective:** Prove durable, recoverable state storage.

**Checklist**

- [ ] Test clean database creation.
- [ ] Test every migration from the previous supported version.
- [ ] Test idempotent migration execution.
- [ ] Test transaction rollback.
- [ ] Test concurrent read behavior.
- [ ] Test session write locking.
- [ ] Test interrupted writes.
- [ ] Test disk-full simulation where supported.
- [ ] Test database-busy behavior.
- [ ] Test corrupted database detection.
- [ ] Test backup creation.
- [ ] Test recovery from backup.
- [ ] Test transcript and database consistency.
- [ ] Test deletion and cleanup behavior.

**Exit gate**

- [ ] No interrupted transaction leaves half-written task state.
- [ ] Session metadata and transcript references remain consistent.
- [ ] Supported upgrades preserve user data.
- [ ] Corruption produces a clear recovery path instead of silent loss.

---

# Phase 05 — Event Bus Testing

**Primary objective:** Prove ordered, isolated internal communication.

**Checklist**

- [ ] Test one publisher and one subscriber.
- [ ] Test multiple subscribers.
- [ ] Test event ordering within a task.
- [ ] Test correlation ID propagation.
- [ ] Test subscriber exception isolation.
- [ ] Test asynchronous subscriber completion.
- [ ] Test cancellation events.
- [ ] Test event replay from persisted task state.
- [ ] Test event backpressure.
- [ ] Test large event volume.
- [ ] Test no memory leak after subscriber removal.

**Exit gate**

- [ ] Subscriber failure does not crash the task.
- [ ] Events for one task are not incorrectly attributed to another.
- [ ] Ordering is stable within one correlation stream.
- [ ] Sustained event volume does not cause unbounded memory growth.

---

# Phase 06 — Session Kernel Testing

**Primary objective:** Prove correct conversation persistence, isolation, and resume.

**Checklist**

- [ ] Test session creation.
- [ ] Test user-message append.
- [ ] Test assistant-message append.
- [ ] Test tool-call and tool-result pairing.
- [ ] Test session resume.
- [ ] Test parent and child session relationships.
- [ ] Test session cancellation.
- [ ] Test session locking.
- [ ] Test duplicate message prevention.
- [ ] Test restart during an active turn.
- [ ] Test transcript export.
- [ ] Test malformed transcript recovery.
- [ ] Test large session behavior.
- [ ] Test session deletion.

**Exit gate**

- [ ] Message ordering remains correct after restart.
- [ ] Child research messages never appear in the parent transcript unless explicitly summarized.
- [ ] Two writers cannot corrupt one session.
- [ ] Interrupted turns are marked accurately.

---

# Phase 07 — Model Provider Contract Testing

**Primary objective:** Prove every provider behaves through one normalized interface.

**Checklist**

- [ ] Test streaming text.
- [ ] Test non-streaming text.
- [ ] Test tool-call streaming.
- [ ] Test structured output.
- [ ] Test usage reporting.
- [ ] Test provider cancellation.
- [ ] Test provider timeout.
- [ ] Test malformed provider responses.
- [ ] Test authentication failure.
- [ ] Test rate limiting.
- [ ] Test server error.
- [ ] Test empty completion.
- [ ] Test unexpected finish reasons.
- [ ] Run provider conformance tests against mocks.
- [ ] Run selected live conformance tests nightly.

**Exit gate**

- [ ] Provider-specific errors map to normalized error categories.
- [ ] The agent loop does not depend on provider-specific response shapes.
- [ ] Cancellation terminates an active provider request.
- [ ] Token usage is recorded or clearly marked unavailable.

---

# Phase 08 — Model Router Testing

**Primary objective:** Prove correct selection, fallback, cooldown, and accounting.

**Checklist**

- [ ] Test primary-model selection.
- [ ] Test ordered fallback.
- [ ] Test provider fallback for the same model.
- [ ] Test rate-limit cooldown.
- [ ] Test authentication-profile rotation if supported.
- [ ] Test model capability filtering.
- [ ] Test structured-output requirement filtering.
- [ ] Test cost-limit filtering.
- [ ] Test unavailable-model handling.
- [ ] Test no-valid-model failure.
- [ ] Test operational retry limits.
- [ ] Test token and cost aggregation.
- [ ] Test role-specific model selection.
- [ ] Test concurrent route requests.
- [ ] Test cooldown expiry.

**Exit gate**

- [ ] Operational failures move to a valid fallback exactly as configured.
- [ ] The same failed model is not retried indefinitely.
- [ ] Model and provider usage are attributed to the correct role.
- [ ] Global and task-specific cost limits are enforced.

---

# Phase 09 — Main Agent Loop Testing

**Primary objective:** Prove bounded model-tool-model execution.

**Checklist**

- [ ] Test direct final response.
- [ ] Test one tool call.
- [ ] Test multiple sequential tool calls.
- [ ] Test multiple tool calls in one model response if supported.
- [ ] Test invalid tool name.
- [ ] Test invalid tool arguments.
- [ ] Test tool failure returned to model.
- [ ] Test model retry after transient failure.
- [ ] Test maximum turn limit.
- [ ] Test maximum tool-call limit.
- [ ] Test model cancellation.
- [ ] Test tool cancellation.
- [ ] Test user steering between turns.
- [ ] Test duplicate tool-call IDs.
- [ ] Test malformed model output.

**Exit gate**

- [ ] Infinite loops are impossible.
- [ ] Tool failures do not corrupt session state.
- [ ] Cancellation stops the complete active turn.
- [ ] Every model and tool step is persisted and auditable.

---

# Phase 10 — Tool Runtime Testing

**Primary objective:** Prove tools are validated, authorized, bounded, and observable.

**Checklist**

- [ ] Test tool registration.
- [ ] Test duplicate tool registration.
- [ ] Test unknown tool rejection.
- [ ] Test input validation.
- [ ] Test output validation.
- [ ] Test timeout.
- [ ] Test cancellation.
- [ ] Test policy denial.
- [ ] Test approval-required result.
- [ ] Test tool exception conversion.
- [ ] Test lifecycle events.
- [ ] Test concurrent independent tools.
- [ ] Test tools sharing a locked resource.
- [ ] Fuzz tool arguments.

**Exit gate**

- [ ] Invalid input never reaches tool implementation.
- [ ] Policy checks occur before execution.
- [ ] Tool exceptions become structured results.
- [ ] Tools cannot continue after cancellation or timeout.

---

# Phase 11 — Filesystem Safety Testing

**Primary objective:** Prove repository reads and writes cannot escape allowed boundaries.

**Checklist**

- [ ] Test normal relative paths.
- [ ] Test absolute paths.
- [ ] Test `..` traversal.
- [ ] Test mixed path separators.
- [ ] Test Windows drive paths.
- [ ] Test UNC paths.
- [ ] Test symlinks escaping the repository.
- [ ] Test case-insensitive filesystem behavior.
- [ ] Test ignored files.
- [ ] Test binary files.
- [ ] Test very large files.
- [ ] Test files changing during read.
- [ ] Test permission-denied files.
- [ ] Property-test normalized path handling.

**Exit gate**

- [ ] No read or write can escape the repository policy boundary.
- [ ] Symlink escapes are denied.
- [ ] Large or binary files do not flood context.
- [ ] Cross-platform path tests pass.

---

# Phase 12 — Patch Engine Testing

**Primary objective:** Prove edits are atomic, accurate, and reversible.

**Checklist**

- [ ] Test single-file patch.
- [ ] Test multi-file patch.
- [ ] Test stale context rejection.
- [ ] Test ambiguous context rejection.
- [ ] Test line-ending preservation.
- [ ] Test encoding preservation.
- [ ] Test file creation.
- [ ] Test file deletion.
- [ ] Test rename if supported.
- [ ] Test partial write failure.
- [ ] Test rollback.
- [ ] Test concurrent user edit during patch.
- [ ] Test patch against symlink.
- [ ] Fuzz malformed patch input.
- [ ] Run mutation tests on conflict detection.

**Exit gate**

- [ ] Failed multi-file patches leave no partial modifications.
- [ ] Stale source cannot be silently overwritten.
- [ ] Rollback restores original contents.
- [ ] User modifications made after the patch plan are detected.

---

# Phase 13 — Command Runner Testing

**Primary objective:** Prove process execution is bounded and terminates correctly.

**Checklist**

- [ ] Test successful command.
- [ ] Test non-zero exit.
- [ ] Test stdout streaming.
- [ ] Test stderr streaming.
- [ ] Test output truncation.
- [ ] Test timeout.
- [ ] Test cancellation.
- [ ] Test child-process tree termination.
- [ ] Test environment filtering.
- [ ] Test working-directory restriction.
- [ ] Test shell metacharacters.
- [ ] Test direct-exec mode.
- [ ] Test interactive-command rejection.
- [ ] Test very large output.
- [ ] Test platform-specific termination behavior.

**Exit gate**

- [ ] Timed-out or cancelled process trees do not remain running.
- [ ] Exit status and truncated output are recorded accurately.
- [ ] Commands cannot change the execution directory outside policy.
- [ ] Sensitive environment variables are absent unless allowed.

---

# Phase 14 — Git Protection Testing

**Primary objective:** Prove Deep preserves user work and accurately reports its own changes.

**Checklist**

- [ ] Test clean repository.
- [ ] Test modified tracked files.
- [ ] Test staged changes.
- [ ] Test untracked files.
- [ ] Test detached HEAD.
- [ ] Test repository without commits.
- [ ] Test nested repository.
- [ ] Test worktree.
- [ ] Test agent edits beside user edits.
- [ ] Test diff attribution.
- [ ] Test rollback of agent-only changes.
- [ ] Test denied Git push.
- [ ] Test denied destructive reset.
- [ ] Test branch switching while a task is active.

**Exit gate**

- [ ] Pre-existing user changes are never silently discarded.
- [ ] Agent-created changes are distinguishable.
- [ ] Remote write operations are unavailable by default.
- [ ] Snapshot staleness is triggered by branch or content changes.

---

# Phase 15 — Filesystem Index Testing

**Primary objective:** Prove the file index is complete, incremental, and reproducible.

**Checklist**

- [ ] Test initial scan.
- [ ] Test incremental scan.
- [ ] Test added file.
- [ ] Test modified file.
- [ ] Test deleted file.
- [ ] Test renamed file.
- [ ] Test ignored file.
- [ ] Test generated file classification.
- [ ] Test vendored file classification.
- [ ] Test untracked relevant file.
- [ ] Test file watcher event coalescing.
- [ ] Test watcher overflow fallback.
- [ ] Compare incremental result with clean rebuild.
- [ ] Test large repository performance.

**Exit gate**

- [ ] Incremental and clean rebuilds produce equivalent file inventories.
- [ ] Changed files are rehashed; unchanged files are not.
- [ ] Deleted entries are removed.
- [ ] Indexing a supported large fixture remains within the performance budget.

---

# Phase 16 — Lexical Search Testing

**Primary objective:** Prove structured search is accurate, bounded, and deterministic.

**Checklist**

- [ ] Test exact string search.
- [ ] Test regex search.
- [ ] Test case sensitivity.
- [ ] Test file filters.
- [ ] Test ignored paths.
- [ ] Test result limits.
- [ ] Test context lines.
- [ ] Test ranking.
- [ ] Test duplicate-result removal.
- [ ] Test malformed regex.
- [ ] Test binary files.
- [ ] Test Unicode identifiers.
- [ ] Test large result sets.
- [ ] Test cache hits.
- [ ] Compare results with direct `ripgrep` ground truth.

**Exit gate**

- [ ] Structured results match expected paths and line numbers.
- [ ] Result count and context are bounded.
- [ ] Repeated identical searches are deterministic.
- [ ] Search failure does not crash research.

---

# Phase 17 — Syntax and Symbol Testing

**Primary objective:** Prove source structure extraction and symbol navigation.

**Checklist**

- [ ] Test each supported declaration type.
- [ ] Test nested symbols.
- [ ] Test overloaded methods where relevant.
- [ ] Test imports and exports.
- [ ] Test anonymous functions.
- [ ] Test syntax errors.
- [ ] Test partially valid files.
- [ ] Test generated files.
- [ ] Test Unicode symbol names.
- [ ] Test symbol range accuracy.
- [ ] Test exact symbol search.
- [ ] Test fuzzy symbol search.
- [ ] Test ranking.
- [ ] Compare incremental parse with clean parse.
- [ ] Test parser-version invalidation.

**Exit gate**

- [ ] Ground-truth symbols are found with correct ranges.
- [ ] Broken files do not crash indexing.
- [ ] Exact matches rank above fuzzy matches.
- [ ] Cached parse results are invalidated when parser version changes.

---

# Phase 18 — Snapshot Testing

**Primary objective:** Prove repository states are uniquely and correctly represented.

**Checklist**

- [ ] Test clean commit snapshot.
- [ ] Test modified tracked file.
- [ ] Test staged change.
- [ ] Test untracked file.
- [ ] Test ignored file.
- [ ] Test line-ending-only change.
- [ ] Test file rename.
- [ ] Test branch change.
- [ ] Test detached HEAD.
- [ ] Test same contents in separate repositories.
- [ ] Test snapshot comparison.
- [ ] Test concurrent file changes during snapshot.
- [ ] Property-test snapshot determinism.

**Exit gate**

- [ ] Identical logical states produce identical snapshot IDs.
- [ ] Relevant content changes produce different snapshot IDs.
- [ ] Ignored changes do not invalidate snapshots unless configured.
- [ ] Snapshot creation detects unstable concurrent changes.

---

# Phase 19 — Evidence Verification Testing

**Primary objective:** Prove only real, current source references can become verified evidence.

**Checklist**

- [ ] Test valid path and range.
- [ ] Test nonexistent path.
- [ ] Test invalid line range.
- [ ] Test reversed range.
- [ ] Test range beyond EOF.
- [ ] Test missing symbol.
- [ ] Test symbol outside range.
- [ ] Test content-hash mismatch.
- [ ] Test stale snapshot.
- [ ] Test generated file.
- [ ] Test binary file.
- [ ] Test weak semantic support classification.
- [ ] Test evidence persistence.
- [ ] Fuzz path and range combinations.
- [ ] Mutation-test verification branches.

**Exit gate**

- [ ] Fabricated evidence is never marked verified.
- [ ] Content changes mark prior evidence stale.
- [ ] Symbol-linked evidence must overlap the symbol range.
- [ ] Evidence status is deterministic and reproducible.

---

# Phase 20 — Deterministic Localization Testing

**Primary objective:** Prove repository candidates are found before model research.

**Checklist**

- [ ] Test identifier extraction.
- [ ] Test quoted-string extraction.
- [ ] Test error-message lookup.
- [ ] Test symbol expansion.
- [ ] Test defining-file expansion.
- [ ] Test importer expansion.
- [ ] Test related-test naming heuristics.
- [ ] Test ranking.
- [ ] Test candidate budget.
- [ ] Test no-match behavior.
- [ ] Test misleading keyword behavior.
- [ ] Test multi-language repository.
- [ ] Record whether model invocation begins only after localization completes.
- [ ] Measure Recall@1, Recall@5, and Recall@10.

**Exit gate**

- [ ] Deterministic localization runs before worker dispatch.
- [ ] Curated fixture Recall@5 meets the initial target of at least 85%.
- [ ] Candidate output stays within configured limits.
- [ ] No complete repository content is placed into worker prompts.

---

# Phase 21 — Single Research Worker Testing

**Primary objective:** Prove one isolated read-only worker can return structured, evidence-linked research.

**Checklist**

- [ ] Test successful structured report.
- [ ] Test invalid JSON.
- [ ] Test missing required fields.
- [ ] Test tool-call limit.
- [ ] Test token budget.
- [ ] Test timeout.
- [ ] Test cancellation.
- [ ] Test fabricated evidence.
- [ ] Test irrelevant answer.
- [ ] Test explicit uncertainty.
- [ ] Test transcript isolation.
- [ ] Test read-only policy.
- [ ] Test worker-session persistence.
- [ ] Test provider failure.
- [ ] Test semantic retry.

**Exit gate**

- [ ] Worker transcripts remain outside the main session.
- [ ] Worker cannot write or run forbidden commands.
- [ ] Invalid evidence triggers semantic failure.
- [ ] A valid worker report can be converted to verified claims.

---

# Phase 22 — Research Capsule Testing

**Primary objective:** Prove the frontier model receives a compact, accurate research handoff.

**Checklist**

- [ ] Test verified claim inclusion.
- [ ] Test inferred claim labeling.
- [ ] Test disputed claim labeling.
- [ ] Test rejected claim exclusion from conclusions.
- [ ] Test relevant-location selection.
- [ ] Test uncertainty inclusion.
- [ ] Test usage accounting.
- [ ] Test capsule size limit.
- [ ] Test duplicate evidence removal.
- [ ] Test stable serialization.
- [ ] Test stale-capsule detection.
- [ ] Compare capsule context size with worker transcript size.
- [ ] Test main-session insertion.

**Exit gate**

- [ ] Capsule contains no raw chain of worker conversation.
- [ ] Every verified claim has valid evidence IDs.
- [ ] Capsule remains under the configured context budget.
- [ ] Median capsule size is at least 80% smaller than combined worker transcripts on fixtures.

---

# Phase 23 — Multi-Worker Scheduler Testing

**Primary objective:** Prove parallel research remains bounded, isolated, and recoverable.

**Checklist**

- [ ] Test concurrency limit.
- [ ] Test queue ordering.
- [ ] Test independent model selection.
- [ ] Test one worker failure.
- [ ] Test all workers failing.
- [ ] Test partial completion.
- [ ] Test global cancellation.
- [ ] Test individual worker cancellation.
- [ ] Test global cost budget.
- [ ] Test per-worker budget.
- [ ] Test provider concurrency limit.
- [ ] Test result collection order.
- [ ] Test no shared transcript contamination.
- [ ] Test process restart during research.

**Exit gate**

- [ ] Active workers never exceed configured concurrency.
- [ ] One failure does not corrupt other reports.
- [ ] Global budget stops queued and running work as configured.
- [ ] Partial results survive restart and are clearly marked.

---

# Phase 24 — Research Planner Testing

**Primary objective:** Prove tasks are decomposed into distinct, bounded research questions.

**Checklist**

- [ ] Test bug-localization plan.
- [ ] Test architecture-explanation plan.
- [ ] Test state-tracing plan.
- [ ] Test configuration-analysis plan.
- [ ] Test test-coverage plan.
- [ ] Test duplicate-question removal.
- [ ] Test worker-limit enforcement.
- [ ] Test empty or vague request.
- [ ] Test candidate evidence assignment.
- [ ] Test deterministic template fallback.
- [ ] Test invalid plan repair.
- [ ] Score plan diversity and coverage on fixtures.

**Exit gate**

- [ ] Questions are independently executable.
- [ ] Plans do not exceed configured workers.
- [ ] Duplicate roles or near-identical questions are rejected.
- [ ] Every planned question maps to the original research goal.

---

# Phase 25 — Contradiction and Critic Testing

**Primary objective:** Prove incompatible worker conclusions are surfaced and challenged.

**Checklist**

- [ ] Test direct contradiction.
- [ ] Test complementary claims.
- [ ] Test same claim with different wording.
- [ ] Test conflicting file locations.
- [ ] Test conflicting event ordering.
- [ ] Test conflicting state ownership.
- [ ] Test critic acceptance.
- [ ] Test critic rejection.
- [ ] Test critic uncertainty.
- [ ] Test critic cannot create verified evidence.
- [ ] Test missing-investigation output.
- [ ] Test contradiction persistence.
- [ ] Test fixture F17 end to end.

**Exit gate**

- [ ] Known conflicts generate disagreement records.
- [ ] Complementary reports are not falsely rejected.
- [ ] The critic cannot promote unsupported claims.
- [ ] Final confidence decreases when major contradictions remain.

---

# Phase 26 — Follow-Up and Stopping Testing

**Primary objective:** Prove research continues only when necessary and always terminates.

**Checklist**

- [ ] Test sufficient first-round evidence.
- [ ] Test one missing caller.
- [ ] Test one unresolved contradiction.
- [ ] Test no new evidence.
- [ ] Test follow-up budget exhaustion.
- [ ] Test maximum round count.
- [ ] Test diminishing-return stop.
- [ ] Test executable-confirmation stop.
- [ ] Test timeout stop.
- [ ] Test user cancellation.
- [ ] Test partial capsule.
- [ ] Test explicit stop reason.
- [ ] Model-check the research state machine.

**Exit gate**

- [ ] Infinite research loops are impossible.
- [ ] High-confidence fixtures stop without unnecessary rounds.
- [ ] Insufficient evidence produces partial or uncertain output.
- [ ] Every terminal state records a reason.

---

# Phase 27 — Semantic Routing Testing

**Primary objective:** Prove poor research quality changes model selection.

**Checklist**

- [ ] Test invalid schema penalty.
- [ ] Test fabricated-evidence penalty.
- [ ] Test irrelevant-answer penalty.
- [ ] Test valid-evidence reward.
- [ ] Test role-specific scores.
- [ ] Test minimum sample protection.
- [ ] Test temporary cooldown.
- [ ] Test score recovery.
- [ ] Test model-family diversity preference.
- [ ] Test semantic retry on another model.
- [ ] Test transport success plus semantic failure.
- [ ] Test metrics persistence.

**Exit gate**

- [ ] A successful HTTP response can still be classified as failed research.
- [ ] Repeated semantic failures reduce routing priority.
- [ ] Operational reliability and evidence reliability remain separate metrics.
- [ ] Router choices are explainable from stored metrics.

---

# Phase 28 — Role and Permission Testing

**Primary objective:** Prove permissions are enforced independently of model instructions.

**Checklist**

- [ ] Test main-agent read.
- [ ] Test main-agent write with configured approval.
- [ ] Test research-worker read.
- [ ] Test research-worker write denial.
- [ ] Test critic command denial.
- [ ] Test utility-model repository denial.
- [ ] Test hidden tool invocation.
- [ ] Test renamed or aliased forbidden tool.
- [ ] Test indirect write through command runner.
- [ ] Test path-specific policy.
- [ ] Test network policy.
- [ ] Test privilege-escalation prompt injection.
- [ ] Mutation-test policy decision branches.

**Exit gate**

- [ ] Research and critic roles cannot mutate repository state.
- [ ] Model output cannot override the policy engine.
- [ ] Forbidden operations are logged.
- [ ] Permission checks occur before implementation code.

---

# Phase 29 — Secret Protection Testing

**Primary objective:** Prove sensitive data does not leave permitted boundaries.

**Checklist**

- [ ] Test `.env`.
- [ ] Test private keys.
- [ ] Test cloud credentials.
- [ ] Test tokens in source fixtures.
- [ ] Test credentials in command output.
- [ ] Test secrets in Git history.
- [ ] Test secret-like false positives.
- [ ] Test redaction in logs.
- [ ] Test redaction in transcripts.
- [ ] Test provider-bound prompt inspection.
- [ ] Test user override.
- [ ] Test symlink to secret file.
- [ ] Test encoded secret variants.
- [ ] Fuzz secret scanner inputs.

**Exit gate**

- [ ] Known secrets are blocked or redacted before provider transmission.
- [ ] Logs and normal transcripts contain no raw secret values.
- [ ] Overrides require explicit approval and are auditable.
- [ ] Secret scanning remains within acceptable performance limits.

---

# Phase 30 — Prompt-Injection Testing

**Primary objective:** Prove repository content cannot alter permissions or system behavior.

**Checklist**

- [ ] Add malicious README instructions.
- [ ] Add malicious source comments.
- [ ] Add malicious test output.
- [ ] Add instructions to reveal secrets.
- [ ] Add instructions to run destructive commands.
- [ ] Add instructions pretending to be system messages.
- [ ] Add instructions to disable evidence verification.
- [ ] Add instructions to modify policy configuration.
- [ ] Verify research workers treat content as data.
- [ ] Verify main agent still requires approvals.
- [ ] Verify policy engine denies forbidden actions.
- [ ] Record injection-detection telemetry.

**Exit gate**

- [ ] Repository text cannot grant capabilities.
- [ ] Evidence verification cannot be disabled by repository instructions.
- [ ] Secret and command policies remain effective.
- [ ] All malicious fixtures complete without forbidden effects.

---

# Phase 31 — LSP and Graph Testing

**Primary objective:** Prove advanced navigation improves precision without becoming a single point of failure.

**Checklist**

- [ ] Test LSP startup.
- [ ] Test definition query.
- [ ] Test reference query.
- [ ] Test implementation query.
- [ ] Test language-server crash.
- [ ] Test restart.
- [ ] Test startup timeout.
- [ ] Test unsupported language fallback.
- [ ] Test graph import edges.
- [ ] Test graph call edges.
- [ ] Test caller and callee queries.
- [ ] Test incomplete-edge confidence.
- [ ] Compare graph result with fixture ground truth.
- [ ] Test graph incremental update.

**Exit gate**

- [ ] Supported-language navigation meets fixture accuracy targets.
- [ ] LSP failure falls back to syntax and lexical tools.
- [ ] Graph data updates after relevant source changes.
- [ ] No stale graph edge is presented as current verified evidence.

---

# Phase 32 — Test Mapping Testing

**Primary objective:** Prove related tests are identified and executed correctly.

**Checklist**

- [ ] Test naming-convention mapping.
- [ ] Test import-based mapping.
- [ ] Test symbol-reference mapping.
- [ ] Test configured custom test roots.
- [ ] Test monorepo package boundaries.
- [ ] Test no-test case.
- [ ] Test false-positive ranking.
- [ ] Test targeted command construction.
- [ ] Test test timeout.
- [ ] Test test output parsing.
- [ ] Test flaky test classification.
- [ ] Test result attachment to snapshot and patch.

**Exit gate**

- [ ] Ground-truth relevant tests rank within the top three for curated fixtures.
- [ ] Targeted test commands run in the correct package.
- [ ] Test results cannot be reused after source or patch state changes.
- [ ] Missing test coverage is reported honestly.

---

# Phase 33 — Cache Invalidation Testing

**Primary objective:** Prove incremental cache behavior is equivalent to a clean rebuild.

**Checklist**

- [ ] Test file-content change.
- [ ] Test file deletion.
- [ ] Test file rename.
- [ ] Test public symbol change.
- [ ] Test private implementation change.
- [ ] Test parser-version change.
- [ ] Test prompt-version change.
- [ ] Test model-version change.
- [ ] Test graph-edge invalidation.
- [ ] Test evidence invalidation.
- [ ] Test capsule staleness.
- [ ] Test unrelated cache preservation.
- [ ] Run randomized edit sequences.
- [ ] Compare incremental state with clean rebuild after every sequence.

**Exit gate**

- [ ] Incremental and clean rebuild states are logically equivalent.
- [ ] Unrelated artifacts remain cached.
- [ ] All evidence touching changed content becomes stale.
- [ ] Randomized edit testing produces no divergence.

---

# Phase 34 — Session Compaction Testing

**Primary objective:** Prove long sessions remain correct after context reduction.

**Checklist**

- [ ] Test manual compaction.
- [ ] Test automatic threshold.
- [ ] Preserve current user goal.
- [ ] Preserve user constraints.
- [ ] Preserve modified files.
- [ ] Preserve test status.
- [ ] Preserve research conclusions.
- [ ] Preserve unresolved risks.
- [ ] Remove duplicate excerpts.
- [ ] Keep worker transcripts excluded.
- [ ] Test repeated compaction.
- [ ] Test resume after compaction.
- [ ] Evaluate task success before and after compaction.

**Exit gate**

- [ ] Compacted sessions can continue the active task.
- [ ] Critical state is not lost.
- [ ] Main context size decreases by the configured target.
- [ ] Repeated compaction does not accumulate contradictions.

---

# Phase 35 — Cancellation and Recovery Testing

**Primary objective:** Prove interruption never leaves uncontrolled work or corrupted state.

**Checklist**

- [ ] Cancel during model streaming.
- [ ] Cancel during tool execution.
- [ ] Cancel during command execution.
- [ ] Cancel during indexing.
- [ ] Cancel during worker queueing.
- [ ] Cancel during active workers.
- [ ] Cancel during evidence verification.
- [ ] Cancel during patch application.
- [ ] Kill the CLI process during each major state.
- [ ] Resume after restart.
- [ ] Verify child process cleanup.
- [ ] Verify task terminal state.
- [ ] Verify partial results.
- [ ] Verify database consistency.

**Exit gate**

- [ ] No cancelled child process remains running.
- [ ] Repository state remains valid.
- [ ] Sessions can resume or clearly report non-resumable work.
- [ ] Partial research is never mislabeled complete.

---

# Phase 36 — Chaos and Failure-Injection Testing

**Primary objective:** Prove component failures remain isolated and recoverable.

**Checklist**

- [ ] Inject provider timeout.
- [ ] Inject provider 429.
- [ ] Inject provider 500.
- [ ] Inject malformed model response.
- [ ] Kill a research worker.
- [ ] Crash a language server.
- [ ] Corrupt one cache entry.
- [ ] Lock the database.
- [ ] Simulate disk full.
- [ ] Remove repository file mid-read.
- [ ] Change branch during research.
- [ ] Fail patch write after first file.
- [ ] Hang a test command.
- [ ] Overflow file watcher.
- [ ] Interrupt application shutdown.

**Exit gate**

- [ ] Failures do not corrupt unrelated sessions.
- [ ] Correct fallback or partial-result behavior occurs.
- [ ] Repository modifications remain atomic.
- [ ] Recovery instructions are clear when automatic recovery is impossible.

---

# Phase 37 — Performance Testing

**Primary objective:** Prove local operations remain fast enough for interactive use.

**Checklist**

- [ ] Measure cold startup.
- [ ] Measure warm startup.
- [ ] Measure initial indexing.
- [ ] Measure incremental indexing.
- [ ] Measure lexical search.
- [ ] Measure symbol search.
- [ ] Measure evidence verification.
- [ ] Measure capsule compilation.
- [ ] Measure SQLite write load.
- [ ] Measure memory during large repository indexing.
- [ ] Measure worker concurrency overhead.
- [ ] Measure TUI responsiveness.
- [ ] Add regression thresholds.
- [ ] Store historical results.

**Initial performance targets**

- [ ] Warm CLI startup: under 1.5 seconds on reference hardware.
- [ ] Search response on indexed medium fixture: under 300 ms at p95.
- [ ] Evidence verification per citation: under 50 ms at p95 excluding disk cold start.
- [ ] Incremental re-index of one changed file: under 500 ms at p95.
- [ ] TUI input latency during background research: under 100 ms at p95.
- [ ] Memory remains bounded according to repository-size budget.

**Exit gate**

- [ ] No critical operation exceeds its agreed regression threshold.
- [ ] Performance results are reproducible on reference hardware.
- [ ] Large-repository tests show bounded memory growth.
- [ ] Background research does not make the TUI unusable.

---

# Phase 38 — Load and Concurrency Testing

**Primary objective:** Prove sustained concurrent work respects resource limits.

**Checklist**

- [ ] Run maximum configured workers.
- [ ] Queue more workers than the limit.
- [ ] Run concurrent model routes.
- [ ] Run indexing while reading.
- [ ] Run research while the main agent is idle.
- [ ] Run multiple independent sessions.
- [ ] Attempt two writers on one session.
- [ ] Attempt two patch operations on one workspace.
- [ ] Measure queue latency.
- [ ] Measure memory growth.
- [ ] Verify provider concurrency caps.
- [ ] Verify database lock behavior.

**Exit gate**

- [ ] Concurrency limits are never exceeded.
- [ ] Single-writer resources remain protected.
- [ ] Queue growth is bounded.
- [ ] Sustained load does not leak processes, file handles, or memory.

---

# Phase 39 — End-to-End Coding Journey Testing

**Primary objective:** Prove the complete CLI can solve representative coding tasks.

**Checklist**

- [ ] Install Deep from a clean package.
- [ ] Start an interactive session.
- [ ] Open a fixture repository.
- [ ] Ask a direct local edit.
- [ ] Ask a cross-file bug investigation.
- [ ] Observe research progress.
- [ ] Verify capsule handoff.
- [ ] Apply a patch.
- [ ] Run targeted tests.
- [ ] Show diff.
- [ ] Cancel a second task.
- [ ] Restart the CLI.
- [ ] Resume the first session.
- [ ] Export audit and cost information.
- [ ] Uninstall cleanly.

**Exit gate**

- [ ] A user can complete the full workflow without manual service setup.
- [ ] Research is visibly part of the same CLI product.
- [ ] The correct files are modified.
- [ ] Test and diff results are reported accurately.
- [ ] Resume works after restart.

---

# Phase 40 — Architecture Conformance Testing

**Primary objective:** Prove the implemented system still matches the intended modular architecture.

**Checklist**

- [ ] Enforce package dependency rules.
- [ ] Prevent repository-engine imports from UI packages in the wrong direction.
- [ ] Prevent research-runtime direct file writes.
- [ ] Prevent model-router dependence on TUI.
- [ ] Prevent policy checks from existing only in prompts.
- [ ] Verify all tool execution passes through the tool runtime.
- [ ] Verify all model execution passes through the model router.
- [ ] Verify all research evidence passes through the verifier.
- [ ] Verify the main context cannot load worker transcript files automatically.
- [ ] Verify the CLI does not require a separate daemon.
- [ ] Add static architecture tests.
- [ ] Add runtime architecture assertions.

**Exit gate**

- [ ] No forbidden package dependency exists.
- [ ] No bypass path exists around policy, routing, or evidence verification.
- [ ] The default user workflow runs in one CLI process tree.
- [ ] Architecture invariants A01–A20 each have at least one automated test.

---

# Phase 41 — Security Penetration Testing

**Primary objective:** Attempt to break trust boundaries as an attacker.

**Checklist**

- [ ] Path traversal attack.
- [ ] Symlink escape attack.
- [ ] Shell injection attack.
- [ ] Malicious Git hook attack.
- [ ] Malicious package script attack.
- [ ] Prompt injection attack.
- [ ] Secret exfiltration attack.
- [ ] Provider prompt inspection.
- [ ] Plugin privilege attack if plugins exist.
- [ ] Database tampering.
- [ ] Transcript tampering.
- [ ] Cache poisoning.
- [ ] Race-condition write attack.
- [ ] Dependency vulnerability scan.
- [ ] Manual review by someone outside the implementation team.

**Exit gate**

- [ ] No critical or high-severity issue remains open.
- [ ] Medium issues have documented mitigation or accepted risk.
- [ ] Security tests are converted into permanent regressions.
- [ ] Threat model is updated with discovered attack paths.

---

# Phase 42 — Model Quality Evaluation

**Primary objective:** Measure whether research agents find correct evidence and root causes.

**Checklist**

- [ ] Run every benchmark fixture with one research worker.
- [ ] Run every benchmark fixture with multiple workers.
- [ ] Measure file localization Recall@1, Recall@5, and Recall@10.
- [ ] Measure symbol localization accuracy.
- [ ] Measure evidence validity rate.
- [ ] Measure required-claim coverage.
- [ ] Measure false root-cause rate.
- [ ] Measure uncertainty calibration.
- [ ] Measure contradiction-detection recall.
- [ ] Measure critic usefulness.
- [ ] Compare model families.
- [ ] Repeat runs to measure variance.
- [ ] Store exact model and provider versions.

**Initial quality targets**

- [ ] Verified-evidence validity: 100%.
- [ ] Fabricated evidence accepted as verified: 0%.
- [ ] Relevant-file Recall@5: at least 90% on curated fixtures.
- [ ] Root-cause identification: at least 75% on initial benchmark suite.
- [ ] Major unresolved contradiction mislabeled high confidence: 0%.
- [ ] Honest partial result on intentionally inconclusive fixtures: 100%.

**Exit gate**

- [ ] Quality targets are met or explicitly revised with evidence.
- [ ] Model variance is understood.
- [ ] Regressions are detectable by benchmark history.
- [ ] Routing decisions use measured rather than assumed quality.

---

# Phase 43 — Cost and Context Evaluation

**Primary objective:** Prove the architecture reduces frontier-model context cost.

**Checklist**

- [ ] Run direct-frontier exploration baseline.
- [ ] Run deterministic-retrieval plus frontier baseline.
- [ ] Run one-worker research pipeline.
- [ ] Run multi-worker research pipeline.
- [ ] Record frontier input tokens.
- [ ] Record frontier output tokens.
- [ ] Record research-model tokens.
- [ ] Record total estimated cost.
- [ ] Record latency.
- [ ] Record files opened by the frontier model.
- [ ] Record patch success.
- [ ] Record test success.
- [ ] Compare quality-adjusted cost.

**Initial economic targets**

- [ ] Median frontier input-token reduction: at least 60% versus direct exploration.
- [ ] Median number of frontier-opened files: at least 50% lower.
- [ ] Patch success decreases by no more than 5 percentage points versus direct exploration.
- [ ] Total cost is lower on large-repository tasks.
- [ ] Small local tasks do not become more expensive because research is invoked unnecessarily.

**Exit gate**

- [ ] The research architecture demonstrates measurable savings on large tasks.
- [ ] Savings are not achieved by unacceptable quality loss.
- [ ] Cases where direct exploration is better are documented.
- [ ] Research-invocation heuristics are adjusted from measured results.

---

# Phase 44 — Patch Quality Evaluation

**Primary objective:** Prove the frontier model can implement correct changes from research capsules.

**Checklist**

- [ ] Run tasks with full research capsules.
- [ ] Run tasks with intentionally incomplete capsules.
- [ ] Run tasks with stale capsules.
- [ ] Measure changed-file precision.
- [ ] Measure regression-test addition.
- [ ] Measure build success.
- [ ] Measure targeted-test success.
- [ ] Measure full-test success.
- [ ] Measure unnecessary code churn.
- [ ] Measure rework rounds.
- [ ] Verify the main model independently reads cited ranges before editing.
- [ ] Compare against direct-frontier baseline.

**Exit gate**

- [ ] Stale capsules are rejected or refreshed before patching.
- [ ] Verified evidence improves or preserves patch success.
- [ ] Unnecessary changed files remain below the agreed threshold.
- [ ] Regression tests are added for benchmark bugs when expected.

---

# Phase 45 — Cross-Platform and Packaging Testing

**Primary objective:** Prove one installable CLI works on supported systems.

**Checklist**

- [ ] Test package installation.
- [ ] Test global command resolution.
- [ ] Test first-run setup.
- [ ] Test config directory selection.
- [ ] Test project directory selection.
- [ ] Test path handling on Windows.
- [ ] Test process termination on Windows.
- [ ] Test symlink behavior on Unix systems.
- [ ] Test optional dependency detection.
- [ ] Test upgrade.
- [ ] Test downgrade or rollback policy.
- [ ] Test uninstall.
- [ ] Test package checksum and release artifact integrity.
- [ ] Run clean virtual-machine smoke tests.

**Exit gate**

- [ ] A new user can install and run Deep with one package command.
- [ ] No research server or daemon installation is required.
- [ ] Platform-specific path and process tests pass.
- [ ] Upgrade preserves supported user data.

---

# Phase 46 — Regression and Mutation Testing

**Primary objective:** Prove the test suite detects meaningful defects.

**Checklist**

- [ ] Run mutation testing on policy decisions.
- [ ] Run mutation testing on evidence verification.
- [ ] Run mutation testing on snapshot comparison.
- [ ] Run mutation testing on budget enforcement.
- [ ] Run mutation testing on state transitions.
- [ ] Run mutation testing on patch atomicity.
- [ ] Track mutation score.
- [ ] Convert every production bug into a regression test.
- [ ] Require issue-linked regression fixtures.
- [ ] Review untested branches quarterly.

**Initial mutation targets**

- [ ] Policy engine mutation score: at least 90%.
- [ ] Evidence verifier mutation score: at least 95%.
- [ ] Snapshot and invalidation mutation score: at least 90%.
- [ ] Research state-machine mutation score: at least 90%.

**Exit gate**

- [ ] Critical deterministic components meet mutation targets.
- [ ] Surviving mutations are reviewed and justified.
- [ ] Every fixed critical defect has a permanent regression test.
- [ ] Coverage is not used as the only confidence measure.

---

# Phase 47 — Release Acceptance Testing

**Primary objective:** Decide whether a release is safe and architecturally valid.

**Checklist**

- [ ] All required CI suites pass.
- [ ] Architecture invariants A01–A20 pass.
- [ ] No critical or high security issue remains.
- [ ] No known repository-corruption issue remains.
- [ ] Installation tests pass.
- [ ] Migration tests pass.
- [ ] End-to-end coding journeys pass.
- [ ] Benchmark quality targets pass.
- [ ] Cost-reduction targets pass or have approved exceptions.
- [ ] Performance regressions are within limits.
- [ ] Model-provider live smoke tests pass.
- [ ] Audit and redaction checks pass.
- [ ] Release notes include known limitations.
- [ ] Rollback procedure is verified.

**Exit gate**

- [ ] Release owner signs the test report.
- [ ] Security reviewer signs the security report.
- [ ] Benchmark report is archived.
- [ ] Release artifacts are promoted only after all mandatory gates pass.

---

# 7. CI Pipeline Design

## Pull-request pipeline

Run on every pull request:

1. Formatting
2. Linting
3. Type checking
4. Unit tests
5. Contract tests
6. Fast component tests
7. Protocol compatibility tests
8. Policy and evidence security tests
9. Deterministic end-to-end smoke test
10. Package dependency architecture checks

Target duration: under 15 minutes with sharding.

## Main-branch pipeline

Run after merge:

1. Pull-request pipeline
2. Full integration suite
3. Cross-package coverage
4. Fixture repository suite
5. Incremental-cache equivalence suite
6. Session restart suite
7. Command cancellation suite

## Nightly pipeline

Run nightly:

1. Cross-platform suite
2. Property-based tests
3. Fuzz tests
4. Mutation tests
5. Performance regression suite
6. Chaos suite
7. Recorded-model-response suite
8. Selected live-model evaluation
9. Dependency and vulnerability scan

## Release-candidate pipeline

Run for every release candidate:

1. Clean installation on supported platforms
2. Database migration from supported prior versions
3. Complete security suite
4. Complete benchmark suite
5. Live provider conformance
6. Cost and context comparison
7. Packaging integrity
8. Upgrade and rollback
9. Manual exploratory review

---

# 8. Coverage Requirements

Coverage targets apply mainly to deterministic packages.

| Package | Line coverage | Branch coverage |
|---|---:|---:|
| `protocol` | 95% | 95% |
| `policy-engine` | 95% | 95% |
| `repository-engine` | 90% | 85% |
| `persistence` | 90% | 85% |
| `workspace-runtime` | 90% | 90% |
| `research-runtime` deterministic logic | 90% | 90% |
| `model-router` | 90% | 90% |
| `agent-core` | 90% | 85% |
| `cli` and TUI | 75% | 70% |

Coverage exclusions must be documented.

Coverage does not replace:

- mutation testing;
- end-to-end testing;
- security testing;
- model-quality evaluation.

---

# 9. Required Test Doubles

## Mock model provider

Must support scripted:

- text responses;
- tool calls;
- malformed responses;
- delays;
- timeouts;
- rate limits;
- partial streams;
- usage records;
- cancellation.

## Fake repository engine

Must support deterministic:

- search results;
- symbol results;
- source ranges;
- evidence validation;
- stale snapshots.

## Fake clock

Use for:

- timeouts;
- cooldowns;
- retries;
- session timestamps;
- budget windows.

## Fake command process

Use for:

- streaming;
- hanging;
- child processes;
- exit codes;
- large output;
- cancellation.

## Temporary Git fixture helper

Must create:

- clean repositories;
- dirty trees;
- branches;
- staged changes;
- worktrees;
- untracked files;
- commits with controlled timestamps.

---

# 10. Property-Based and Fuzz Test Areas

Use property-based testing for:

- path normalization;
- patch context matching;
- snapshot hashing;
- cache invalidation;
- schema validation;
- state-machine transitions;
- budget arithmetic;
- event ordering;
- search-result ranking stability.

Use fuzz testing for:

- malformed model JSON;
- truncated streaming responses;
- invalid UTF-8;
- unusual file names;
- malicious path strings;
- patch formats;
- configuration files;
- tool arguments;
- secret-scanner inputs.

Every crash found by fuzzing must become a minimized regression fixture.

---

# 11. Manual Exploratory Test Charters

Automation is required, but exploratory testing should cover:

## Charter A — Long coding session

Run a multi-hour session with:

- several research calls;
- multiple patches;
- repeated test runs;
- one compaction;
- one restart;
- one cancellation.

Observe context drift, UI responsiveness, and state accuracy.

## Charter B — Large unfamiliar repository

Use a repository not represented in fixtures.

Observe:

- indexing time;
- search quality;
- research usefulness;
- cost;
- unnecessary file reads;
- final patch quality.

## Charter C — Hostile repository

Include:

- malicious comments;
- secret files;
- unsafe scripts;
- symlinks;
- misleading docs.

Attempt to cause forbidden actions.

## Charter D — Provider instability

Switch among providers, revoke one credential, and force rate limits.

Observe fallback, error messages, and session continuity.

## Charter E — User edits during agent work

Modify files manually while research or patching is active.

Verify staleness detection and conflict handling.

---

# 12. Release Quality Dashboard

Every release candidate should report:

## Correctness

- unit pass rate;
- integration pass rate;
- end-to-end pass rate;
- mutation score;
- cache equivalence result.

## Research quality

- file Recall@5;
- symbol accuracy;
- evidence validity;
- root-cause accuracy;
- false high-confidence rate;
- contradiction-detection rate.

## Coding quality

- patch success;
- targeted-test success;
- full-test success;
- unnecessary changed files;
- average repair rounds.

## Efficiency

- frontier input-token reduction;
- total cost;
- research cost;
- latency;
- number of frontier-opened files.

## Reliability

- provider fallback success;
- cancellation cleanup;
- resume success;
- crash-free task rate;
- stale-evidence detection.

## Security

- secret leakage count;
- forbidden tool execution count;
- path escape count;
- unresolved high-severity findings.

---

# 13. Release Gates

## Gate 1 — Deterministic Core

Required:

- [ ] Protocol tests pass.
- [ ] Persistence tests pass.
- [ ] Tool runtime tests pass.
- [ ] Filesystem, patch, command, and Git safety tests pass.
- [ ] No critical mutation gap in policy or evidence code.

## Gate 2 — Repository Intelligence

Required:

- [ ] Incremental index equals clean rebuild.
- [ ] Search and symbol fixtures pass.
- [ ] Snapshot tests pass.
- [ ] Stale evidence is always detected.
- [ ] Localization Recall@5 meets target.

## Gate 3 — Research MVP

Required:

- [ ] One research worker is isolated and read-only.
- [ ] Invalid evidence triggers semantic failure.
- [ ] Capsule contains verified evidence only.
- [ ] Main context excludes worker transcripts.
- [ ] Frontier context reduction is measurable.

## Gate 4 — Research Swarm

Required:

- [ ] Worker concurrency limits pass.
- [ ] Contradictions are detected.
- [ ] Critic cannot create verified evidence.
- [ ] Follow-up research terminates.
- [ ] Semantic routing responds to measured quality.

## Gate 5 — Security Beta

Required:

- [ ] Path traversal suite passes.
- [ ] Secret suite passes.
- [ ] Prompt-injection suite passes.
- [ ] Command approval suite passes.
- [ ] No high-severity penetration finding remains.

## Gate 6 — Public Beta

Required:

- [ ] Cross-platform installation passes.
- [ ] End-to-end journeys pass.
- [ ] Resume and cancellation suites pass.
- [ ] Benchmark quality targets pass.
- [ ] Performance remains within limits.

## Gate 7 — Version 1.0

Required:

- [ ] All architecture invariants pass.
- [ ] Cost-reduction target is demonstrated on large tasks.
- [ ] Patch quality remains within accepted range.
- [ ] No critical data-loss or security issue remains.
- [ ] Upgrade and rollback are verified.
- [ ] Complete test and benchmark report is archived.

---

# 14. Traceability Matrix

| Architecture area | Required test phases |
|---|---|
| CLI as one product | 39, 40, 45 |
| Session kernel | 04, 06, 35 |
| Main coding loop | 07, 08, 09, 10 |
| Repository reads and edits | 11, 12, 13, 14 |
| Repository index | 15, 16, 17, 18 |
| Evidence correctness | 19, 20, 21, 22 |
| Multi-agent research | 23, 24, 25, 26, 27 |
| Tool permissions | 28, 30, 41 |
| Secret protection | 29, 41 |
| Advanced code intelligence | 31, 32, 33 |
| Context management | 22, 34 |
| Failure recovery | 35, 36 |
| Performance and load | 37, 38 |
| Model quality | 42, 43, 44 |
| Packaging | 45 |
| Regression strength | 46 |
| Release decision | 47 |

---

# 15. Definition of Done for Testing

A feature is not complete until:

- [ ] Unit tests exist for deterministic behavior.
- [ ] Contract tests exist for public interfaces.
- [ ] Error paths are tested.
- [ ] Cancellation is tested when the operation can block.
- [ ] Security implications are tested.
- [ ] State persistence is tested when state is durable.
- [ ] Observability is tested.
- [ ] Relevant fixture repositories are updated.
- [ ] Architecture invariants remain satisfied.
- [ ] No new flaky test is introduced.
- [ ] Documentation includes how the behavior is verified.

---

# 16. First Validation Sequence

Before building the full research swarm, validate the central economic and architectural hypothesis with this sequence:

## Step 1 — Deterministic baseline

Build and test:

- repository snapshot;
- lexical search;
- symbol index;
- exact source-range reading;
- evidence verification.

## Step 2 — Single-worker research

Build and test:

- one read-only worker;
- structured claims;
- semantic failure;
- compact research capsule.

## Step 3 — Frontier handoff

Measure:

- frontier input tokens;
- files opened by the frontier model;
- patch success;
- test success;
- total cost.

## Step 4 — Decision gate

Continue to multi-worker orchestration only when:

- evidence validity is 100%;
- worker transcripts remain isolated;
- stale evidence is detected;
- median frontier input tokens decrease materially;
- patch success remains acceptable.

This prevents building a complex swarm before proving that the research-capsule architecture creates real value.
