# ADR 0001 — Product name and modular-monolith structure

## Status
Accepted (2026-07-24)

## Context
The four planning documents describe "CodeClaw", a fork/adaptation of OpenClaw intended
to be a one-install local CLI coding agent with a native multi-model research runtime.
Two decisions were open:

1. **Product name.** Upstream planning used "CodeClaw" and a `codeclaw` CLI. The product is
   renamed to **Deep** with the command `deep` (analogous to `claude` / `codex`).
2. **Packaging.** The docs describe a multi-package pnpm workspace. To keep the M0–M3
   build tractable and runnable offline we implement a **single installable package with
   strict internal module boundaries** (a modular monolith), exactly as the architecture
   permits ("One installation, one CLI command, one process, clean internal modules").

## Decision
- CLI command is `deep`; package name `deep`; config dir `.deep/`; all planning docs
  renamed to use "Deep"/"deep".
- Source is organized into internal modules under `src/` that mirror the planned packages
  (`protocol`, `observability`, `persistence`, `model-router`, `policy`, `agent-core`,
  `coding-agent`, `repository-engine`, `research-runtime`, `tooling`, `cli`). Each module
  exposes a typed public surface; cross-module imports go only through `src/protocol`.
- Models are **mock-first / pluggable**: a `MockProvider` implements the normalized
  `Provider` interface so the full pipeline runs without API keys; real OpenAI /
  Anthropic / OpenRouter adapters drop in behind the same interface.
- OpenClaw (and OpenHands / Potpie / Agentless / Aider) are cloned into `references/` for
  pattern reference only; they are **not** runtime dependencies.

## Consequences
- `deep` installs and runs from a single `npm install` + build; zero native dependencies.
- All 26 phases (M0–M3) are implemented and covered by automated tests.
- A future split into the planned pnpm packages is mechanical (move each `src/` module to
  its own package and re-point imports at `protocol`).
