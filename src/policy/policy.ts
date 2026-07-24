// Phase 34 (foundation) — Role-based tool policy engine
import type { AgentRole } from "../protocol/events.js";

export type Risk = "low" | "medium" | "high";

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
}

export interface PolicyConfig {
  denyGitPush: boolean;
  requireApprovalForWrite: boolean;
  requireApprovalForCommand: Risk[];
  networkDeniedRoles?: AgentRole[];
}

const READ_ONLY_TOOLS = new Set([
  "read_file",
  "read_range",
  "list_files",
  "search_text",
  "search_symbols",
  "get_symbol",
  "get_definition",
  "git_status",
  "git_diff",
  "git_log",
  "repository_overview",
]);

const WRITE_TOOLS = new Set(["apply_patch", "write_file", "run_command", "git_push"]);
const RESEARCH_ONLY_ROLES: AgentRole[] = ["research-worker", "critic", "utility"];

export class PolicyEngine {
  constructor(private cfg: PolicyConfig) {}

  decide(role: AgentRole, tool: string, args: Record<string, unknown> = {}): PolicyDecision {
    // Research workers/critic/utility can never write or execute.
    if (RESEARCH_ONLY_ROLES.includes(role)) {
      if (!READ_ONLY_TOOLS.has(tool)) {
        return { allowed: false, reason: `${role} may only use read-only tools`, requiresApproval: false };
      }
    }

    if (role === "utility") {
      // Utility models have no repository access at all.
      return { allowed: false, reason: "utility role has no tool access", requiresApproval: false };
    }

    if (WRITE_TOOLS.has(tool)) {
      if (tool === "git_push" && this.cfg.denyGitPush) {
        return { allowed: false, reason: "git push denied by policy", requiresApproval: false };
      }
      if (tool === "apply_patch" || tool === "write_file") {
        if (this.cfg.requireApprovalForWrite) {
          return { allowed: true, reason: "write requires approval", requiresApproval: true };
        }
        return { allowed: true, reason: "write permitted", requiresApproval: false };
      }
      if (tool === "run_command") {
        const risk = (args.risk as Risk) ?? "low";
        if (this.cfg.requireApprovalForCommand.includes(risk)) {
          return { allowed: true, reason: `command risk ${risk} requires approval`, requiresApproval: true };
        }
      }
    }
    return { allowed: true, reason: "permitted", requiresApproval: false };
  }

  /** Network access control (Phase 35 foundation). */
  networkAllowed(role: AgentRole): boolean {
    if (this.cfg.networkDeniedRoles?.includes(role)) return false;
    return role === "main";
  }
}
