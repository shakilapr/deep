// Phase 31 — Follow-up research planning from critic feedback
import { CandidateLocation } from "./localizer.js";
import type { CriticReport, ResearchPlanQuestion } from "../protocol/research.js";

const MAX_FOLLOWUPS = 3;

export function planFollowUp(
  critic: CriticReport,
  existingEvidenceIds: Set<string>,
  candidates: CandidateLocation[],
): ResearchPlanQuestion[] {
  const missing = critic.missingInvestigations ?? [];
  if (missing.length === 0) return [];

  const evIds = candidates.slice(0, 8).map((_, i) => `loc_${i}`);
  const seen = new Set<string>();
  const questions: ResearchPlanQuestion[] = [];

  for (const item of missing) {
    if (questions.length >= MAX_FOLLOWUPS) break;
    const text = `Follow-up investigation: ${item}. Cite exact file/line evidence only.`;
    const key = text.toLowerCase();
    if (seen.has(key) || existingEvidenceIds.has(key)) continue;
    seen.add(key);
    questions.push({
      id: `q_followup_${questions.length}`,
      role: "state",
      question: text,
      initialEvidenceIds: evIds,
    });
  }
  return questions;
}
