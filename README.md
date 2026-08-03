# Deep

A local-first CLI coding agent with a **native, multi-model research runtime**. One
installable command — `deepagent` — one process, a modular TypeScript monolith.

The frontier coding model can call a first-class `research` flow that dispatches
cheap models against a deterministic repository index, **verifies every source
claim mechanically**, and returns a compact *ResearchCapsule* — keeping expensive
model context out of the main loop. There is also a read-only `review` mode that
grades findings on an L0–L5 evidence ladder and emits SARIF.

---

## What it is

- A command you run inside a repository: `deepagent "fix the reconnect bug"`.
- An agent loop that calls tools (read, search, patch, write, shell, git) under a
  role-based **policy engine** — with real approvals for high-risk actions.
- A research runtime: deterministic localization → bounded worker swarm →
  mechanical evidence verification → contradiction detection + critic → compact
  capsule. **Never** the raw worker transcripts.
- Provider-agnostic: works against any OpenAI-compatible endpoint (OpenRouter by
  default, with live free-model discovery), plus a mock provider for offline
  demos/tests and a record/replay provider for deterministic regression.

## How it works (short version)

```
deepagent <task>            deepagent research <q>            deepagent review <q>
   │                            │                                │
   ▼                            ▼                                ▼
 agent loop (turn-bounded)   research runtime                 research runtime
   • model + tool calls        • localize (deterministic)      • same research,
   • tool runtime:               • plan → worker swarm            then grade findings
     policy → approval →         • verify evidence vs snapshot    (L0–L5) + emit SARIF
     schema → timeout            • contradictions + critic
   • final answer               • compact ResearchCapsule
```

Key safety guarantees (the things a "coding agent" must get right):

- **No silent fabrication.** If no model is configured (no key, no `DEEP_MODEL`,
  no config file), `research`/`review`/`task` **fail loudly** rather than mock.
- **Risk is classified server-side** from the command string — a model cannot mark
  `rm -rf /` as "low" to bypass approval.
- **Approvals are real and fail-closed.** High-risk commands prompt on a TTY and
  are **denied** when non-interactive (CI/pipe) unless you pass `--yes` (or set
  `DEEP_AUTO_APPROVE=1`). The previous behavior auto-approved everything.
- **Workers are read-only.** Research/critic roles can never write or execute.
- **`git push` is denied by default.**
- **Audit log** records tool names and outcomes (not arguments), all entries
  secret-redacted, under `<repo>/.deep/audit/`.

> For the full, code-grounded walkthrough, see **[`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md)**.

---

## Install

Deepagent needs **Node >= 22.5**.

### From npm (recommended once published)

```bash
npm install -g deepagent
deepagent --help
```

`npm install -g` puts the `deepagent` command on your PATH; npm's bin shim runs
`node` for you, so no manual invocation is needed.

### From a local clone (development / before publish)

```bash
git clone <this-repo>
cd deep
npm install
npm run build          # tsc -> dist/
node dist/cli/entry.js --help
# optional: link it globally so `deepagent` works anywhere
npm link
```

### Run without installing

```bash
npm run dev -- <args>     # tsx src/cli/entry.ts <args>
# or
node dist/cli/entry.js <args>
```

## Configure

Deepagent resolves a model with this precedence (see `docs/HOW_IT_WORKS.md` for
the exact logic):

1. `DEEP_MODEL` (or `DEEP_MODELS_MAIN`) env var — explicit, e.g. `DEEP_MODEL=mock/main`.
2. `OPENROUTER_API_KEY` env var (or a `.env` file containing it) — use OpenRouter's
   free models, discovered live with an 8s timeout and cached to `.deep/free-models.json`.
3. `models.main` in `~/.deep/config.json` or `<repo>/.deep/config.json`.

With none set, model-driven commands refuse to run:

```
error: no model configured: set OPENROUTER_API_KEY (recommended) for real models,
or set DEEP_MODEL=mock/main to run in mock/demo mode.
```

Tip: `deepagent doctor` prints the resolved state, e.g.

```
node v22.x ok (>=22.5)
repo /path/to/repo ok: 312 files, 4180 symbols, git=true
model: OpenRouter key present — free models discovered at runtime
```

## Usage

```bash
# interactive REPL (default when no subcommand)
deepagent

# one-shot coding task (writes/edits your repo under policy)
deepagent "Find and fix the reconnect bug"
deepagent --yes "Fix the reconnect bug"        # auto-approve high-risk actions

# read-only research → prints a ResearchCapsule JSON + cost line
deepagent research "Why does the reconnect handler leave stale listeners?"
deepagent research "..." --depth quick|normal|deep

# CI-style bug review → L-graded findings, optional SARIF
deepagent review "Audit the auth flow" B --tests --sarif=out.sarif
```

Other commands (all read-only / housekeeping): `config show` / `config validate`,
`doctor`, `index [--rebuild]`, `graph [file]`, `log [--graph]`, `trace`, `cost`,
`audit`, `sessions`, `evaluate <dir>`. Run `deepagent --help` for the full list.

### Approval model (autonomous by default)

- Low/medium-risk tool calls run **without** prompting.
- **High-risk** commands (`rm -rf*`, `git push`, `npm publish`, `sudo`, `mkfs`,
  `dd if=`, fork bombs, `shutdown`/`reboot`) **prompt on a TTY** and are
  **denied** when stdin/stdout are not a TTY.
- `--yes` / `DEEP_AUTO_APPROVE=1` auto-approves everything (use in CI or when you
  trust the run). `config` defaults: `requireApprovalForCommand: ["high"]`,
  `requireApprovalForWrite: false`, `denyGitPush: true`.

## Testing

```bash
npm test          # vitest — 139 tests across 20 files
npm run typecheck # tsc --noEmit
npm run build     # tsc -> dist/
```

The suite is deliberately practical and covers distinct user paths: brand-new
user (no config → fail-loud), key-present `doctor`, `research`/`review` end-to-end
with the mock provider, the offline `HttpProvider` against a local server,
free-model discovery (mocked `fetch`), approval deny/allow through the real agent
loop, read-only housekeeping commands, and the evaluation harness on the F02
fixture. Fixtures live in `evaluations/fixtures/`.

## Repository layout

```
src/protocol           shared typed contracts (config, events, model, tools, evidence, research)
src/observability      event bus, logging/metrics, audit, trace
src/persistence        atomic JSON store (SQLite-swappable interface)
src/config             layered config loader + validation + redaction
src/model-router       Provider contract; HttpProvider, MockProvider, Replay; reliability registry
src/policy             role-based tool policy, server-side risk, secret protection
src/agent-core         session kernel, main agent loop, compaction
src/coding-agent       tools (read, patch, write, command, git, workspace) + tool runtime
src/repository-engine  filesystem index, lexical/symbol search, snapshots, git, history, deps, LSP
src/research-runtime   localizer → planner → workers → verify → critic → capsule → report/sarif
src/cli                entrypoint, parseArgs, wire, approval, REPL, TUI
src/evaluation         evaluation harness over ground-truth fixtures
scripts                check-free-models.js (manual diagnostic, not the runtime path)
docs                   HOW_IT_WORKS.md, cli.md, research-mode.md, security.md, adr/
```

## Publishing / hosting

This is an npm package (`"name": "deepagent"`, `"bin": { "deepagent":
"dist/cli/entry.js" }`). Two ways to make `deepagent` installable:

1. **Publish to the npm registry** (public, simplest for users):
   ```bash
   npm run build            # ensures dist/ is up to date
   npm version <newver>
   npm publish              # or: npm publish --access public
   ```
   `dist/`, `README.md`, `CONTRIBUTING.md`, and `docs/` are already in
   `package.json` `files`; `npm publish` only ships those (source/tests are
   excluded). After publishing, anyone can `npm i -g deepagent`.

2. **GitHub only** (no npm account needed) — install straight from the repo:
   ```bash
   npm install -g github:<github-user>/deep
   ```
   ⚠️ Caveat: `dist/` is **gitignored**, so a GitHub checkout has no built CLI. A
   GitHub-only install will not work out of the box unless you either (a) commit
   `dist/`, or (b) add a build step, e.g. a `prepublishOnly` script:
   ```jsonc
   "prepublishOnly": "npm run build"
   ```
   (and keep installing from a tag/release where dist was pushed). For the smoothest
   end-user experience, publishing to npm is recommended — `npm publish` packs
   whatever is in `dist/` on disk at publish time.

See `CONTRIBUTING.md` for local development flow.

## Status

Functional and tested end-to-end with the mock and HTTP providers. The runtime
guarantees above (fail-loud config, server-side risk classification, real
approvals, read-only workers, redacted audit) are enforced by tests. See
`docs/HOW_IT_WORKS.md` for what is and isn't implemented, and `docs/adr/` for
architecture decisions.

## License

MIT — declared in `package.json` (`"license": "MIT"`).