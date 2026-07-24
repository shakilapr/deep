import { describe, it } from "vitest";
import { handleTimeout } from "../src/safety/watchdog.js";
import { applyCommand } from "../src/control/command-loop.js";

describe("can-timeout", () => {
  it("watchdog clears enabled, command loop restores requested", () => {
    const state = { enabled: true, requested: true };
    handleTimeout(state);
    // After timeout the motor should be disabled...
    if (state.enabled !== false) throw new Error("watchdog did not clear enabled");
    // ...but the next control cycle restores the stale requested state.
    applyCommand(state);
    if (state.enabled !== true) throw new Error("command loop did not restore state");
  });
});
