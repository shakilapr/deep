# Research Mode

Deep's research mode (`deepagent research <question>`) investigates a codebase and
produces a **ResearchCapsule** — a machine-readable, evidence-backed answer.

## Pipeline

1. **Localize** — a deterministic localizer ranks candidate files/symbols for
   the question using the repository index (no model calls).
2. **Plan** — the planner turns the question into 1–4 focused sub-questions
   (flow, state, tests, history roles).
3. **Workers** — each sub-question is answered by a research worker model call
   that returns a structured report: conclusion, confidence, and claims with
   evidence references (`{path, startLine, endLine}`).
4. **Verify** — every evidence reference is checked against the actual files:
   fabricated paths become `invalid_path`, out-of-range lines `invalid_range`.
   Only claims with valid evidence are marked `verified`.
5. **Compile** — the capsule compiler merges reports into a single capsule:
   conclusion + confidence label, claims, verified locations, uncertainties,
   and usage. Raw worker transcripts are **never** embedded.

## Depth

| depth  | sub-questions |
| ------ | ------------- |
| quick  | 1             |
| normal | 2 (default)   |
| deep   | 4             |

## Budgets

`ResearchBudget` caps workers, model calls, tokens, cost (USD), and wall time.
When a budget is exhausted the run stops and compiles what it has; the capsule
records actual usage under `usage`.

## Evidence verification

Claims are only `verified` when their cited file exists in the snapshot and the
cited line range is in bounds. Disputed or unverifiable claims are downgraded
(`inferred` / `disputed`) and lower the capsule confidence. Contradictions
between workers are detected and surfaced for critic review.

## Output

The capsule is printed as JSON, followed by a one-line summary
(`Research done: N claims, M verified locations, confidence <label>`) and a
cost line.
