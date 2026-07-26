// Phase 54 — File writing/editing tools (main role only; approval-gated by policy).
// Gives the agent direct ".md" (and any text) authoring capability alongside
// the atomic `apply_patch` editor.
import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { Tool, ToolResult } from "../../protocol/tools.js";
import { safeResolve } from "../../repository-engine/fs.js";
import { RepositoryEngine } from "../../repository-engine/engine.js";

export function writeTools(engine: RepositoryEngine): Tool[] {
  const root = engine.root;

  const writeFile: Tool = {
    definition: {
      name: "write_file",
      description:
        "Create or overwrite a text file (use for .md notes/docs/config). Main role only; reads that need analysis still use read_file/apply_patch.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" }, createOnly: { type: "boolean" } },
        required: ["path", "content"],
      },
    },
    allowedRoles: ["main"],
    async run(args: any): Promise<ToolResult> {
      if (args.path == null || args.content == null) return { ok: false, summary: "missing path/content", data: {} };
      const full = safeResolve(root, String(args.path));
      const existed = existsSync(full);
      if (existed && args.createOnly) return { ok: false, summary: "file exists (createOnly)", data: { existed } };
      try {
        mkdirSync(dirname(full), { recursive: true });
        // Best-effort backup before overwrite so the change is reversible.
        if (existed) {
          const bak = `${full}.deep.bak`;
          copyFileSync(full, bak);
        }
        writeFileSync(full, String(args.content), "utf8");
        return { ok: true, summary: existed ? "overwrote" : "created", data: { path: args.path, existed } };
      } catch (e) {
        return { ok: false, summary: (e as Error).message, data: {} };
      }
    },
  };

  const editFile: Tool = {
    definition: {
      name: "edit_file",
      description: "Edit a text file by replacing an exact substring (first occurrence, or all with all:true). Great for scoped .md edits without a full overwrite.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" }, before: { type: "string" }, after: { type: "string" }, all: { type: "boolean" } },
        required: ["path", "before", "after"],
      },
    },
    allowedRoles: ["main"],
    async run(args: any): Promise<ToolResult> {
      const full = safeResolve(root, String(args.path));
      if (!existsSync(full)) return { ok: false, summary: "not found", data: {} };
      const original = readFileSync(full, "utf8");
      if (!original.includes(String(args.before))) {
        return { ok: false, summary: "anchor 'before' not present", data: {} };
      }
      const all = !!args.all;
      const after = String(args.after);
      const replaced = all
        ? original.split(String(args.before)).join(after)
        : original.replace(String(args.before), after);
      if (replaced === original) return { ok: false, summary: "no change", data: {} };
      try {
        copyFileSync(full, `${full}.deep.bak`);
        writeFileSync(full, replaced, "utf8");
        return { ok: true, summary: all ? "replaced all" : "replaced first", data: { path: args.path } };
      } catch (e) {
        return { ok: false, summary: (e as Error).message, data: {} };
      }
    },
  };

  return [writeFile, editFile];
}