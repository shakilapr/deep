// Phase 22 — Research runtime contract types
import type { EvidenceReference, VerifiedEvidence } from "./evidence.js";

export type ResearchDepth = "quick" | "normal" | "deep";

export interface ResearchScope {
  paths?: string[];
  symbols?: string[];
  languages?: string[];
  includeTests?: boolean;
  includeHistory?: boolean;
}

export interface ResearchBudget {
  maxWorkers?: number;
  maxModelCalls?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCostUsd?: number;
  timeoutSeconds?: number;
}

export interface ResearchCodebaseInput {
  question: string;
  scope?: ResearchScope;
  depth?: ResearchDepth;
  budget?: ResearchBudget;
  verification?: {
    requireSourceEvidence?: boolean;
    allowTestExecution?: boolean;
    minimumConfidence?: number;
  };
}

export interface ResearchClaim {
  id: string;
  statement: string;
  status: "verified" | "inferred" | "disputed";
  confidence: number;
  evidenceIds: string[];
}

export interface ResearchLocation {
  path: string;
  symbol?: string;
  startLine: number;
  endLine: number;
  role:
    | "root_cause"
    | "caller"
    | "state_writer"
    | "interface"
    | "configuration"
    | "test"
    | "supporting";
  reason: string;
  snippetHash: string;
}

export interface ResearchCapsule {
  id: string;
  repository: {
    snapshotId: string;
    root: string;
    commit?: string;
    dirtyTreeHash: string;
  };
  request: {
    originalQuestion: string;
    normalizedGoal: string;
  };
  conclusion: {
    summary: string;
    likelyRootCause?: string;
    confidence: number;
    confidenceLabel: "low" | "medium" | "high";
  };
  claims: ResearchClaim[];
  locations: ResearchLocation[];
  paths: Array<{ description: string; nodes: string[] }>;
  rejectedHypotheses: Array<{ hypothesis: string; reason: string; evidenceIds: string[] }>;
  tests: {
    relevant: string[];
    recommended: string[];
    executed: Array<{ command: string; status: "passed" | "failed" | "not_run"; outputSummary?: string }>;
  };
  recommendation?: { probableChangeLocation: string[]; description: string };
  uncertainties: string[];
  usage: {
    models: string[];
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}

// --- Internal research runtime types ---

export type WorkerRole = "flow" | "state" | "tests" | "history";

export interface WorkerReport {
  workerId: string;
  modelId: string;
  role: WorkerRole;
  question: string;
  conclusion: string;
  confidence: number;
  claims: Array<{ statement: string; evidence: EvidenceReference[] }>;
  hypotheses: Array<{ description: string; supportingEvidence: string[]; opposingEvidence: string[] }>;
  unansweredQuestions: string[];
}

export interface ResearchPlanQuestion {
  id: string;
  role: WorkerRole;
  question: string;
  initialEvidenceIds: string[];
}

export interface ResearchPlan {
  goal: string;
  questions: ResearchPlanQuestion[];
  initialQueries: string[];
}

export interface ResearchDisagreement {
  subject: string;
  claims: string[];
  evidenceIds: string[];
  resolvableBy: "source_inspection" | "static_query" | "test_execution" | "critic" | "unresolved";
}

export interface CriticReport {
  acceptedClaims: string[];
  rejectedClaims: Array<{ claimId: string; reason: string }>;
  missingInvestigations: string[];
  alternativeHypotheses: string[];
  confidenceAdjustment: number;
}

export type { VerifiedEvidence };
