// Phase 12 — Atomic patch application
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Tool, ToolContext, ToolResult } from "../../protocol/tools.js";
import { safeResolve } from "../../repository-engine/fs.js";
import { RepositoryEngine } from "../../repository-engine/engine.js";

export interface PatchFileOp {
  path: string;
  /** Original lines used to locate the hunk (exact consecutive lines). */
  before: string;
  /** Replacement lines. Empty + delete=true removes the block. */
  after: string;
  delete?: boolean;
}

export interface Patch {
  files: PatchFileOp[];
}

export function applyPatchAtomic(engine: RepositoryEngine, patch: Patch): { changed: string[]; backup: Map<string, string> } {
  const root = engine.root;
  const backup = new Map<string, string>();
  const changed: string[] = [];

  for (const op of patch.files) {
    const full = safeResolve(root, op.path);
    if (!existsSync(full)) {
      // New file creation
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, op.after, "utf8");
      changed.push(op.path);
      continue;
    }
    const original = readFileSync(full, "utf8");
    const backupPath = `${full}.codeclaw.bak`;
    copyFileSync(full, backupPath);
    backup.set(op.path, backupPath);

    if (op.delete) {
      // Only delete the exact `before` block if present; otherwise reject.
      if (!original.includes(op.before)) {
        restore(backup);
        throw new Error(`stale/ambiguous delete context in ${op.path}`);
      }
      const updated = original.replace(op.before, "");
      writeFileSync(full, updated, "utf8");
      changed.push(op.path);
      continue;
    }

    if (!original.includes(op.before)) {
      restore(backup);
      throw new Error(`stale or ambiguous patch context in ${op.path}`);
    }
    const updated = original.replace(op.before, op.after);
    writeFileSync(full, updated, "utf8");
    changed.push(op.path);
  }
  // Success: remove temporary backups so the working tree stays clean.
  for (const bak of backup.values()) {
    try { if (existsSync(bak)) require("node:fs").unlinkSync(bak); } catch { /* non-fatal */ }
  }
  return { changed, backup };
}

function restore(backup: Map<string, string>) {
  for (const [path, bak] of backup) {
    renameSync(bak, join(path)); // restore original by moving backup back
  }
}

export function rollbackPatch(backup: Map<string, string>) {
  for (const [path, bak] of backup) {
    if (existsSync(bak)) renameSync(bak, path);
  }
}

export function patchTools(engine: RepositoryEngine): Tool[] {
  const root = engine.root;
  const applyPatch: Tool = {
    definition: {
      name: "apply_patch",
      description: "Apply an atomic multi-file patch.",
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                before: { type: "string" },
                after: { type: "string" },
                delete: { type: "boolean" },
              },
              required: ["path", "before", "after"],
            },
          },
        },
        required: ["files"],
      },
    },
    allowedRoles: ["main"],
    async run(args: any, ctx: ToolContext): Promise<ToolResult> {
      try {
        const { changed, backup } = applyPatchAtomic(engine, args as Patch);
        return {
          ok: true,
          data: { changed },
          summary: `patched ${changed.length} file(s)`,
        };
      } catch (e) {
        return { ok: false, data: { error: (e as Error).message } };
      }
    },
  };
  return [applyPatch];
}
