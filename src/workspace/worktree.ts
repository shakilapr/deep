// Phase 51 — Git worktree management for isolated edit experiments.
// Used only by the edit flow; the research/bug-finding path never creates one.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const WORKTREE_DIR = ".worktrees";

export function createWorktree(root: string, name: string, branch?: string): string {
  const wtPath = join(root, WORKTREE_DIR, name);
  const args = ["worktree", "add", wtPath];
  if (branch) args.push(branch);
  else args.push("-b", name);
  execFileSync("git", args, {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return wtPath;
}

export function removeWorktree(root: string, name: string): void {
  const wtPath = join(root, WORKTREE_DIR, name);
  try {
    execFileSync("git", ["worktree", "remove", "--force", wtPath], {
      cwd: root,
      stdio: "ignore",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch {
    /* already removed or not a worktree */
  }
}
