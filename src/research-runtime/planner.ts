// Phase 28 — Research planner (decompose into bounded questions)
import { CandidateLocation } from "./localizer.js";
import { ResearchPlan, ResearchPlanQuestion, WorkerRole } from "../protocol/research.js";

export class ResearchPlanner {
  plan(goal: string, candidates: CandidateLocation[], maxQuestions = 4): ResearchPlan {
    const roles: WorkerRole[] = ["flow", "state", "tests", "history"];
    const questions: ResearchPlanQuestion[] = [];
    const evIds = candidates.slice(0, 8).map((_, i) => `loc_${i}`);

    // Deterministic template: assign one question per role, capped by maxQuestions.
    const templates: Record<WorkerRole, string> = {
      flow: `Trace the control-flow path relevant to: "${goal}". Identify entry points, call sequence, and error paths.`,
      state: `Identify all writers and readers of the relevant state in: "${goal}". Note mutation order and stale values.`,
      tests: `Find tests that cover the behavior in: "${goal}". Note missing cases and feature flags.`,
      history: `Investigate recent history/blame relevant to: "${goal}". Note reverted or changed behavior.`,
    };

    for (const role of roles) {
      if (questions.length >= maxQuestions) break;
      questions.push({
        id: `q_${role}`,
        role,
        question: templates[role],
        initialEvidenceIds: evIds,
      });
    }
    const initialQueries = candidates.slice(0, 5).map((c) => c.symbol ?? c.path);
    return { goal, questions, initialQueries };
  }
}
