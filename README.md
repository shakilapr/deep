# Deep

A local-first CLI coding agent with a **native, multi-model research runtime**. One
installable command (`deepagent`), one process, modular internals. The frontier coding model
can call a first-class `research` tool that dispatches cheap models against a deterministic
repository index, verifies every source claim, and returns a compact research capsule —
keeping expensive model context out of the loop.

## Quick start

```bash
npm install
npm run build
node dist/cli/entry.js --help
```

Run against any repository:

```bash
cd your-project
node dist/cli/entry.js          # interactive REPL (default when no subcommand)
node dist/cli/entry.js research "Why does the reconnect handler leave stale listeners?"
node dist/cli/entry.js "Find and fix the reconnect bug"  # one-shot coding task
```

## Architecture (modular monolith)

- `src/protocol` — shared typed contracts (config, events, model, tools, evidence, research).
- `src/observability` — in-process event bus + logging/metrics.
- `src/persistence` — atomic JSON store with migrations (SQLite-swappable interface).
- `src/model-router` — one normalized `Provider` interface; `MockProvider` for offline runs.
- `src/policy` — role-based tool allow/deny (research workers are read-only).
- `src/agent-core` — session kernel + main agent loop.
- `src/coding-agent` — tools (read, patch, command, git) and tool runtime.
- `src/repository-engine` — filesystem index, lexical search, symbol index, snapshots, git.
- `src/research-runtime` — localizer → planner → workers → verifier → critic → capsule.
- `src/cli` — `deepagent` entrypoint + TUI.

## Research spine (the core economic bet)

```
research(question)
  → deterministic localizer (no model yet)
  → planner decomposes into bounded questions
  → cheap read-only workers investigate (claims + cited evidence)
  → mechanical evidence verification (real file/line/symbol/hash)
  → contradiction detection + critic
  → compact ResearchCapsule  (never the raw worker transcript)
```

## Testing

```bash
npm test          # vitest — 56 tests across 4 suites
npm run typecheck # tsc --noEmit
npm run build     # tsc -> dist/
```

Fixtures live in `evaluations/fixtures/` (F02 competing-writers, F09 fabricated evidence,
F10 stale snapshot, F17 conflicting workers, F18 no root cause, F20 interruption).

## Status

Phases 01–26 (M0–M3: skeleton → basic agent → repository intelligence → research MVP) are
implemented and tested. See `docs/progress/` and `docs/adr/`.
