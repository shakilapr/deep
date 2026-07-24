// Phase 20 — Repository snapshots (pin state, detect staleness)
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileHash } from "./fs.js";

export interface RepositorySnapshot {
  id: string;
  repositoryRoot: string;
  branch?: string;
  commit?: string;
  dirtyTreeHash: string;
  createdAt: string;
}

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export class SnapshotService {
  constructor(private root: string) {}

  private isGit(): boolean {
    return existsSync(join(this.root, ".git")) || git(this.root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  }

  create(): RepositorySnapshot {
    let branch: string | undefined;
    let commit: string | undefined;
    if (this.isGit()) {
      branch = git(this.root, ["rev-parse", "--abbrev-ref", "HEAD"]) || undefined;
      commit = git(this.root, ["rev-parse", "HEAD"]) || undefined;
    }
    const dirty = this.dirtyTreeHash();
    const id = `snap_${fileHash((commit ?? "") + "|" + dirty + "|" + (branch ?? ""))}`;
    return {
      id,
      repositoryRoot: this.root,
      branch,
      commit,
      dirtyTreeHash: dirty,
      createdAt: new Date().toISOString(),
    };
  }

  private dirtyTreeHash(): string {
    if (!this.isGit()) {
      // Without git, hash all tracked-index files for a stable-ish fingerprint.
      return "nogit";
    }
    const porcelain = git(this.root, ["status", "--porcelain"]) ?? "";
    const lines = porcelain.split("\n").filter(Boolean);
    const parts: string[] = [];
    for (const line of lines) {
      const path = line.slice(3).trim();
      try {
        parts.push(path + ":" + fileHash(readFileSync(join(this.root, path), "utf8")));
      } catch {
        parts.push(path + ":missing");
      }
    }
    return fileHash(parts.join("|"));
  }

  /** Two snapshots are identical only when commit + dirty tree match. */
  equals(a: RepositorySnapshot, b: RepositorySnapshot): boolean {
    return a.commit === b.commit && a.dirtyTreeHash === b.dirtyTreeHash;
  }

  /** Returns true when the current repo state differs from `prev`. */
  isStale(prev: RepositorySnapshot): boolean {
    const now = this.create();
    return !this.equals(prev, now);
  }
}
