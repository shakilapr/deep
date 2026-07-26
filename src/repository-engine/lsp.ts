// Phase 50 — Optional LSP reference adapter (opt-in). Uses the bundled
// `typescript` tsserver for accurate go-to-definition / find-references.
// Falls back silently to the regex/graph engine when unavailable or disabled.
import { spawn, ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export interface LspReferenceResult {
  path: string;
  startLine: number;
  endLine: number;
  symbol?: string;
}

export interface LspReferenceProvider {
  readonly available: boolean;
  findReferences(path: string, line: number, character: number): Promise<LspReferenceResult[]>;
  getDefinition(path: string, line: number, character: number): Promise<LspReferenceResult | undefined>;
  dispose(): void;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer: NodeJS.Timeout;
}

function tsServerPath(): string | undefined {
  try {
    const pkg = require.resolve("typescript");
    const p = join(dirname(pkg), "tsserver.js");
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

/** Approximate the 1-based column of `symbol` on `line` (best-effort). */
export function columnOf(path: string, line: number, symbol: string): number {
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    const text = lines[line - 1] ?? "";
    const idx = text.indexOf(symbol);
    return idx >= 0 ? idx + 1 : 1;
  } catch {
    return 1;
  }
}

export class TsServerAdapter implements LspReferenceProvider {
  readonly available: boolean = false;
  private proc?: ChildProcess;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private buffer = "";

  constructor(root: string) {
    const server = tsServerPath();
    if (!server) return;
    try {
      this.proc = spawn(process.execPath, [server], {
        cwd: root,
        stdio: ["pipe", "pipe", "ignore"],
        env: { ...process.env, TSS_LOG: "" },
      });
      this.proc.stdout?.on("data", (d) => this.onData(d.toString()));
      this.proc.on("error", () => ((this as { available: boolean }).available = false));
      if (this.proc.pid) (this as { available: boolean }).available = true;
    } catch {
      (this as { available: boolean }).available = false;
    }
  }

  private onData(s: string): void {
    this.buffer += s;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.type === "response" && typeof msg.request_seq === "number" && this.pending.has(msg.request_seq)) {
        const p = this.pending.get(msg.request_seq)!;
        clearTimeout(p.timer);
        this.pending.delete(msg.request_seq);
        if (msg.success) p.resolve(msg.body);
        else p.reject(new Error(msg.message || "tsserver error"));
      }
    }
  }

  private request<T>(command: string, args: unknown, timeoutMs = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.proc || !this.proc.stdin) {
        reject(new Error("tsserver unavailable"));
        return;
      }
      const seq = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error("tsserver timeout"));
      }, timeoutMs);
      this.pending.set(seq, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.proc.stdin.write(JSON.stringify({ seq, type: "request", command, arguments: args }) + "\n");
    });
  }

  private async safeRequest<T>(command: string, args: unknown): Promise<T | undefined> {
    try {
      return await this.request<T>(command, args);
    } catch {
      return undefined;
    }
  }

  async findReferences(path: string, line: number, character: number): Promise<LspReferenceResult[]> {
    if (!this.available) return [];
    const body = await this.safeRequest<any>("references", { file: path, line, offset: character });
    if (!body || !Array.isArray(body.refs)) return [];
    return body.refs.map((r: any) => ({
      path: r.file,
      startLine: r.start?.line ?? 0,
      endLine: r.end?.line ?? r.start?.line ?? 0,
    }));
  }

  async getDefinition(path: string, line: number, character: number): Promise<LspReferenceResult | undefined> {
    if (!this.available) return undefined;
    const body = await this.safeRequest<any>("definition", { file: path, line, offset: character });
    const d = Array.isArray(body) ? body[0] : body;
    if (!d) return undefined;
    return { path: d.file, startLine: d.start?.line ?? 0, endLine: d.end?.line ?? d.start?.line ?? 0 };
  }

  dispose(): void {
    try {
      this.proc?.stdin?.end();
      this.proc?.kill();
    } catch {
      /* ignore */
    }
  }
}

/** Build an LSP provider when enabled; undefined when disabled/unavailable. */
export function createLspProvider(enabled: boolean, root: string): LspReferenceProvider | undefined {
  if (!enabled) return undefined;
  const adapter = new TsServerAdapter(root);
  return adapter.available ? adapter : undefined;
}
