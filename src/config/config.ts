// Phase 03 — Configuration system
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  ConfigFile,
  DEFAULT_CONFIG,
  ResolvedConfig,
  SecretReference,
} from "../protocol/config.js";

const SECRET_RE = /(api[_-]?key|secret|token|password|passwd|credential)/i;

function deepMerge<T>(base: T, over: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(over ?? {})) {
    const v = (over as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object") {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}

export class ConfigError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface ConfigSources {
  globalPath: string;
  projectPath: string;
}

export function locateConfigs(repoRoot: string): ConfigSources {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return {
    globalPath: join(home, ".deep", "config.json"),
    projectPath: existsSync(join(repoRoot, ".deep", "config.json"))
      ? join(repoRoot, ".deep", "config.json")
      : join(repoRoot, ".codeclaw", "config.json"),
  };
}

function readJson(path: string): ConfigFile | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
  } catch (e) {
    throw new ConfigError(path, `malformed JSON config: ${(e as Error).message}`);
  }
}

export interface LoadOptions {
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  cliFlags?: Partial<ConfigFile>;
}

export function loadConfig(opts: LoadOptions): ResolvedConfig {
  const { globalPath, projectPath } = locateConfigs(opts.repoRoot);
  const env = opts.env ?? process.env;

  let cfg: ConfigFile = structuredClone(DEFAULT_CONFIG);
  const sources: string[] = ["defaults"];
  const global = readJson(globalPath);
  if (global) { cfg = deepMerge(cfg, global); sources.push(globalPath); }
  const project = readJson(projectPath);
  if (project) { cfg = deepMerge(cfg, project); sources.push(projectPath); }

  // Environment overrides
  if (env.DEEP_MODELS_MAIN) {
    cfg.models = { ...cfg.models, main: env.DEEP_MODELS_MAIN };
    sources.push("env:DEEP_MODELS_MAIN");
  }
  if (env.DEEP_RESEARCH_WORKERS) {
    const n = parseInt(env.DEEP_RESEARCH_WORKERS, 10);
    if (!Number.isNaN(n)) cfg.research = { ...cfg.research, workers: n };
  }

  if (opts.cliFlags) { cfg = deepMerge(cfg, opts.cliFlags); sources.push("cli"); }

  validateConfig(cfg);
  return { ...cfg, source: sources.join(" < ") } as ResolvedConfig;
}

export function validateConfig(cfg: ConfigFile): void {
  if (!cfg.models?.main) throw new ConfigError("models.main", "models.main is required");
  if (cfg.research && cfg.research.workers !== undefined && cfg.research.workers < 1)
    throw new ConfigError("research.workers", "research.workers must be >= 1");
  if (cfg.policy?.requireApprovalForCommand && !Array.isArray(cfg.policy.requireApprovalForCommand))
    throw new ConfigError("policy.requireApprovalForCommand", "must be an array");
  // Reject raw secrets stored in config files.
  if ((cfg as any).secretsRaw) throw new ConfigError("secrets", "raw secrets must not be stored in config");
}

/** Redact secret-bearing values for display. */
export function redactForShow(cfg: ResolvedConfig): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && SECRET_RE.test(k)) node[k] = "***REDACTED***";
      else if (typeof v === "object") walk(v);
    }
  };
  walk(out);
  return out;
}

export function resolveSecret(refs: SecretReference[] | undefined, name: string): string | undefined {
  const ref = refs?.find((r) => r.env === name);
  if (ref) return process.env[ref.env];
  return process.env[name];
}

export function writeProjectConfig(repoRoot: string, cfg: ConfigFile): void {
  const dir = join(repoRoot, ".deep");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(cfg, null, 2));
}
