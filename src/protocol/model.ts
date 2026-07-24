// Phase 07 — Model provider contract types

import type { AgentRole } from "./events.js";

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Tool calls requested by an assistant message. */
  toolCalls?: ToolCallRequest[];
  /** For tool-result messages: which tool call this answers. */
  toolCallId?: string;
}

export interface StreamChunk {
  type: "text" | "tool_call" | "usage" | "done" | "error";
  text?: string;
  toolCall?: ToolCallRequest;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

export type ProviderErrorKind =
  | "timeout"
  | "rate_limit"
  | "auth"
  | "unavailable"
  | "server_error"
  | "empty_response"
  | "connection";

export class ProviderError extends Error {
  constructor(public kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ModelRequest {
  modelId: string;
  role: AgentRole;
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  /** When true, the provider must return structured JSON matching jsonSchema. */
  structured?: { jsonSchema: object };
  /** Per-request limits. */
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ModelResponse {
  role: AgentRole;
  content: string;
  toolCalls: ToolCallRequest[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

export interface Provider {
  readonly id: string;
  /** Resolve a logical model id (e.g. "openai/gpt-5.1") to a callable route. */
  supports(modelId: string): boolean;
  complete(req: ModelRequest): Promise<ModelResponse>;
  /** Optional streaming variant; falls back to complete() if absent. */
  stream?(req: ModelRequest): AsyncIterable<StreamChunk>;
}
