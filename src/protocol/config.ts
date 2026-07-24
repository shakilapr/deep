// Phase 03 — Configuration schema (shared protocol types)

export type ModelRole =
  | "main"
  | "research"
  | "critic"
  | "summarizer"
  | "utility";

export interface ModelConfig {
  /** Resolved model id passed to the provider, e.g. "openai/gpt-5.1". */
  id: string;
  /** Optional explicit provider id; otherwise inferred from id prefix. */
  provider?: string;
  /** Roles this model is allowed to serve. */
  roles?: ModelRole[];
}

export interface ResearchModelConfig {
  strategy: "openrouter-free" | "best-available-cheap" | "explicit";
  workers: number;
  fallbacks?: string[];
}

export interface ModelsConfig {
  main: string;
  research?: ResearchModelConfig;
  critic?: { strategy: "best-available-cheap" | "explicit"; id?: string };
}

export interface SecretReference {
  /** env var name, e.g. "OPENAI_API_KEY". Resolved at runtime, never stored. */
  env: string;
  /** Optional provider this secret belongs to. */
  provider?: string;
}

export interface ConfigFile {
  models?: Partial<ModelsConfig>;
  modelCatalogue?: ModelConfig[];
  /** Secret references — raw secrets are never written to config files. */
  secrets?: SecretReference[];
  repository?: {
    ignore?: string[];
    generatedPatterns?: string[];
    vendoredPatterns?: string[];
  };
  research?: {
    maxWorkers?: number;
    defaultDepth?: "quick" | "normal" | "deep";
    maxCostUsd?: number;
    strategy?: "openrouter-free" | "best-available-cheap" | "explicit";
    workers?: number;
  };
  policy?: {
    denyGitPush?: boolean;
    requireApprovalForWrite?: boolean;
    requireApprovalForCommand?: ("low" | "medium" | "high")[];
  };
  /** Arbitrary provider settings passed through to provider adapters. */
  providers?: Record<string, Record<string, unknown>>;
}

export const DEFAULT_CONFIG: ConfigFile = {
  models: { main: "mock/main" },
  research: { strategy: "explicit", workers: 1 },
  policy: {
    denyGitPush: true,
    requireApprovalForWrite: false,
    requireApprovalForCommand: ["high"],
  },
  repository: {
    ignore: ["node_modules", "dist", "build", ".git"],
    generatedPatterns: ["**/*.gen.ts", "**/*.generated.*"],
    vendoredPatterns: ["**/vendor/**", "**/third_party/**"],
  },
};

export type ResolvedConfig = {
  source: string;
} & ConfigFile;
