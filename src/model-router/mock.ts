// Phase 07 — Provider contract implementation + MockProvider
import {
  Provider,
  ModelRequest,
  ModelResponse,
  ProviderError,
  ProviderErrorKind,
} from "../protocol/model.js";
import type { AgentRole } from "../protocol/events.js";

export interface MockHandlers {
  complete?: (req: ModelRequest) => ModelResponse | Promise<ModelResponse>;
  structured?: (req: ModelRequest) => unknown | Promise<unknown>;
  /** Force a transport-style failure to exercise fallback. */
  failWith?: ProviderErrorKind;
}

export class MockProvider implements Provider {
  readonly id: string;
  constructor(
    private opts: MockHandlers = {},
    id = "mock",
  ) {
    this.id = id;
  }

  supports(modelId: string): boolean {
    return modelId.startsWith("mock/") || modelId === "mock";
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    if (this.opts.failWith) {
      throw new ProviderError(this.opts.failWith, `mock ${this.opts.failWith}`);
    }
    if (req.structured && this.opts.structured) {
      const obj = await this.opts.structured(req);
      return {
        role: req.role,
        content: JSON.stringify(obj),
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    }
    if (this.opts.complete) return this.opts.complete(req);
    const last = [...req.messages].reverse().find((m) => m.role === "user");
    return {
      role: req.role,
      content: last?.content ?? "done",
      toolCalls: [],
      usage: { inputTokens: 5, outputTokens: 5 },
    };
  }
}

/** Provider error helpers reused by adapters. */
export function isTransportError(e: unknown): e is ProviderError {
  return e instanceof ProviderError;
}

export type { Provider, ModelRequest, ModelResponse, AgentRole };
