// Phase 27 — Worker scheduler: concurrency-limited pool with global budgets
import { ModelRouter } from "../model-router/router.js";
import { EventBus } from "../observability/eventBus.js";
import { CandidateLocation } from "./localizer.js";
import { runWorker } from "./worker.js";
import type { ResearchPlanQuestion, WorkerReport } from "../protocol/research.js";

export interface SchedulerOptions {
  maxConcurrency?: number;
  perWorkerBudgetTokens?: number;
  globalBudgetCalls?: number;
  globalBudgetCostUsd?: number;
  /** Estimated cost per model call, used against globalBudgetCostUsd. */
  estimatedCostPerCallUsd?: number;
  signal?: AbortSignal;
  modelId?: string;
  bus?: EventBus;
  researchId?: string;
}

export async function runWorkers(
  questions: ResearchPlanQuestion[],
  candidates: CandidateLocation[],
  router: ModelRouter,
  opts: SchedulerOptions = {},
): Promise<WorkerReport[]> {
  const maxConcurrency = Math.max(1, opts.maxConcurrency ?? 3);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) return [];
    opts.signal.addEventListener("abort", abort, { once: true });
  }

  const modelId = opts.modelId ?? router.selectForRole("research-worker");
  const researchId = opts.researchId ?? "research";
  const costPerCall = opts.estimatedCostPerCallUsd ?? 0;

  let calls = 0;
  let costUsd = 0;
  let next = 0;
  const reports: WorkerReport[] = [];

  const lane = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      const i = next++;
      if (i >= questions.length) return;
      // Global budget checks before dispatch.
      if (opts.globalBudgetCalls !== undefined && calls >= opts.globalBudgetCalls) {
        controller.abort();
        return;
      }
      if (
        opts.globalBudgetCostUsd !== undefined &&
        costUsd + costPerCall > opts.globalBudgetCostUsd
      ) {
        controller.abort();
        return;
      }
      calls++;
      costUsd += costPerCall;
      const q = questions[i]!;
      const workerId = `worker_${q.role}`;
      opts.bus?.emit({
        type: "ResearchWorkerStarted",
        researchId,
        workerId,
        role: q.role,
        timestamp: Date.now(),
      });
      try {
        const report = await runWorker(router, q, candidates, {
          modelId,
          budgetTokens: opts.perWorkerBudgetTokens,
          signal: controller.signal,
        });
        reports.push(report);
        opts.bus?.emit({
          type: "ResearchWorkerCompleted",
          researchId,
          workerId,
          role: q.role,
          timestamp: Date.now(),
        });
      } catch {
        // Isolate failures: one failing worker must not sink the batch.
      }
    }
  };

  const lanes = Array.from(
    { length: Math.min(maxConcurrency, questions.length) },
    () => lane(),
  );
  try {
    await Promise.all(lanes);
  } finally {
    opts.signal?.removeEventListener("abort", abort);
  }
  return reports;
}
