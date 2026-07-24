// Phase 22/26/27-33 — Research orchestrator: localize -> plan -> worker swarm ->
// verify -> contradictions -> critic -> follow-up rounds -> capsule
import { RepositoryEngine } from "../repository-engine/engine.js";
import { ModelRouter } from "../model-router/router.js";
import { EventBus, eventBus } from "../observability/eventBus.js";
import { Localizer } from "./localizer.js";
import { ResearchPlanner } from "./planner.js";
import { runWorkers } from "./scheduler.js";
import { verifyReports, detectContradictions } from "./verify.js";
import { runCritic } from "./critic.js";
import { planFollowUp } from "./followup.js";
import { decideStop } from "./stopping.js";
import { compileCapsule } from "./capsule.js";
import type {
  ResearchCodebaseInput,
  ResearchCapsule,
  WorkerReport,
  CriticReport,
  ResearchDisagreement,
} from "../protocol/research.js";

export interface ResearchDeps {
  engine: RepositoryEngine;
  router: ModelRouter;
  root: string;
  snapshotId: string;
  currentHashes?: Map<string, string>;
  bus?: EventBus;
}

const MAX_ROUNDS = 2;

export async function runResearch(
  input: ResearchCodebaseInput,
  deps: ResearchDeps,
): Promise<ResearchCapsule> {
  const depth = input.depth ?? "normal";
  const bus = deps.bus ?? eventBus;
  const researchId = `research_${Date.now().toString(36)}`;
  const budget = input.budget ?? {};

  // Worker count scales with depth; capped by budget.maxWorkers when set.
  const depthWorkers = depth === "quick" ? 1 : depth === "deep" ? 3 : 2;
  const maxWorkers = Math.max(1, Math.min(budget.maxWorkers ?? depthWorkers, depthWorkers));

  // Budget enforcement via AbortController (timeout + shared signal).
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  if (budget.timeoutSeconds) {
    timer = setTimeout(() => controller.abort(), budget.timeoutSeconds * 1000);
    timer.unref?.();
  }
  const maxCalls = budget.maxModelCalls ?? Infinity;
  const maxCost = budget.maxCostUsd ?? Infinity;
  let calls = 0;
  let costUsd = 0;
  const budgetExhausted = () =>
    controller.signal.aborted || calls >= maxCalls || costUsd >= maxCost;

  try {
    // Deterministic-first: localize BEFORE any model call.
    const localizer = new Localizer(deps.engine);
    const candidates = localizer.localize(input.question, input.scope);
    const plan = new ResearchPlanner().plan(input.question, candidates, maxWorkers);

    const workerModelId = deps.router.selectForRole("research-worker");
    const reports: WorkerReport[] = [];
    let critic: CriticReport | undefined;
    let disagreements: ResearchDisagreement[] = [];
    let verified = verifyReports([], {
      root: deps.root,
      snapshotId: deps.snapshotId,
      currentHashes: deps.currentHashes,
    });

    let pending = plan.questions;
    const askedQuestions = new Set<string>(plan.questions.map((q) => q.question.toLowerCase()));
    let round = 0;

    while (pending.length > 0 && !budgetExhausted()) {
      round++;
      const remainingCalls = Number.isFinite(maxCalls) ? maxCalls - calls : undefined;
      const roundReports = await runWorkers(pending, candidates, deps.router, {
        maxConcurrency: 3,
        signal: controller.signal,
        modelId: workerModelId,
        globalBudgetCalls: remainingCalls,
        bus,
        researchId,
      });
      calls += pending.length;
      reports.push(...roundReports);
      pending = [];

      // Verification + contradiction detection over all reports so far.
      verified = verifyReports(reports, {
        root: deps.root,
        snapshotId: deps.snapshotId,
        currentHashes: deps.currentHashes,
      });
      disagreements = detectContradictions(reports);

      const avgConfidence =
        reports.length > 0
          ? reports.reduce((s, r) => s + r.confidence, 0) / reports.length
          : 0;

      const decision = decideStop({
        confidence: avgConfidence,
        hasUnresolvedContradiction: disagreements.length > 0,
        diminishingReturns: false,
        budgetExhausted: budgetExhausted(),
        executedRounds: round,
        maxRounds: MAX_ROUNDS,
      });
      if (decision.stop && !(disagreements.length > 0 && avgConfidence < 0.75 && !budgetExhausted() && round < MAX_ROUNDS)) {
        break;
      }

      // Escalate to critic when contradictions exist, confidence is low, and
      // budget remains — then plan a bounded follow-up round.
      if (disagreements.length > 0 && avgConfidence < 0.75 && !budgetExhausted() && round < MAX_ROUNDS) {
        try {
          critic = await runCritic(
            deps.router,
            deps.router.selectForRole("critic"),
            [...verified.evidence.values()],
            disagreements,
            controller.signal,
          );
          calls++;
        } catch {
          critic = undefined;
        }
        if (critic && !budgetExhausted()) {
          const followUps = planFollowUp(
            critic,
            new Set(verified.evidence.keys()),
            candidates,
          ).filter((q) => !askedQuestions.has(q.question.toLowerCase()));
          for (const q of followUps) askedQuestions.add(q.question.toLowerCase());
          pending = followUps;
        }
      }
    }

    const capsule = compileCapsule({
      capsuleId: `caps_${Date.now().toString(36)}`,
      repository: {
        snapshotId: deps.snapshotId,
        root: deps.root,
        dirtyTreeHash: "unknown",
      },
      request: { originalQuestion: input.question, normalizedGoal: plan.goal },
      workerReports: reports,
      verified: verified.evidence,
      critic,
      usage: {
        models: [...new Set(reports.map((r) => r.modelId))],
        calls,
        estimatedCostUsd: costUsd,
      },
    });

    bus.emit({
      type: "ResearchCompleted",
      sessionId: "research",
      researchId,
      timestamp: Date.now(),
    });
    return capsule;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
