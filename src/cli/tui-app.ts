// Phase 53 — Interactive REPL (optional primary interface per architecture §7.1).
// Reuses wire() + runAgentLoop + runResearch. One-shot `deep <task>` still works.
import * as readline from "node:readline";
import { wire } from "./entry.js";
import { buildToolRuntime } from "../coding-agent/tools/index.js";
import { runAgentLoop } from "../agent-core/agentLoop.js";
import { runResearch } from "../research-runtime/research.js";
import { SessionKernel } from "../agent-core/session.js";
import { printMessage, printCost } from "./tui.js";
import { metrics } from "../observability/logging.js";
import { buildApproval } from "./approval.js";

export async function startRepl(
  root: string,
  out: (s: string) => void = console.log,
  opts: { autoApprove?: boolean } = {},
): Promise<void> {
  const w = await wire(root);
  const toolRuntime = buildToolRuntime(w.engine, w.policy, w.bus);
  const kernel = new SessionKernel(w.store, w.bus);
  const requestApproval = buildApproval(!!opts.autoApprove, out);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "deep> " });
  let cancel: AbortController | undefined;

  out("Deep interactive mode. Type /help for commands, /exit to quit.");
  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input.startsWith("/")) {
      const [cmd, ...rest] = input.slice(1).split(" ");
      switch (cmd) {
        case "exit":
        case "quit":
          rl.close();
          return;
        case "help":
          out("/research <q>  run research\n/task <t>     run a coding task\n/models        list models\n/cost          token/cost summary\n/context       repo overview\n/cancel        cancel current run\n/session       list sessions\n/exit          quit");
          break;
        case "research": {
          cancel = new AbortController();
          const id = w.engine.snapshots.create().id;
          const cap = await runResearch({ question: rest.join(" "), depth: "normal" }, { engine: w.engine, router: w.router, root, snapshotId: id });
          printMessage("assistant", `Research: ${cap.claims.length} claims, ${cap.locations.length} locations, confidence ${cap.conclusion.confidenceLabel}.`, out);
          break;
        }
        case "task": {
          cancel = new AbortController();
          const session = kernel.create(root);
          const res = await runAgentLoop(rest.join(" "), { router: w.router, toolRuntime, policy: w.policy, root, sessionId: session.id, requestApproval }, { signal: cancel.signal });
          printMessage("assistant", res.final, out);
          break;
        }
        case "models":
          out(`primary candidates: ${w.router.selectForRole("main")}`);
          break;
        case "cost": {
          const c = metrics.snapshot().counters;
          printCost(
            {
              calls: c["model.calls"] ?? 0,
              inputTokens: c["tokens.input"] ?? 0,
              outputTokens: c["tokens.output"] ?? 0,
              costUsd: c["cost.usd"] ?? 0,
            },
            out,
          );
          break;
        }
        case "context":
          out(JSON.stringify(w.engine.overview()));
          break;
        case "cancel":
          cancel?.abort();
          out("cancelling...");
          break;
        case "session":
          for (const s of kernel.list()) out(`${s.id}  msgs=${s.messageCount}`);
          break;
        default:
          out(`unknown command: /${cmd}`);
      }
      rl.prompt();
      return;
    }
    // Default: treat as a coding task.
    cancel = new AbortController();
    const session = kernel.create(root);
    const res = await runAgentLoop(input, { router: w.router, toolRuntime, policy: w.policy, root, sessionId: session.id, requestApproval }, { signal: cancel.signal });
    printMessage("assistant", res.final, out);
    rl.prompt();
  });

  rl.on("close", () => {
    out("bye");
    process.exit(0);
  });
}
