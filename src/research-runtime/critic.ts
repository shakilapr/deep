// Phase 30 — Critic agent (challenge verified conclusions)
import { ModelRouter } from "../model-router/router.js";
import { CriticReport, ResearchDisagreement, VerifiedEvidence } from "../protocol/research.js";

const CRITIC_SCHEMA = {
  type: "object",
  properties: {
    acceptedClaims: { type: "array", items: { type: "string" } },
    rejectedClaims: {
      type: "array",
      items: { type: "object", properties: { claimId: { type: "string" }, reason: { type: "string" } } },
    },
    missingInvestigations: { type: "array", items: { type: "string" } },
    alternativeHypotheses: { type: "array", items: { type: "string" } },
    confidenceAdjustment: { type: "number" },
  },
  required: ["acceptedClaims", "rejectedClaims", "confidenceAdjustment"],
};

export async function runCritic(
  router: ModelRouter,
  modelId: string,
  verified: VerifiedEvidence[],
  disagreements: ResearchDisagreement[],
  signal?: AbortSignal,
): Promise<CriticReport> {
  const prompt: any = {
    role: "critic" as const,
    messages: [
      {
        role: "system",
        content:
          "You are a critic. You may ONLY accept claims backed by verified evidence. " +
          "You cannot create new verified evidence. Flag missing investigations and provide a confidence adjustment in [-0.3, 0.3].",
      },
      {
        role: "user",
        content:
          "VERIFIED EVIDENCE:\n" +
          verified.map((v) => `- ${v.id}: ${v.reference.path}:${v.reference.startLine} status=${v.status}`).join("\n") +
          "\n\nDISAGREEMENTS:\n" +
          disagreements.map((d) => `- ${d.subject}: ${d.claims.join(" vs ")}`).join("\n"),
      },
    ],
    structured: { jsonSchema: CRITIC_SCHEMA },
    maxTokens: 1500,
    signal,
  };
  try {
    const resp = await router.complete({ ...prompt, modelId });
    const p = JSON.parse(resp.content);
    return {
      acceptedClaims: p.acceptedClaims ?? [],
      rejectedClaims: p.rejectedClaims ?? [],
      missingInvestigations: p.missingInvestigations ?? [],
      alternativeHypotheses: p.alternativeHypotheses ?? [],
      confidenceAdjustment: Math.max(-0.3, Math.min(0.3, Number(p.confidenceAdjustment ?? 0))),
    };
  } catch {
    // Heuristic fallback: accept all verified, reject none, no adjustment.
    return {
      acceptedClaims: verified.map((v) => v.id),
      rejectedClaims: [],
      missingInvestigations: [],
      alternativeHypotheses: [],
      confidenceAdjustment: disagreements.length ? -0.1 : 0,
    };
  }
}
