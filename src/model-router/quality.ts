// Phase 33 — Semantic model reliability registry (standalone; router-agnostic)

export interface QualitySample {
  schemaValid?: boolean;
  validEvidence?: boolean;
  usefulClaim?: boolean;
  contradiction?: boolean;
  costUsd?: number;
  latencyMs?: number;
}

export type SemanticFailureKind =
  | "fabricated_evidence"
  | "invalid_schema"
  | "irrelevant"
  | string;

interface ModelStats {
  samples: number;
  schemaValid: number;
  validEvidence: number;
  usefulClaim: number;
  contradictions: number;
  semanticFailures: Map<string, number>;
  totalCostUsd: number;
  totalLatencyMs: number;
}

function emptyStats(): ModelStats {
  return {
    samples: 0,
    schemaValid: 0,
    validEvidence: 0,
    usefulClaim: 0,
    contradictions: 0,
    semanticFailures: new Map(),
    totalCostUsd: 0,
    totalLatencyMs: 0,
  };
}

export class ModelQualityRegistry {
  private stats = new Map<string, ModelStats>();
  private cooldowns = new Map<string, number>();

  private statsFor(modelId: string): ModelStats {
    let s = this.stats.get(modelId);
    if (!s) {
      s = emptyStats();
      this.stats.set(modelId, s);
    }
    return s;
  }

  record(modelId: string, sample: QualitySample): void {
    const s = this.statsFor(modelId);
    s.samples++;
    if (sample.schemaValid) s.schemaValid++;
    if (sample.validEvidence) s.validEvidence++;
    if (sample.usefulClaim) s.usefulClaim++;
    if (sample.contradiction) s.contradictions++;
    s.totalCostUsd += sample.costUsd ?? 0;
    s.totalLatencyMs += sample.latencyMs ?? 0;
  }

  recordSemanticFailure(modelId: string, kind: SemanticFailureKind): void {
    const s = this.statsFor(modelId);
    s.samples++;
    s.semanticFailures.set(kind, (s.semanticFailures.get(kind) ?? 0) + 1);
  }

  /** Higher is better; roughly in [0, 1]. Unknown models get a neutral prior. */
  reliability(modelId: string, _role?: string): number {
    const s = this.stats.get(modelId);
    if (!s || s.samples === 0) return 0.5;
    const n = s.samples;
    const validEvidenceRate = s.validEvidence / n;
    const usefulClaimRate = s.usefulClaim / n;
    const schemaRate = s.schemaValid / n;
    const contradictionRate = s.contradictions / n;
    let semanticFails = 0;
    let fabrications = 0;
    for (const [kind, count] of s.semanticFailures) {
      semanticFails += count;
      if (kind === "fabricated_evidence") fabrications += count;
    }
    const semanticFailRate = semanticFails / n;
    const fabricationRate = fabrications / n;

    // Normalized cost/latency penalties (soft; cheap+fast is a mild bonus).
    const avgCost = s.totalCostUsd / n;
    const avgLatency = s.totalLatencyMs / n;
    const costPenalty = Math.min(0.1, avgCost * 0.1);
    const latencyPenalty = Math.min(0.1, avgLatency / 600_000);

    const score =
      0.35 * validEvidenceRate +
      0.3 * usefulClaimRate +
      0.15 * schemaRate -
      0.3 * contradictionRate -
      0.4 * semanticFailRate -
      0.4 * fabricationRate -
      costPenalty -
      latencyPenalty;
    return Math.max(0, Math.min(1, score));
  }

  cooldown(modelId: string, ms = 60_000): void {
    this.cooldowns.set(modelId, Date.now() + ms);
  }

  isCooled(modelId: string): boolean {
    const until = this.cooldowns.get(modelId);
    return until !== undefined && until > Date.now();
  }

  private avgCost(modelId: string): number {
    const s = this.stats.get(modelId);
    if (!s || s.samples === 0) return 0;
    return s.totalCostUsd / s.samples;
  }

  /** Highest reliability among non-cooled candidates; tie-break by lower cost. */
  pickForRole(role: string, candidateIds: string[]): string {
    if (candidateIds.length === 0) throw new Error("no candidate models");
    const available = candidateIds.filter((id) => !this.isCooled(id));
    const pool = available.length > 0 ? available : candidateIds;
    let best = pool[0]!;
    for (const id of pool.slice(1)) {
      const rBest = this.reliability(best, role);
      const rCur = this.reliability(id, role);
      if (rCur > rBest) best = id;
      else if (rCur === rBest && this.avgCost(id) < this.avgCost(best)) best = id;
    }
    return best;
  }
}
