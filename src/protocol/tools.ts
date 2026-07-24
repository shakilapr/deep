// Phase 10 — Tool runtime contract types

import type { ToolDefinition } from "./model.js";
import type { AgentRole } from "./events.js";

export type { ToolDefinition };

export interface ToolContext {
  role: AgentRole;
  sessionId: string;
  taskId?: string;
  /** Repository root the tool may operate within. */
  repoRoot: string;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Whether the calling role may request approval-gated actions. */
  canApprove: boolean;
  /** Allows a tool to request interactive approval. */
  requestApproval?: (action: string) => Promise<boolean>;
}

export interface ToolResult {
  ok: boolean;
  /** Structured, model-friendly payload. */
  data: unknown;
  /** Optional human-readable summary. */
  summary?: string;
  /** When true the result requires user approval before side effects. */
  needsApproval?: boolean;
}

export interface Tool {
  definition: ToolDefinition;
  /** Policy role that may call this tool. */
  allowedRoles: AgentRole[];
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}
