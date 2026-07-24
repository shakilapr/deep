// Shared filesystem safety (Phases 11, 12, 16) — block traversal & symlink escape
import { realpathSync, statSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, normalize } from "node:path";
import { minimatch } from "minimatch";

export class PathError extends Error {}

export interface RepoFsOptions {
  ignore?: string[];
  blockPatterns?: string[];
}

export function normalizeWithin(root: string, target: string): string {
  const absRoot = resolve(root);
  let absTarget: string;
  if (isAbsolute(target)) {
    absTarget = resolve(target);
  } else {
    absTarget = resolve(absRoot, target);
  }
  const rel = relative(absRoot, absTarget);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathError(`path escapes repository: ${target}`);
  }
  return absTarget;
}

/** Resolve safely, rejecting symlink escapes by comparing realpaths. */
export function safeResolve(root: string, target: string, opts: RepoFsOptions = {}): string {
  const abs = normalizeWithin(root, target);
  if (opts.blockPatterns?.some((p) => minimatch(abs, p) || minimatch(abs, `${root}/${p}`))) {
    throw new PathError(`blocked path pattern: ${target}`);
  }
  // Reject if the realpath escapes the root (symlink escape).
  try {
    const real = realpathSync(abs);
    const realRoot = realpathSync(root);
    const rel = relative(realRoot, real);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new PathError(`symlink escapes repository: ${target}`);
    }
  } catch (e) {
    if (e instanceof PathError) throw e;
    // File may not exist yet; that's fine for writes.
  }
  return abs;
}

export function isIgnored(path: string, ignore: string[]): boolean {
  const rel = path.startsWith("/") ? path : path;
  return ignore.some((p) => minimatch(rel, p) || minimatch(rel, `**/${p}`));
}

export function fileHash(content: string | Buffer): string {
  // Small FNV-1a style hash (deterministic, dependency-free).
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function exists(path: string): boolean {
  return existsSync(path);
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
