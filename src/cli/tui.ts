// Phase 15 — Terminal UI (plain-text, no external TUI libs)

export type Out = (line: string) => void;

const ROLE_PREFIX: Record<string, string> = {
  user: "you",
  assistant: "deep",
  system: "sys",
  tool: "tool",
};

export function printMessage(role: string, text: string, out: Out = console.log): void {
  const prefix = ROLE_PREFIX[role] ?? role;
  for (const line of text.split("\n")) out(`[${prefix}] ${line}`);
}

export function printToolStatus(tool: string, ok: boolean, out: Out = console.log): void {
  out(`${ok ? "[ok]" : "[fail]"} tool ${tool}`);
}

export function printResearchProgress(
  steps: { label: string; state: "done" | "running" | "pending" }[],
  out: Out = console.log,
): void {
  const mark = { done: "[x]", running: "[>]", pending: "[ ]" } as const;
  for (const s of steps) out(`${mark[s.state]} ${s.label}`);
}

export function printDiff(path: string, before: string, after: string, out: Out = console.log): void {
  out(`diff ${path}`);
  const b = before.split("\n");
  const a = after.split("\n");
  const max = Math.max(b.length, a.length);
  for (let i = 0; i < max; i++) {
    const oldLine = b[i];
    const newLine = a[i];
    if (oldLine === newLine) {
      if (oldLine !== undefined) out(`  ${oldLine}`);
    } else {
      if (oldLine !== undefined) out(`- ${oldLine}`);
      if (newLine !== undefined) out(`+ ${newLine}`);
    }
  }
}

export function printCost(
  usage: { calls: number; inputTokens: number; outputTokens: number; costUsd: number },
  out: Out = console.log,
): void {
  out(
    `cost: ${usage.calls} calls, ${usage.inputTokens} in / ${usage.outputTokens} out tokens, $${usage.costUsd.toFixed(4)}`,
  );
}
