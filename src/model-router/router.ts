// Phase 08 — Unified model router
import { Provider, ModelRequest, ModelResponse, ProviderError } from "../protocol/model.js";
import type { AgentRole } from "../protocol/events.js";
import { Metrics } from "../observability/logging.js";
import { EventBus } from "../observability/eventBus.js";

interface RouteInfo {
  modelId: string;
  providerId: string;
}

const COST_TABLE: Record<string, { in: number; out: number }> = {
  // USD per 1K tokens (illustrative; overrides via config later).
  "mock/main": { in: 0, out: 0 },
  "mock/worker": { in: 0, out: 0 },
  "mock/critic": { in: 0, out: 0 },
};

export interface RouterConfig {
  primary: string;
  fallbacks?: Record<string, string[]>;
  costTable?: Record<string, { in: number; out: number }>;
}

export class ModelRouter {
  private providers = new Map<string, Provider>();
  private modelToProvider = new Map<string, string>();
  private cooldowns = new Map<string, number>();
  public metrics = new Metrics();

  constructor(
    private cfg: RouterConfig,
    private bus: EventBus = new EventBus(),
  ) {}

  register(provider: Provider, models: string[]): void {
    this.providers.set(provider.id, provider);
    for (const m of models) this.modelToProvider.set(m, provider.id);
  }

  registerProvider(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  private providerFor(modelId: string): Provider {
    const pid = this.modelToProvider.get(modelId) ?? modelId.split("/")[0] ?? modelId;
    const direct = this.providers.get(pid) ?? this.providers.get(modelId);
    if (direct) return direct;
    // Fallback: first provider whose capability check accepts this model id.
    for (const p of this.providers.values()) {
      if (p.supports(modelId)) return p;
    }
    throw new Error(`no provider for model ${modelId}`);
  }

  private cost(modelId: string, inT: number, outT: number): number {
    const t = { ...COST_TABLE, ...this.cfg.costTable }[modelId];
    if (!t) return 0;
    return (inT / 1000) * t.in + (outT / 1000) * t.out;
  }

  private isCooling(modelId: string): boolean {
    const until = this.cooldowns.get(modelId);
    return until !== undefined && until > Date.now();
  }

  private markCooldown(modelId: string, ms = 60_000): void {
    this.cooldowns.set(modelId, Date.now() + ms);
  }

  /** Select a model id for a role, honoring cooldowns. */
  selectForRole(_role: AgentRole, preferred?: string): string {
    const candidates = preferred ? [preferred, ...(this.cfg.fallbacks?.[preferred] ?? [])] : [this.cfg.primary];
    for (const m of candidates) {
      if (!this.isCooling(m)) return m;
    }
    return candidates[0]!;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const chain = [req.modelId, ...(this.cfg.fallbacks?.[req.modelId] ?? [])];
    let lastErr: unknown;
    for (const modelId of chain) {
      if (this.isCooling(modelId)) continue;
      const provider = this.providerFor(modelId);
      try {
        const resp = await provider.complete({ ...req, modelId });
        const cost = this.cost(modelId, resp.usage.inputTokens, resp.usage.outputTokens);
        this.metrics.inc("model.calls");
        this.bus.emit({
          type: "ModelRequestCompleted",
          sessionId: req.messages.find((m) => m.role === "system") ? "sys" : "main",
          role: req.role,
          modelId,
          usage: {
            inputTokens: resp.usage.inputTokens,
            outputTokens: resp.usage.outputTokens,
            estimatedCostUsd: cost,
            modelId,
            role: req.role,
          },
          timestamp: Date.now(),
        });
        return resp;
      } catch (e) {
        lastErr = e;
        if (e instanceof ProviderError && (e.kind === "rate_limit" || e.kind === "unavailable")) {
          this.markCooldown(modelId);
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("all model routes failed");
  }
}
