The research system should not feel like a separate service, MCP server, or second application. It should be a native internal capability of the coding agent, similar to how a CLI agent internally invokes search, shell, or test tools.

The user experience becomes:

```bash
npm install -g Deep

cd my-project
Deep
```

Then:

```text
> Find why the motor remains enabled after CAN timeout and fix it.
```

Internally, the frontier model can invoke a native `research` capability that launches cheap models, collects evidence, and returns a compressed answer—all inside the same CLI process.

# Combined architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     Integrated CLI Agent                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Terminal UI                         │  │
│  │  Chat · Diff viewer · Approvals · Progress · Models   │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                   Session Kernel                      │  │
│  │                                                       │  │
│  │  Main conversation · Context · Compaction · Events    │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                 Main Coding Agent                     │  │
│  │                 Frontier model                        │  │
│  │                                                       │  │
│  │  Understand task · Request research · Edit · Test     │  │
│  └─────────────┬────────────────────────────┬────────────┘  │
│                │                            │               │
│        research(...)                  coding tools          │
│                │                            │               │
│  ┌─────────────▼─────────────┐  ┌──────────▼─────────────┐  │
│  │ Research Runtime          │  │ Workspace Runtime      │  │
│  │                           │  │                        │  │
│  │ Planner                   │  │ Read/write files       │  │
│  │ Free-model workers        │  │ Apply patches          │  │
│  │ Critic                    │  │ Run commands           │  │
│  │ Evidence verifier         │  │ Run tests              │  │
│  │ Context compiler          │  │ Git operations         │  │
│  └─────────────┬─────────────┘  └──────────┬─────────────┘  │
│                │                            │               │
│  ┌─────────────▼────────────────────────────▼─────────────┐  │
│  │               Local Repository Engine                 │  │
│  │                                                       │  │
│  │ Tree-sitter · LSP · ripgrep · Git · Index · Cache     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Unified Model Router                  │  │
│  │                                                       │  │
│  │ Frontier models · OpenRouter free models · Fallbacks  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Everything is local except the model API calls.

# It should be a modular monolith

This is one application and normally one operating-system process, but it still has clean internal modules.

```text
One installation
One CLI command
One TUI
One configuration
One credential store
One session database
One repository index
One tool system
One model router
Multiple isolated model contexts
```

The isolation is logical, not physical.

A research worker can have its own context window without becoming a separately installed application.

openclaw is already structurally suitable for this. Its current code separates the reusable agent core, sessions, tool definitions, provider transport, harness registry, and embedded runtime. The reusable `@openclaw/agent-core` package contains the agent loop, messages, harness contracts, compaction, prompts, skills, and session-storage interfaces. ([openclaw][1])

openclaw also supports a local embedded TUI mode that runs directly against the agent runtime without connecting to a Gateway. This proves that the Gateway is not required for a local CLI experience. ([openclaw][2])

# Use openclaw as source architecture, not as the final application

I would not ship the full personal-assistant distribution and tell users to configure it as a coding agent.

Instead, create a coding-focused distribution:

```text
openclaw                         Your coding CLI
───────────────────────────────────────────────────
Gateway                          Remove by default
Messaging channels               Remove
WhatsApp/Telegram integrations   Remove
Personal assistant memory        Replace with repo memory
Cron and automation              Defer
Voice and media tools            Remove
Browser automation               Optional

Agent core                       Keep
Model providers                  Keep
Model fallback                   Keep
Session management               Keep
Compaction                       Keep
TUI framework                    Keep
Subagent runtime                 Keep and specialize
Tool permissions                 Keep
Harness registry                 Keep
```

The result should look more like Aider, Claude Code, Codex CLI, or OpenCode—not like a messaging gateway.

# Native `research` tool

The main coding agent should see research as one first-class tool:

```ts
interface ResearchRequest {
  question: string;

  scope?: {
    paths?: string[];
    symbols?: string[];
    includeTests?: boolean;
    includeGitHistory?: boolean;
  };

  depth?: "quick" | "normal" | "deep";

  budget?: {
    maxWorkers?: number;
    maxModelCalls?: number;
    maxInputTokens?: number;
    maxDurationSeconds?: number;
    maxCostUsd?: number;
  };
}
```

The frontier agent might invoke:

```json
{
  "question": "Trace all paths that can set motorEnabled after a CAN timeout",
  "scope": {
    "symbols": ["motorEnabled", "handleCanTimeout"],
    "includeTests": true
  },
  "depth": "normal",
  "budget": {
    "maxWorkers": 3,
    "maxModelCalls": 6,
    "maxCostUsd": 0.02
  }
}
```

The result should not be a conversation transcript. It should be a compact research capsule:

```ts
interface ResearchCapsule {
  id: string;
  repositorySnapshot: string;

  answer: string;
  confidence: number;

  claims: Array<{
    statement: string;
    status: "verified" | "inferred" | "disputed";
    evidenceIds: string[];
  }>;

  relevantLocations: Array<{
    path: string;
    symbol?: string;
    startLine: number;
    endLine: number;
    reason: string;
  }>;

  callPaths: string[][];

  rejectedHypotheses: Array<{
    hypothesis: string;
    reason: string;
  }>;

  suggestedTests: string[];
  uncertainties: string[];
}
```

The frontier model then reads only the exact ranges it needs.

# Internal execution flow

```text
User task
   │
   ▼
Frontier coding agent
   │
   ├── Easy/local task?
   │      └── Read and edit directly
   │
   └── Large/uncertain task?
          │
          ▼
      research(...)
          │
          ▼
   Deterministic repository search
          │
          ▼
   Cheap-model research workers
          │
          ▼
      Evidence validation
          │
          ▼
       Research capsule
          │
          ▼
     Frontier coding agent
          │
          ▼
       Patch and tests
          │
          ├── Tests pass → finish
          │
          └── Tests fail → targeted research(...)
```

The research operation acts like a sophisticated tool call within the original agent turn.

# Three internal loops

A mature combined agent should have three distinct loops.

## 1. Main coding loop

```text
Model response
   ↓
Tool call
   ↓
Tool result
   ↓
Model response
```

This is the standard CLI-agent loop.

## 2. Research loop

```text
Research question
   ↓
Plan investigations
   ↓
Retrieve candidate code
   ↓
Run cheap workers
   ↓
Verify claims
   ↓
Resolve disagreements
   ↓
Return research capsule
```

This happens inside a `research` tool invocation.

## 3. Execution loop

```text
Make patch
   ↓
Run targeted test
   ↓
Inspect failure
   ↓
Repair
   ↓
Run wider tests
```

All three loops belong to the same application and session.

# Do not put worker transcripts into the main context

This is critical for cost reduction.

Suppose three free workers each consume 50,000 tokens. The frontier model should not receive their combined 150,000-token conversation.

Store the worker transcripts locally:

```text
.Deep/
├── index/
├── sessions/
├── research/
│   └── rs_0192/
│       ├── plan.json
│       ├── worker-a.jsonl
│       ├── worker-b.jsonl
│       ├── worker-c.jsonl
│       ├── verification.json
│       └── capsule.json
└── cache/
```

The main conversation receives only something like:

```text
Research completed.

Likely cause:
The watchdog clears motorEnabled, but command-loop restores the previously
requested state on the next control cycle.

Confidence: 0.91

Relevant locations:
- src/safety/watchdog.ts:88–104
- src/control/command-loop.ts:143–166
- src/control/command-arbiter.ts:31–92
- tests/control/can-timeout.test.ts:18–97

Uncertainty:
Hardware scheduler ordering has not been reproduced.
```

That is where most of the savings come from.

# Shared local repository engine

Every internal agent should use the same repository engine.

```text
RepositoryEngine
├── snapshot()
├── searchText()
├── searchSymbols()
├── getDefinition()
├── findReferences()
├── findCallers()
├── findCallees()
├── readRange()
├── relatedTests()
├── gitHistory()
├── verifyEvidence()
└── runTest()
```

Do not let each research worker independently scan the entire repository through shell commands.

The normal path should be:

```text
Model asks for symbol
    ↓
Repository engine returns ranked matches
    ↓
Model requests selected source ranges
```

Shell search remains available as a fallback.

# Internal research roles

Use isolated contexts, but keep them inside the same runtime:

```text
Research Supervisor
├── Flow researcher
├── State/data researcher
├── Tests/configuration researcher
├── Critic
└── Synthesizer
```

openclaw’s native subagents already use separate sessions and an in-process queue. They can receive different models and are intended for parallel research, with configurable concurrency and tool restrictions. ([openclaw][3])

However, I would change the completion mechanism for coding research.

openclaw currently returns a subagent’s result through an announcement process. Your coding CLI should instead return typed internal results directly:

```ts
const reports = await researchPool.run([
  {
    role: "flow",
    model: selectFreeModel("code-navigation"),
    question: flowQuestion
  },
  {
    role: "state",
    model: selectFreeModel("code-reasoning"),
    question: stateQuestion
  },
  {
    role: "tests",
    model: selectFreeModel("test-analysis"),
    question: testQuestion
  }
]);
```

The UI can display progress without putting it into the model transcript:

```text
Researching codebase
  ✓ Control-flow trace
  ✓ State writers
  ◌ Tests and history
  ◌ Evidence verification
```

# One unified model router

Use one router for the entire CLI:

```text
ModelRouter
├── mainModel
├── researchModels
├── criticModel
├── summarizerModel
├── fallbackChains
├── availability tracking
├── rate-limit cooldowns
├── semantic reliability
└── task-specific scoring
```

Configuration:

```json
{
  "models": {
    "main": "openai/gpt-5.6-sol",
    "research": {
      "strategy": "openrouter-free",
      "workers": 3,
      "fallbacks": [
        "openrouter/free"
      ]
    },
    "critic": {
      "strategy": "best-available-cheap"
    }
  }
}
```

openclaw already implements provider authentication rotation and model fallback for failures such as rate limits, timeouts, and exhausted provider profiles. ([openclaw][4])

Add your own second layer for semantic failures:

```text
openclaw-style operational fallback
    ├── rate limit
    ├── timeout
    ├── provider unavailable
    └── authentication failure

Your semantic fallback
    ├── fabricated path
    ├── nonexistent symbol
    ├── invalid line range
    ├── unsupported claim
    ├── incomplete investigation
    └── contradiction with verified code
```

# Main model interaction

The frontier model should remain the owner of the coding task.

Its internal tool surface might be:

```text
read_file
read_range
search
research
apply_patch
run_command
run_test
git_diff
ask_user
```

The main model decides:

```text
I understand this file sufficiently
    → inspect directly

I need to understand behavior across many files
    → call research

I received a research result but one uncertainty remains
    → call focused research

I know the change
    → patch and test
```

This is much more natural than transferring the task from one application to another.

# Suggested package architecture

```text
Deep/
├── apps/
│   └── cli/
│       ├── commands/
│       ├── tui/
│       ├── progress/
│       └── approvals/
│
├── packages/
│   ├── agent-core/
│   │   ├── loop/
│   │   ├── messages/
│   │   ├── compaction/
│   │   └── sessions/
│   │
│   ├── coding-agent/
│   │   ├── prompt/
│   │   ├── tools/
│   │   ├── patching/
│   │   └── testing/
│   │
│   ├── research-runtime/
│   │   ├── supervisor/
│   │   ├── planner/
│   │   ├── workers/
│   │   ├── critic/
│   │   ├── verifier/
│   │   └── compiler/
│   │
│   ├── repository-engine/
│   │   ├── treesitter/
│   │   ├── lsp/
│   │   ├── text-search/
│   │   ├── dependency-graph/
│   │   ├── git/
│   │   └── cache/
│   │
│   ├── model-router/
│   │   ├── providers/
│   │   ├── openrouter/
│   │   ├── fallbacks/
│   │   └── quality-registry/
│   │
│   ├── workspace/
│   │   ├── filesystem/
│   │   ├── shell/
│   │   ├── sandbox/
│   │   └── worktree/
│   │
│   └── protocol/
│       ├── research.ts
│       ├── evidence.ts
│       └── events.ts
│
└── package.json
```

# CLI experience

```bash
# Start interactive coding session
Deep

# Give a direct task
Deep "Find and fix the reconnect bug"

# Research without modifying files
Deep research "Explain how CAN fault recovery works"

# Automated research and patching
Deep fix "Motor remains enabled after communication loss"

# Continue a session
Deep resume

# Select main and research models
Deep models
```

Inside the TUI:

```text
/research Why does reconnect leave stale listeners?
/research deep Trace all CAN command arbitration paths
/models
/research-models
/cost
/agents
/diff
/test
```

openclaw itself now supports local embedded terminal operation, so this coding-focused design can reuse that runtime path rather than requiring a Gateway connection. ([openclaw][2])

# Foreground process by default

The default should be:

```text
Deep starts
    ↓
Loads configuration
    ↓
Opens local session
    ↓
Indexes current repository
    ↓
Runs until user exits
    ↓
Saves session and cache
```

No daemon.

No Docker requirement.

No separate server.

No second installation.

Optionally, later:

```bash
Deep daemon
```

could keep indexes warm or support IDE integration, but it should not be necessary for the normal CLI experience.

# Forking strategy

The practical route is:

1. Fork openclaw.
2. Add a new coding-focused CLI entry point.
3. Use its reusable agent core, provider handling, sessions, compaction, tool policies, TUI components, and subagent queue.
4. Remove Gateway dependence from the coding path.
5. Add the repository engine.
6. Replace general subagent announcement output with typed research reports.
7. Add the research tool to the main coding agent.
8. Remove unrelated personal-assistant capabilities from the distribution.

openclaw’s harness system is already designed to separate the low-level executor for an agent turn from model providers and tool registries. That makes it possible to implement specialized coding and research runtimes without putting everything into one giant agent loop. ([openclaw][5])

# Most important architectural distinction

Do not build:

```text
CLI coding agent
    calls
Research application
    calls
openclaw server
```

Build:

```text
Integrated coding CLI
├── main coding runtime
├── research runtime
├── shared model router
├── shared repository engine
├── shared session storage
└── shared terminal UI
```

So from the user’s perspective, it is one CLI agent.

From the codebase perspective, it remains modular enough that research, indexing, model routing, and patching can be tested independently.

The central feature is simply:

> **The frontier coding agent has a native, verifiable, multi-model `research()` tool.**

That is the combined architecture I would recommend.

[1]: https://docs.openclaw.ai/agent-runtime-architecture "Agent runtime architecture - openclaw"
[2]: https://docs.openclaw.ai/cli/tui?utm_source=chatgpt.com "TUI - openclaw"
[3]: https://docs.openclaw.ai/tools/subagents "Sub-agents - openclaw"
[4]: https://docs.openclaw.ai/model-failover?utm_source=chatgpt.com "Model failover - openclaw"
[5]: https://docs.openclaw.ai/plugins/sdk-agent-harness?utm_source=chatgpt.com "Agent harness plugins - openclaw"
