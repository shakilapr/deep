// Phase 09 — Main agent loop
import type { ModelMessage, ToolDefinition } from "../protocol/model.js";
import type { ToolContext } from "../protocol/tools.js";
import type { AgentRole } from "../protocol/events.js";
import { ModelRouter } from "../model-router/router.js";
import { ToolRuntime } from "../tooling/runtime.js";
import { PolicyEngine } from "../policy/policy.js";
import { EventBus } from "../observability/eventBus.js";

export interface AgentLoopDeps {
  router: ModelRouter;
  toolRuntime: ToolRuntime;
  policy: PolicyEngine;
  root: string;
  sessionId: string;
  role?: AgentRole;
  bus?: EventBus;
}

export interface AgentLoopResult {
  final: string;
  toolCalls: number;
  turns: number;
  cancelled: boolean;
}

export async function runAgentLoop(
  userMessage: string,
  deps: AgentLoopDeps,
  opts: { maxTurns?: number; maxToolCalls?: number; signal?: AbortSignal } = {},
): Promise<AgentLoopResult> {
  const maxTurns = opts.maxTurns ?? 12;
  const maxToolCalls = opts.maxToolCalls ?? 30;
  const role: AgentRole = deps.role ?? "main";
  const toolNames = deps.toolRuntime.list();

  const toolDefinitions: ToolDefinition[] = toolNames
    .map((n) => deps.toolRuntime.get(n)?.definition)
    .filter((d): d is ToolDefinition => !!d);

  const messages: ModelMessage[] = [
    {
      role: "system",
      content:
        `You are Deep, a coding agent operating on the repository at ${deps.root}. ` +
        `Available tools: ${toolNames.join(", ")}. ` +
        `Use tools to inspect and modify the repository, then answer the user.`,
    },
    { role: "user", content: userMessage },
  ];

  let final = "";
  let toolCalls = 0;
  let turns = 0;
  let cancelled = false;

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) {
      cancelled = true;
      break;
    }
    turns++;
    deps.bus?.emit({
      type: "AgentTurnStarted",
      sessionId: deps.sessionId,
      taskId: `turn-${turns}`,
      timestamp: Date.now(),
    });

    let response;
    try {
      response = await deps.router.complete({
        modelId: deps.router.selectForRole("main"),
        role,
        messages,
        tools: toolDefinitions,
        signal: opts.signal,
      });
    } catch (e) {
      if (opts.signal?.aborted) {
        cancelled = true;
        break;
      }
      throw e;
    }

    const calls = response.toolCalls ?? [];
    if (calls.length === 0) {
      final = response.content;
      break;
    }

    // Record the assistant turn that requested tool calls.
    messages.push({ role: "assistant", content: response.content, toolCalls: calls });

    let limitHit = false;
    for (const call of calls) {
      if (opts.signal?.aborted) {
        cancelled = true;
        break;
      }
      if (toolCalls >= maxToolCalls) {
        limitHit = true;
        break;
      }
      toolCalls++;
      const ctx: ToolContext = {
        role,
        sessionId: deps.sessionId,
        repoRoot: deps.root,
        signal: opts.signal,
        canApprove: true,
        requestApproval: async () => true,
      };
      let resultText: string;
      try {
        const result = await deps.toolRuntime.execute(call.name, call.arguments, ctx);
        resultText = JSON.stringify({ ok: result.ok, summary: result.summary, data: result.data });
      } catch (e) {
        resultText = JSON.stringify({ ok: false, error: (e as Error).message });
      }
      messages.push({ role: "tool", content: resultText, toolCallId: call.id });
    }
    if (cancelled) break;
    if (limitHit || toolCalls >= maxToolCalls) {
      final = "tool limit reached";
      break;
    }
  }

  if (opts.signal?.aborted) cancelled = true;
  return { final, toolCalls, turns, cancelled };
}
