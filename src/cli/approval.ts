// Approval gate for tool actions. Production-safe default: approvals are denied
// unless the operator explicitly opts in (--yes / DEEP_AUTO_APPROVE=1) or
// confirms on a TTY. This replaces the previous always-true auto-approval.
import * as readline from "node:readline";

export type ApprovalFn = (action: string) => Promise<boolean>;

/** Injectable prompt for testing; defaults to a real TTY readline prompt. */
export type PromptFn = (question: string) => Promise<boolean>;

function ttyPrompt(question: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans: string) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

export function buildApproval(
  autoApprove: boolean,
  out: (line: string) => void,
  prompt?: PromptFn,
): ApprovalFn {
  if (autoApprove || process.env.DEEP_AUTO_APPROVE === "1") {
    return async () => true;
  }
  const nonInteractive = !process.stdin.isTTY || !process.stdout.isTTY;
  // An injected prompt (used in tests, or a custom UI) takes precedence over the
  // built-in TTY/non-interactive defaults.
  const defaultAsk: PromptFn =
    prompt ??
    (nonInteractive
      ? async (q: string) => {
          out(`approval required for ${q} (non-interactive) — denied; pass --yes to allow`);
          return false;
        }
      : ttyPrompt);
  return (action: string) => defaultAsk(`Allow ${action}? [y/N] `);
}
