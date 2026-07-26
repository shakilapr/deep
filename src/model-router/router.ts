// Phase 08 — Unified model router
import { Provider, ModelRequest, ModelResponse, ProviderError } from "../protocol/model.js";
import { ModelQualityRegistry } from "./quality.js";
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
  /** Enable semantic retry: treat empty research answers as soft failures. */
  semanticRetry?: boolean;
  /** Consecutive errors before a model's circuit opens. */
  circuitBreakerThreshold?: number;
}

export class ModelRouter {
  private providers = new Map<string, Provider>();
  private modelToProvider = new Map<string, string>();
  private cooldowns = new Map<string, number>();
  private failureStreak = new Map<string, number>();
  public metrics = new Metrics();
  public readonly quality = new ModelQualityRegistry();

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
    // Guard against a partial costTable entry (e.g. {in} without {out}) -> NaN.
    const inRate = typeof t.in === "number" ? t.in : 0;
    const outRate = typeof t.out === "number" ? t.out : 0;
    return (inT / 1000) * inRate + (outT / 1000) * outRate;
  }

  private isCooling(modelId: string): boolean {
    const until = this.cooldowns.get(modelId);
    return until !== undefined && until > Date.now();
  }

  private markCooldown(modelId: string, ms = 60_000): void {
    this.cooldowns.set(modelId, Date.now() + ms);
  }

  /** Select a model id for a role, honoring cooldowns + capability scores. */
  selectForRole(_role: AgentRole, preferred?: string): string {
    const candidates = preferred ? [preferred, ...(this.cfg.fallbacks?.[preferred] ?? [])] : [this.cfg.primary];
    const available = candidates.filter((m) => !this.isCooling(m));
    const pool = available.length > 0 ? available : candidates;
    // When we have quality data, prefer higher-reliability models (capability registry).
    const hasData = pool.some((m) => this.quality.reliability(m, _role) !== 0.5);
    if (hasData) {
      return [...pool].sort((a, b) => this.quality.reliability(b, _role) - this.quality.reliability(a, _role))[0]!;
    }
    return pool[0]!;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const chain = [req.modelId, ...(this.cfg.fallbacks?.[req.modelId] ?? [])];
    const semanticRetry = this.cfg.semanticRetry ?? false;
    const breakerThreshold = this.cfg.circuitBreakerThreshold ?? 3;
    let lastErr: unknown;
    for (const modelId of chain) {
      if (this.isCooling(modelId)) continue;
      const provider = this.providerFor(modelId);
      try {
        const resp = await provider.complete({ ...req, modelId });
        const cost = this.cost(modelId, resp.usage.inputTokens, resp.usage.outputTokens);
        // Capability learning: record a successful, schema-valid sample.
        this.quality.record(modelId, {
          schemaValid: true,
          costUsd: cost,
          latencyMs: 0,
        });
        this.failureStreak.set(modelId, 0);
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
        // Semantic retry: a research answer with no content and no tool calls is
        // a soft failure (we observed free models returning empty finals). Try next.
        if (semanticRetry && req.role !== "main" && resp.content.trim() === "" && (!resp.toolCalls || resp.toolCalls.length === 0)) {
          this.quality.recordSemanticFailure(modelId, "empty_response");
          lastErr = new ProviderError("empty_response", "model returned empty answer");
          continue;
        }
        return resp;
      } catch (e) {
        lastErr = e;
        if (e instanceof ProviderError && (e.kind === "rate_limit" || e.kind === "unavailable")) {
          this.markCooldown(modelId);
        }
        // Circuit breaker: open the route after repeated consecutive failures.
        const streak = (this.failureStreak.get(modelId) ?? 0) + 1;
        this.failureStreak.set(modelId, streak);
        if (streak >= breakerThreshold) {
          this.markCooldown(modelId, 120_000);
        }
        if (e instanceof ProviderError && e.kind === "auth") {
          // Auth is not transient; do not retry this model.
          this.markCooldown(modelId, 600_000);
        }
      }
    }
    if (lastErr instanceof Error) throw lastErr;
    if (typeof lastErr === "string" && lastErr.length > 0) throw new Error(`all model routes failed: ${lastErr}`);
    if (lastErr && typeof (lastErr as { message?: unknown }).message === "string") {
      throw new Error(`all model routes failed: ${(lastErr as { message: string }).message}`);
    }
    throw new Error("all model routes failed (no usable error from providers)");
  }
}
