// Phase 10 — Tool runtime
import { Tool, ToolResult, ToolContext, ToolError } from "../protocol/tools.js";
import { PolicyEngine } from "../policy/policy.js";
import { EventBus } from "../observability/eventBus.js";
import { logger } from "../observability/logging.js";
import type { AgentRole } from "../protocol/events.js";

/** Minimal JSON-Schema validation (required props + primitive types). */
function validateArgs(schema: any, args: Record<string, unknown>): void {
  if (!schema || !schema.properties) return;
  for (const key of schema.required ?? []) {
    if (!(key in args)) throw new ToolError(`missing required argument: ${key}`);
  }
  for (const [k, v] of Object.entries(args)) {
    const prop = schema.properties[k];
    if (!prop) continue;
    if (prop.type === "string" && typeof v !== "string") throw new ToolError(`${k} must be string`);
    if (prop.type === "number" && typeof v !== "number") throw new ToolError(`${k} must be number`);
    if (prop.type === "boolean" && typeof v !== "boolean") throw new ToolError(`${k} must be boolean`);
    if (prop.type === "array" && !Array.isArray(v)) throw new ToolError(`${k} must be array`);
    if (prop.type === "object" && (typeof v !== "object" || v === null || Array.isArray(v)))
      throw new ToolError(`${k} must be object`);
  }
}

export class ToolRuntime {
  private tools = new Map<string, Tool>();

  constructor(
    private policy: PolicyEngine,
    private bus: EventBus = new EventBus(),
    private defaultTimeoutMs = 120_000,
  ) {}

  register(tool: Tool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new ToolError(`tool already registered: ${tool.definition.name}`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  list(): string[] {
    return [...this.tools.keys()];
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolError(`unknown tool: ${name}`);
    if (!tool.allowedRoles.includes(ctx.role as AgentRole)) {
      throw new ToolError(`role ${ctx.role} cannot call ${name}`);
    }

    // Policy check occurs BEFORE implementation code.
    const decision = this.policy.decide(ctx.role, name, args);
    if (!decision.allowed) {
      this.bus.emit({
        type: "ToolCallCompleted",
        sessionId: ctx.sessionId,
        taskId: ctx.taskId,
        role: ctx.role,
        tool: name,
        callId: "n/a",
        ok: false,
        timestamp: Date.now(),
      });
      throw new ToolError(`policy denied ${name}: ${decision.reason}`);
    }
    if (decision.requiresApproval) {
      const approved = ctx.requestApproval ? await ctx.requestApproval(name) : false;
      if (!approved) {
        return { ok: false, data: { denied: true }, summary: `approval denied for ${name}` };
      }
    }

    validateArgs(tool.definition.inputSchema, args);

    this.bus.emit({
      type: "ToolCallStarted",
      sessionId: ctx.sessionId,
      taskId: ctx.taskId,
      role: ctx.role,
      tool: name,
      callId: "n/a",
      timestamp: Date.now(),
    });

    const timeout = (tool.definition as any).timeoutMs ?? this.defaultTimeoutMs;
    let result: ToolResult;
    try {
      result = await withTimeout(tool.run(args, ctx), timeout, ctx.signal);
    } catch (e) {
      this.bus.emit({
        type: "ToolCallCompleted",
        sessionId: ctx.sessionId,
        taskId: ctx.taskId,
        role: ctx.role,
        tool: name,
        callId: "n/a",
        ok: false,
        timestamp: Date.now(),
      });
      throw e instanceof ToolError ? e : new ToolError((e as Error).message);
    }

    this.bus.emit({
      type: "ToolCallCompleted",
      sessionId: ctx.sessionId,
      taskId: ctx.taskId,
      role: ctx.role,
      tool: name,
      callId: "n/a",
      ok: result.ok,
      timestamp: Date.now(),
    });
    logger.debug("tool executed", { name, ok: result.ok });
    return result;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ToolError("tool timed out")), ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new ToolError("tool cancelled"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        clearTimeout(t);
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        if (signal) signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}
