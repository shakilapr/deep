export interface MotorState {
  enabled: boolean;
  requested: boolean;
}

// F02: the watchdog clears the enabled flag when communication is lost.
export function handleTimeout(state: MotorState): void {
  state.enabled = false;
}
