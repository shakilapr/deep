# CLI Reference

```
deepagent <task>              Run the coding agent on a task in the current repo
deepagent research <question> Research the codebase and print a ResearchCapsule
deepagent config show         Show resolved configuration (secrets redacted)
deepagent config validate     Validate configuration
deepagent doctor              Check environment/repo health
deepagent resume | sessions   List resumable sessions
deepagent trace               Print metrics + recent event summary
deepagent cost                Print token/cost summary
deepagent audit               Print the audit log for this repo
deepagent evaluate <dir>      Run the evaluation harness on a fixture directory
deepagent --help | -h         Show help
deepagent --version | -v      Show version
```

## Commands

### `deepagent <task>`
Runs the agent loop: model plans, calls tools (read/write/search/shell) under
the policy engine, and prints the final assistant message. A session is
created and can be resumed later.

### `deepagent research <question>`
Read-only investigation. Prints a JSON ResearchCapsule plus a summary and cost
line. See `docs/research-mode.md`.

### `deepagent config show` / `deepagent config validate`
Shows the resolved config with secrets redacted, or validates it and exits
non-zero with the offending field on failure.

### `deepagent doctor`
Checks Node version (>= 22.5) and repository indexability, and prints a
model/provider readiness line.

### `deepagent sessions` / `deepagent resume`
Lists stored sessions with message counts and update times.

### `deepagent trace`
Prints a metrics snapshot (tokens, cost, tool calls, timers) and recent event
count.

### `deepagent cost`
Prints a human-readable token and cost summary.

### `deepagent audit`
Prints audit-log entries from `.deep/` if present; otherwise reports that no
audit log exists.

### `deepagent evaluate <fixtureDir>`
Runs research against a fixture with `ground-truth.json` and prints a
machine-readable `EvalReport` (recall@1/@5, evidence validity, root-cause
coverage, usage).