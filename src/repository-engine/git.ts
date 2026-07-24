// Phase 14 — Git integration
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface GitStatus {
  branch?: string;
  commit?: string;
  dirty: boolean;
  modified: string[];
  staged: string[];
  untracked: string[];
  isRepo: boolean;
}

export class GitIntegration {
  constructor(private root: string) {}

  private run(args: string[]): string {
    return execFileSync("git", args, { cwd: this.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();
  }

  private isRepo(): boolean {
    return existsSync(join(this.root, ".git")) || this.safeRun(["rev-parse", "--is-inside-work-tree"]) === "true";
  }

  private safeRun(args: string[]): string | undefined {
    try { return this.run(args); } catch { return undefined; }
  }

  status(): GitStatus {
    if (!this.isRepo()) {
      return { isRepo: false, dirty: false, modified: [], staged: [], untracked: [] };
    }
    const branch = this.safeRun(["rev-parse", "--abbrev-ref", "HEAD"])?.trim() || undefined;
    const commit = this.safeRun(["rev-parse", "HEAD"])?.trim() || undefined;
    const porcelain = this.safeRun(["status", "--porcelain"]) ?? "";
    const modified: string[] = [];
    const staged: string[] = [];
    const untracked: string[] = [];
    for (const line of porcelain.split("\n")) {
      if (!line.trim()) continue;
      const code = line.slice(0, 2);
      const path = line.slice(3).trim();
      if (code[1] === "?" ) untracked.push(path);
      else {
        if (code[0] !== " ") staged.push(path);
        if (code[1] !== " ") modified.push(path);
      }
    }
    return { isRepo: true, branch, commit, dirty: modified.length + staged.length + untracked.length > 0, modified, staged, untracked };
  }

  diff(opts: { cached?: boolean; paths?: string[] } = {}): string {
    const args = ["diff"];
    if (opts.cached) args.push("--cached");
    if (opts.paths) args.push("--", ...opts.paths);
    return this.safeRun(args) ?? "";
  }

  log(opts: { maxCount?: number; paths?: string[] } = {}): string {
    const args = ["log", `--max-count=${opts.maxCount ?? 20}`, "--oneline"];
    if (opts.paths) args.push("--", ...opts.paths);
    return this.safeRun(args) ?? "";
  }

  /** Deny push by default (Phase 14 + policy). */
  push(_remote?: string, _branch?: string): never {
    throw new Error("git push is disabled by default policy");
  }
}
