// Phase 24 — Single research worker (isolated, read-only)
import { ModelRouter } from "../model-router/router.js";
import { CandidateLocation } from "./localizer.js";
import { WorkerReport, ResearchPlanQuestion } from "../protocol/research.js";
import { EvidenceReference } from "../protocol/evidence.js";

const WORKER_SCHEMA = {
  type: "object",
  properties: {
    conclusion: { type: "string" },
    confidence: { type: "number" },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                symbol: { type: "string" },
                startLine: { type: "number" },
                endLine: { type: "number" },
              },
              required: ["path", "startLine", "endLine"],
            },
          },
        },
        required: ["statement", "evidence"],
      },
    },
    hypotheses: { type: "array" },
    unansweredQuestions: { type: "array" },
  },
  required: ["conclusion", "confidence", "claims"],
};

export interface WorkerRunOptions {
  modelId: string;
  budgetTokens?: number;
  signal?: AbortSignal;
}

export async function runWorker(
  router: ModelRouter,
  question: ResearchPlanQuestion,
  candidates: CandidateLocation[],
  opts: WorkerRunOptions,
): Promise<WorkerReport> {
  const contextLines = candidates
    .slice(0, 10)
    .map((c) => `- ${c.path}${c.symbol ? `#${c.symbol}` : ""} (${c.startLine ?? "?"}) : ${c.reason}`)
    .join("\n");

  const prompt: any = {
    role: "research-worker" as const,
    messages: [
      {
        role: "system",
        content:
          "You are a read-only code research worker. Answer only with cited source evidence. " +
          "Return structured JSON with conclusion, confidence (0-1), and claims each linked to exact file/line evidence.\n" +
          "RULES FOR EVIDENCE:\n" +
          "1. Cite the PRECISE location of a suspected defect (a function/class/method body), not documentation.\n" +
          "2. If the defect is inside a named declaration, you MUST set `symbol` to that exact name and give its real startLine/endLine.\n" +
          "3. PREFER real source files (.ts/.tsx/.js) over documentation (.md). Never cite a doc file as the defect location; docs only describe intended behavior.\n" +
          "4. Each claim's `evidence` must contain 1-3 references with path + startLine + endLine (and `symbol` when applicable).",
      },
      {
        role: "user",
        content:
          `ROLE: ${question.role}\nQUESTION: ${question.question}\n\n` +
          `DETERMINISTIC CANDIDATES (do not invent others; only cite real ranges):\n${contextLines}\n\n` +
          `When a candidate shows a #symbol, prefer citing that symbol's exact startLine/endLine as the defect location.`,
      },
    ],
    structured: { jsonSchema: WORKER_SCHEMA },
    maxTokens: opts.budgetTokens ?? 2000,
    signal: opts.signal,
  };

  const resp = await router.complete({ ...prompt, modelId: opts.modelId });
  let parsed: any;
  try {
    parsed = JSON.parse(resp.content);
  } catch {
    parsed = { conclusion: resp.content, confidence: 0.3, claims: [] };
  }

  const claims = (parsed.claims ?? []).map((c: any) => ({
    statement: String(c.statement ?? ""),
    evidence: ((c.evidence ?? []) as any[]).map(
      (e): EvidenceReference => ({
        snapshotId: "pending",
        path: String(e.path),
        symbol: e.symbol ? String(e.symbol) : undefined,
        startLine: Number(e.startLine),
        endLine: Number(e.endLine),
      }),
    ),
  }));

  return {
    workerId: `worker_${question.role}`,
    modelId: opts.modelId,
    role: question.role,
    question: question.question,
    conclusion: String(parsed.conclusion ?? ""),
    confidence: Number(parsed.confidence ?? 0.3),
    claims,
    hypotheses: parsed.hypotheses ?? [],
    unansweredQuestions: parsed.unansweredQuestions ?? [],
  };
}
