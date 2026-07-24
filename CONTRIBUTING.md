# Contributing to Deep

Deep is a modular monolith: one installable CLI, one process, strict internal module
boundaries. Every module exposes a typed public surface and cross-module imports go
through `src/protocol`.

## Workflow

1. `npm install`
2. Implement behind a typed interface in the relevant `src/` module.
3. Add tests in `tests/<area>.test.ts` (Vitest, tag with `describe` per phase).
4. `npm run typecheck && npm test` must pass.
5. Keep the CLI usable and the build green at every step.

## Rules

- No feature from a later phase in an earlier phase.
- Research workers are **read-only**; they never write or run unrestricted commands.
- Model-generated claims are not trusted until verified against repository evidence.
- The main coding model owns code changes.
- Do not add native dependencies without discussion (target: zero native build steps).

## Architecture decisions

Record non-trivial decisions in `docs/adr/` (see `0001-product-name-and-modular-monolith.md`).
