// Phase 11 — Repository read tools (safe)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { Tool, ToolContext, ToolResult } from "../../protocol/tools.js";
import { safeResolve, isIgnored } from "../../repository-engine/fs.js";
import { RepositoryEngine } from "../../repository-engine/engine.js";
import { DependencyGraph } from "../../repository-engine/graph.js";
import { isBlockedPath } from "../../policy/secret.js";

const MAX_READ_BYTES = 200_000;

export function readTools(engine: RepositoryEngine): Tool[] {
  const root = engine.root;
  const ignore = ["node_modules", "dist", "build", ".git", ".deep"];

  const listFiles: Tool = {
    definition: {
      name: "list_files",
      description: "List repository files (relative paths).",
      inputSchema: { type: "object", properties: { pattern: { type: "string" } }, required: [] },
    },
    allowedRoles: ["main", "research-worker"],
    async run(args: any): Promise<ToolResult> {
      const pat = args.pattern as string | undefined;
      const files = engine.index.files().filter((f) => (pat ? f.includes(pat) : true));
      return { ok: true, data: { files: files.slice(0, 500) } };
    },
  };

  const readFile: Tool = {
    definition: {
      name: "read_file",
      description: "Read a text file within the repository.",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    allowedRoles: ["main", "research-worker"],
    async run(args: any, ctx: ToolContext): Promise<ToolResult> {
      // Phase 36 — never allow reading known secret files (e.g. .env), even for
      // research workers whose safeResolve defaults might not block them.
      if (isBlockedPath(args.path)) return { ok: false, data: { error: "blocked: secret file" } };
      const full = safeResolve(root, args.path, { blockPatterns: ["**/.env", "**/*.key", "**/secrets.*"] });
      if (!existsSync(full)) return { ok: false, data: { error: "not found" } };
      const buf = readFileSync(full);
      if (buf.length > MAX_READ_BYTES) {
        return { ok: true, data: { content: buf.slice(0, MAX_READ_BYTES).toString("utf8"), truncated: true } };
      }
      // Binary sniff
      if (buf.includes(0)) return { ok: true, data: { content: "<binary file>", binary: true } };
      return { ok: true, data: { content: buf.toString("utf8") } };
    },
  };

  const readRange: Tool = {
    definition: {
      name: "read_range",
      description: "Read a line range of a file.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" }, startLine: { type: "number" }, endLine: { type: "number" } },
        required: ["path", "startLine", "endLine"],
      },
    },
    allowedRoles: ["main", "research-worker"],
    async run(args: any, ctx: ToolContext): Promise<ToolResult> {
      const full = safeResolve(root, args.path);
      const lines = readFileSync(full, "utf8").split("\n");
      const s = Math.max(1, args.startLine | 0);
      const e = Math.min(lines.length, args.endLine | 0);
      return { ok: true, data: { content: lines.slice(s - 1, e).join("\n") } };
    },
  };

  const searchText: Tool = {
    definition: {
      name: "search_text",
      description: "Search repository text.",
      inputSchema: {
        type: "object",
        properties: { pattern: { type: "string" }, regex: { type: "boolean" }, limit: { type: "number" } },
        required: ["pattern"],
      },
    },
    allowedRoles: ["main", "research-worker"],
    async run(args: any): Promise<ToolResult> {
      const hits = engine.search.search({ pattern: args.pattern, regex: !!args.regex, limit: args.limit ?? 50 });
      return { ok: true, data: { hits } };
    },
  };

  const overview: Tool = {
    definition: {
      name: "repository_overview",
      description: "Summarize repository size, symbols, git state.",
      inputSchema: { type: "object", properties: {} },
    },
    allowedRoles: ["main", "research-worker"],
    async run(): Promise<ToolResult> {
      return { ok: true, data: engine.overview() };
    },
  };

  const findReferences: Tool = {
    definition: {
      name: "find_references",
      description: "Find callers/importers of a symbol (optionally scoped to a file).",
      inputSchema: {
        type: "object",
        properties: { symbol: { type: "string" }, path: { type: "string" } },
        required: ["symbol"],
      },
    },
    allowedRoles: ["main", "research-worker"],
    async run(args: any): Promise<ToolResult> {
      const refs = engine.findReferences(args.symbol, args.path);
      return { ok: true, data: { references: refs.slice(0, 50) } };
    },
  };

  const fileReferences: Tool = {
    definition: {
      name: "file_references",
      description: "Show files this file imports (dependents) and files that import it (importers).",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    allowedRoles: ["main", "research-worker"],
    async run(args: any): Promise<ToolResult> {
      const g = new DependencyGraph(engine).build();
      return {
        ok: true,
        data: { imports: g.getDependents(args.path), importedBy: g.getImporters(args.path) },
      };
    },
  };

  return [listFiles, readFile, readRange, searchText, overview, findReferences, fileReferences];
}
