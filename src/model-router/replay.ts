// Phase 49 — Replay mode: record and replay provider responses offline.
// Satisfies testing-plan.md §1.3 (replay mode) so the pipeline can be
// regression-tested without a live model. Read-only with respect to the repo.
import {
  Provider,
  ProviderError,
  ModelRequest,
  ModelResponse,
} from "../protocol/model.js";
import { readFileSync } from "node:fs";

export interface RecordedExchange {
  modelId: string;
  request: ModelRequest;
  response?: ModelResponse;
  error?: string;
}

/** Replays a fixed list of responses in order; throws when exhausted. */
export class ReplayProvider implements Provider {
  readonly id = "replay";
  private idx = 0;
  constructor(private responses: ModelResponse[]) {}

  supports(): boolean {
    return true;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    if (this.idx >= this.responses.length) {
      throw new ProviderError("empty_response", "replay exhausted");
    }
    return this.responses[this.idx++]!;
  }
}

/** Wraps a real provider and records each exchange via the sink callback. */
export class RecordingProvider implements Provider {
  readonly id: string;
  constructor(
    private inner: Provider,
    private sink: (e: RecordedExchange) => void,
  ) {
    this.id = inner.id;
  }

  supports(modelId: string): boolean {
    return this.inner.supports(modelId);
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    try {
      const response = await this.inner.complete(req);
      this.sink({ modelId: req.modelId, request: req, response });
      return response;
    } catch (e) {
      this.sink({ modelId: req.modelId, request: req, error: (e as Error).message });
      throw e;
    }
  }
}

/** Load a JSONL replay file into responses (one JSON object per line). */
export function loadReplayFile(path: string): ModelResponse[] {
  const text = readFileSync(path, "utf8");
  const out: ModelResponse[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as RecordedExchange;
      if (obj.response) out.push(obj.response);
    } catch {
      /* ignore malformed lines */
    }
  }
  return out;
}
