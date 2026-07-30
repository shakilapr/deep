// Approval gate for tool actions. Production-safe default: approvals are denied
// unless the operator explicitly opts in (--yes / DEEP_AUTO_APPROVE=1) or
// confirms on a TTY. This replaces the previous always-true auto-approval.
import * as readline from "node:readline";

export type ApprovalFn = (action: string) => Promise<boolean>;

export function buildApproval(autoApprove: boolean, out: (line: string) => void): ApprovalFn {
  if (autoApprove || process.env.DEEP_AUTO_APPROVE === "1") {
    return async () => true;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return async (action: string) => {
      out(`approval required for ${action} (non-interactive) — denied; pass --yes to allow`);
      return false;
    };
  }
  return (action: string) =>
    new Promise<boolean>((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`Allow ${action}? [y/N] `, (ans: string) => {
        rl.close();
        resolve(/^y(es)?$/i.test(ans.trim()));
      });
    });
}
