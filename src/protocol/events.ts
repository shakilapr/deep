// Phase 05 — Typed event bus payloads

export type AgentRole =
  | "main"
  | "research-planner"
  | "research-worker"
  | "critic"
  | "utility";

export type CodeClawEvent =
  | { type: "SessionStarted"; sessionId: string; timestamp: number }
  | { type: "AgentTurnStarted"; sessionId: string; taskId: string; timestamp: number }
  | { type: "ModelRequestStarted"; sessionId: string; taskId?: string; role: AgentRole; modelId: string; timestamp: number }
  | { type: "ModelRequestCompleted"; sessionId: string; taskId?: string; role: AgentRole; modelId: string; usage?: TokenUsage; timestamp: number }
  | { type: "ToolCallStarted"; sessionId: string; taskId?: string; role: AgentRole; tool: string; callId: string; timestamp: number }
  | { type: "ToolCallCompleted"; sessionId: string; taskId?: string; role: AgentRole; tool: string; callId: string; ok: boolean; timestamp: number }
  | { type: "ResearchStarted"; sessionId: string; taskId?: string; researchId: string; timestamp: number }
  | { type: "ResearchWorkerStarted"; researchId: string; workerId: string; role: string; timestamp: number }
  | { type: "ResearchWorkerCompleted"; researchId: string; workerId: string; role: string; timestamp: number }
  | { type: "EvidenceVerified"; researchId: string; evidenceId: string; status: string; timestamp: number }
  | { type: "ResearchCompleted"; sessionId: string; researchId: string; timestamp: number }
  | { type: "FileChanged"; sessionId?: string; path: string; timestamp: number }
  | { type: "TestStarted"; sessionId?: string; command: string; timestamp: number }
  | { type: "TestCompleted"; sessionId?: string; command: string; exitCode: number; timestamp: number }
  | { type: "ApprovalRequested"; sessionId?: string; role: AgentRole; action: string; timestamp: number }
  | { type: "ApprovalResolved"; sessionId?: string; action: string; approved: boolean; timestamp: number }
  | { type: "TaskCompleted"; sessionId: string; taskId: string; timestamp: number }
  | { type: "TaskFailed"; sessionId: string; taskId: string; reason: string; timestamp: number }
  | { type: "Cancelled"; scope: string; timestamp: number };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in USD. */
  estimatedCostUsd: number;
  modelId: string;
  role: AgentRole;
}
