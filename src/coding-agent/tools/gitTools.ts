// Phase 14 — Git tools for the main agent
import { Tool, ToolContext, ToolResult } from "../../protocol/tools.js";
import { RepositoryEngine } from "../../repository-engine/engine.js";

export function gitTools(engine: RepositoryEngine): Tool[] {
  const status: Tool = {
    definition: { name: "git_status", description: "Show git status.", inputSchema: { type: "object", properties: {} } },
    allowedRoles: ["main", "research-worker"],
    async run(): Promise<ToolResult> {
      return { ok: true, data: engine.git.status() };
    },
  };
  const diff: Tool = {
    definition: {
      name: "git_diff",
      description: "Show git diff.",
      inputSchema: { type: "object", properties: { cached: { type: "boolean" }, paths: { type: "array" } } },
    },
    allowedRoles: ["main", "research-worker"],
    async run(args: any): Promise<ToolResult> {
      return { ok: true, data: { diff: engine.git.diff({ cached: !!args.cached, paths: args.paths }) } };
    },
  };
  const log: Tool = {
    definition: {
      name: "git_log",
      description: "Show git log.",
      inputSchema: { type: "object", properties: { maxCount: { type: "number" }, paths: { type: "array" } } },
    },
    allowedRoles: ["main", "research-worker"],
    async run(args: any): Promise<ToolResult> {
      return { ok: true, data: { log: engine.git.log({ maxCount: args.maxCount ?? 20, paths: args.paths }) } };
    },
  };
  return [status, diff, log];
}
