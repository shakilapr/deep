# Security

## Research is read-only

Research mode never mutates the repository. Workers receive candidate excerpts
and static-analysis results only; they cannot execute commands or write files.
Evidence verification reads files from an immutable snapshot.

## Secret protection

- Configuration display (`deep config show`) redacts secrets (API keys,
  tokens) before printing.
- Files matching common secret patterns (`.env`, key files) are excluded from
  indexing and from tool results.
- Logs and capsules never embed provider credentials.

## Policy engine

All tool execution in the coding agent flows through the `PolicyEngine`:

- `denyGitPush` (default **true**) — the agent can never push.
- `requireApprovalForWrite` — file writes can be gated behind explicit
  approval.
- `requireApprovalForCommand` — shell commands are risk-classified; high-risk
  commands require approval by default.

Policy decisions are deterministic and enforced at the tool runtime boundary,
not by the model.

## Audit

Actions (tool calls, policy decisions, approvals) are appended to an audit log
under `.deep/` in the project. `deep audit` prints the recorded entries so a
reviewer can reconstruct exactly what the agent did and why. Audit records are
append-only and include timestamps.

## Recommendations

- Run Deep in a repository checkout you can discard (or rely on git).
- Keep `denyGitPush` enabled.
- Review `deep audit` output after unattended runs.
