// Phase 13 — Command runner (bounded, safe)
import { spawn } from "node:child_process";
import { Tool, ToolContext, ToolResult } from "../../protocol/tools.js";
import { RepositoryEngine } from "../../repository-engine/engine.js";

export type Risk = "low" | "medium" | "high";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  killed: boolean;
  risk: Risk;
}

/** Phase 36 — classify a shell command's destructive/network risk heuristically. */
export function classifyRisk(command: string): Risk {
  const c = command.toLowerCase();
  const high = [
    /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/, // rm -rf and variants
    /\bgit\s+push\b/,
    /\bnpm\s+publish\b/,
    /\byarn\s+publish\b/,
    /\bsudo\b/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /\b:\(\)\s*\{/, // fork bomb
    /\bshutdown\b/,
    /\breboot\b/,
    /\bchmod\s+-r\b/,
    />\s*\/dev\/sd[a-z]/,
    /\bformat\b/,
  ];
  if (high.some((re) => re.test(c))) return "high";

  const medium = [
    /\bnpm\s+(install|i|uninstall|remove|rm)\b/,
    /\byarn\s+(add|remove)\b/,
    /\bpnpm\s+(add|remove|install)\b/,
    /\bpip\s+(install|uninstall)\b/,
    /\bapt(-get)?\s+(install|remove)\b/,
    /\bbrew\s+(install|uninstall)\b/,
    /\brm\s+/,
    /\bgit\s+(reset|clean|checkout)\b/,
    /\bmv\s+/,
  ];
  if (medium.some((re) => re.test(c))) return "medium";

  return "low";
}

export function runCommand(
  cwd: string,
  command: string,
  opts: {
    timeoutMs?: number;
    maxOutput?: number;
    shell?: boolean;
    env?: Record<string, string>;
    signal?: AbortSignal;
    risk?: Risk;
    /** Calling role; non-"main" roles get a best-effort network sandbox. */
    role?: string;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const maxOutput = opts.maxOutput ?? 200_000;
    const risk = opts.risk ?? classifyRisk(command);

    // Phase 13 — network sandbox. For non-main roles we strip network access by
    // pointing proxies at an obviously-dead endpoint and neutralizing extra CA
    // certs. NOTE: this is best-effort; true network isolation is OS-dependent
    // (namespaces/firewall rules) and cannot be guaranteed from within Node.
    let env: Record<string, string | undefined> = { ...process.env, ...(opts.env ?? {}) };
    if (opts.role && opts.role !== "main") {
      env = {
        ...env,
        HTTPS_PROXY: "http://127.0.0.1:9",
        HTTP_PROXY: "http://127.0.0.1:9",
        https_proxy: "http://127.0.0.1:9",
        http_proxy: "http://127.0.0.1:9",
        GIT_CONFIG_COUNT: "0",
        NODE_EXTRA_CA_CERTS: "",
      };
    }

    const child = spawn(opts.shell === false ? command : command, {
      cwd,
      shell: opts.shell ?? true,
      env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killed = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const onAbort = () => {
      killed = true;
      child.kill("SIGKILL");
    };
    if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true });

    const cap = (s: string, acc: string) => (acc + s).slice(-maxOutput);
    child.stdout?.on("data", (d) => (stdout = cap(d.toString(), stdout)));
    child.stderr?.on("data", (d) => (stderr = cap(d.toString(), stderr)));
    child.on("error", (e) => { stderr += String(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1, timedOut, killed, risk });
    });
  });
}

export function commandTools(engine: RepositoryEngine): Tool[] {
  const run: Tool = {
    definition: {
      name: "run_command",
      description: "Run a local command in the repository (bounded).",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeoutMs: { type: "number" },
          risk: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["command"],
      },
    },
    allowedRoles: ["main"],
    async run(args: any, ctx: ToolContext): Promise<ToolResult> {
      // Network access is forbidden for research/critic roles via policy already;
      // runCommand additionally applies a best-effort network sandbox for them.
      // Risk is classified server-side from the command; caller-supplied args.risk
      // is intentionally ignored so it cannot downgrade a destructive command.
      const res = await runCommand(engine.root, args.command, {
        timeoutMs: args.timeoutMs ?? 120_000,
        signal: ctx.signal,
        role: ctx.role,
        risk: classifyRisk(String(args.command ?? "")),
        env: { DEEP_NET: ctx.role === "main" ? "1" : "0" },
      });
      return {
        ok: res.exitCode === 0,
        data: { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode, timedOut: res.timedOut, risk: res.risk },
      };
    },
  };
  return [run];
}
