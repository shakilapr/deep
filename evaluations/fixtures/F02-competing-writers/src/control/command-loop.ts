import type { MotorState } from "../safety/watchdog.js";

// F02: on the next control cycle the command loop restores the previously
// requested state, even if the watchdog cleared it after a timeout.
export function applyCommand(state: MotorState): void {
  state.enabled = state.requested;
}
