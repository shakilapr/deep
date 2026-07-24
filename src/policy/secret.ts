// Phase 36 — Secret protection: scanning, redaction, and blocked-path detection.
import { minimatch } from "minimatch";

/** Common secret patterns. Kept intentionally broad but low false-positive. */
export const SECRET_PATTERNS: RegExp[] = [
  // AWS access key IDs.
  /AKIA[0-9A-Z]{16}/g,
  // PEM private key blocks (any variant).
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g,
  // OpenAI-style secret keys.
  /sk-[A-Za-z0-9]{20,}/g,
  // GitHub personal access tokens.
  /ghp_[A-Za-z0-9]{20,}/g,
  // Slack tokens.
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  // Cloud credentials embedded in JSON.
  /"client_secret"\s*:\s*"[^"]+"/g,
];

const REDACTION = "***REDACTED***";

export interface SecretMatch {
  match: string;
  index: number;
}

export function scanText(text: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  if (typeof text !== "string") return out;
  for (const pattern of SECRET_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({ match: m[0], index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

export function redactSecrets(text: string): string {
  if (typeof text !== "string") return text;
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    result = result.replace(re, (full) => {
      // Preserve JSON structure for the client_secret case.
      if (full.startsWith('"client_secret"')) {
        return `"client_secret": "${REDACTION}"`;
      }
      return REDACTION;
    });
  }
  return result;
}

const BLOCKED_PATH_PATTERNS = [
  "**/.env",
  ".env",
  "**/.env.*",
  ".env.*",
  "**/secrets.*",
  "secrets.*",
  "**/*.key",
  "**/credentials.*",
  "credentials.*",
  "**/id_rsa*",
  "id_rsa*",
];

export function isBlockedPath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;
  return BLOCKED_PATH_PATTERNS.some(
    (p) => minimatch(normalized, p, { dot: true }) || minimatch(base, p, { dot: true }),
  );
}

/** Deep-clone `obj` and redact any string value that contains a secret. */
export function redactObject(obj: unknown): unknown {
  if (typeof obj === "string") return redactSecrets(obj);
  if (Array.isArray(obj)) return obj.map((v) => redactObject(v));
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = redactObject(v);
    }
    return out;
  }
  return obj;
}
