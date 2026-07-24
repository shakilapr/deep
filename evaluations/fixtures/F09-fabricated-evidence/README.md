# F09 — Fabricated evidence fixture

This fixture documents the **Phase 25** semantic-failure scenario for the
research verifier.

The scenario is exercised programmatically (no real source files needed): a
research worker returns a `WorkerReport` whose claims cite:

- a path that does not exist (`src/ghost/file.ts`),
- a line range beyond end-of-file,
- a symbol that is not present in the cited range.

`verifyReports` / `verifyEvidence` must mark these references
`invalid_path` / `invalid_range` / `missing_symbol` and **never** label the
associated claim `verified`. See `tests/phase-checks.test.ts` (Phase 25).
