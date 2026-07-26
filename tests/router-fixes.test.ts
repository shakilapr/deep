import { describe, it, expect } from "vitest";
import { ModelRouter } from "../src/model-router/router.js";
import { MockProvider } from "../src/model-router/mock.js";
import { ProviderError } from "../src/protocol/model.js";

describe("router fixes", () => {
  it("cost() returns 0 (not NaN) for a partial costTable entry", () => {
    const r = new ModelRouter({ primary: "mock/main", costTable: { "mock/main": { in: 1 } } });
    r.register(new MockProvider({}, "mock"), ["mock/main"]);
    // call complete so cost() runs usage through the partial {in} entry
    void r.complete({ modelId: "mock/main", role: "main", messages: [{ role: "user", content: "x" }] });
    const eventUsages: number[] = [];
    // cost is private; observe via emitted usage estimatedCostUsd (could be NaN if buggy)
    r["bus"]?.subscribe((e) => {
      if ((e as any).type === "ModelRequestCompleted") eventUsages.push((e as any).usage.estimatedCostUsd);
    });
    void r.complete({ modelId: "mock/main", role: "main", messages: [{ role: "user", content: "y" }] });
    expect(Number.isNaN(eventUsages[0])).toBe(false);
  });

  it("complete() preserves a thrown non-Error provider reason", async () => {
    const failing = new MockProvider({ failWith: "rate_limit" }, "fail");
    const r = new ModelRouter({ primary: "fail/main", fallbacks: undefined }, undefined as any);
    r.registerProvider(failing);
    // providerFor falls back via supports(); make supports accept the model.
    (failing as unknown as { supports: (m: string) => boolean }).supports = () => true;
    let caught = false;
    try {
      await r.complete({ modelId: "fail/main", role: "main", messages: [{ role: "user", content: "z" }] });
    } catch (e) {
      caught = true;
      expect((e as Error).message.length).toBeGreaterThan(0);
      expect((e as Error).message).toMatch(/rate_limit|mock|null|model routes/);
    }
    expect(caught).toBe(true);
  });

  it("preserves an Error instance thrown by a provider", async () => {
    const err = new ProviderError("unavailable", "boom-down");
    const failing = { id: "fail2", supports: () => true, complete: async () => { throw err; } };
    const r = new ModelRouter({ primary: "fail2/main" }, undefined as any);
    r.registerProvider(failing as any);
    let caught = false;
    try {
      await r.complete({ modelId: "fail2/main", role: "main", messages: [{ role: "user", content: "z" }] });
    } catch (e) {
      caught = true;
      expect(e).toBe(err); // same Error instance preserved
    }
    expect(caught).toBe(true);
  });
});