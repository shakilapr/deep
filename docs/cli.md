# CLI Reference

```
deep <task>              Run the coding agent on a task in the current repo
deep research <question> Research the codebase and print a ResearchCapsule
deep config show         Show resolved configuration (secrets redacted)
deep config validate     Validate configuration
deep doctor              Check environment/repo health
deep resume | sessions   List resumable sessions
deep trace               Print metrics + recent event summary
deep cost                Print token/cost summary
deep audit               Print the audit log for this repo
deep evaluate <dir>      Run the evaluation harness on a fixture directory
deep --help | -h         Show help
deep --version | -v      Show version
```

## Commands

### `deep <task>`
Runs the agent loop: model plans, calls tools (read/write/search/shell) under
the policy engine, and prints the final assistant message. A session is
created and can be resumed later.

### `deep research <question>`
Read-only investigation. Prints a JSON ResearchCapsule plus a summary and cost
line. See `docs/research-mode.md`.

### `deep config show` / `deep config validate`
Shows the resolved config with secrets redacted, or validates it and exits
non-zero with the offending field on failure.

### `deep doctor`
Checks Node version (>= 22.5) and repository indexability.

### `deep sessions` / `deep resume`
Lists stored sessions with message counts and update times.

### `deep trace`
Prints a metrics snapshot (tokens, cost, tool calls, timers) and recent event
count.

### `deep cost`
Prints a human-readable token and cost summary.

### `deep audit`
Prints audit-log entries from `.deep/` if present; otherwise reports that no
audit log exists.

### `deep evaluate <fixtureDir>`
Runs research against a fixture with `ground-truth.json` and prints a
machine-readable `EvalReport` (recall@1/@5, evidence validity, root-cause
coverage, usage).
