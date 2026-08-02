import { describe, it, expect } from "vitest";
import { buildApproval } from "../src/cli/approval.js";

describe("buildApproval", () => {
  it("auto-approves when requested", async () => {
    expect(await buildApproval(true, () => {})(`rm -rf /`)).toBe(true);
  });

  it("approves via an injected prompt that returns true", async () => {
    const fn = buildApproval(false, () => {}, async () => true);
    expect(await fn(`rm -rf /`)).toBe(true);
  });

  it("denies via an injected prompt that returns false", async () => {
    const fn = buildApproval(false, () => {}, async () => false);
    expect(await fn(`rm -rf /`)).toBe(false);
  });

  it("passes the action into the injected prompt", async () => {
    let asked: string | undefined;
    const fn = buildApproval(false, () => {}, async (q: string) => {
      asked = q;
      return false;
    });
    const result = await fn(`run_command`);
    expect(result).toBe(false);
    expect(asked).toBe("Allow run_command? [y/N] ");
  });
});
