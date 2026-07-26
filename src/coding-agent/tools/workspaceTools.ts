// Phase 51 — Workspace tools: git worktrees for isolated edit experiments.
// Main role only; research workers stay read-only.
import { Tool, ToolResult } from "../../protocol/tools.js";
import { createWorktree, removeWorktree } from "../../workspace/worktree.js";

export function workspaceTools(root: string): Tool[] {
  const createWt: Tool = {
    definition: {
      name: "create_worktree",
      description: "Create an isolated git worktree for a risky edit experiment.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, branch: { type: "string" } },
        required: ["name"],
      },
    },
    allowedRoles: ["main"],
    async run(args: any): Promise<ToolResult> {
      try {
        const path = createWorktree(root, String(args.name), args.branch ? String(args.branch) : undefined);
        return { ok: true, data: { path } };
      } catch (e) {
        return { ok: false, data: { error: (e as Error).message } };
      }
    },
  };

  const removeWt: Tool = {
    definition: {
      name: "remove_worktree",
      description: "Remove a previously created git worktree.",
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
    allowedRoles: ["main"],
    async run(args: any): Promise<ToolResult> {
      removeWorktree(root, String(args.name));
      return { ok: true, data: { removed: args.name } };
    },
  };

  return [createWt, removeWt];
}
