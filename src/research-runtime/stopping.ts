// Phase 32 — Stopping policy
export interface StopState {
  confidence: number;
  hasUnresolvedContradiction: boolean;
  diminishingReturns: boolean;
  budgetExhausted: boolean;
  executedRounds: number;
  maxRounds: number;
}

export interface StopDecision {
  stop: boolean;
  reason: string;
}

export function decideStop(state: StopState): StopDecision {
  // Never stop if a major contradiction is unresolved AND budget remains.
  if (
    state.hasUnresolvedContradiction &&
    !state.budgetExhausted &&
    state.executedRounds < state.maxRounds
  ) {
    return {
      stop: false,
      reason:
        "unresolved contradiction with remaining budget: continue investigating",
    };
  }

  if (state.budgetExhausted) {
    return { stop: true, reason: "budget exhausted" };
  }
  if (state.executedRounds >= state.maxRounds) {
    return { stop: true, reason: "max rounds reached" };
  }
  if (state.confidence >= 0.75 && !state.hasUnresolvedContradiction) {
    return { stop: true, reason: "high confidence with no unresolved contradiction" };
  }
  if (state.diminishingReturns) {
    return { stop: true, reason: "diminishing returns" };
  }

  return { stop: false, reason: "continue: insufficient confidence" };
}
