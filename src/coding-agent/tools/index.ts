// Phase 10 — Tool registration
import { ToolRuntime } from "../../tooling/runtime.js";
import { PolicyEngine } from "../../policy/policy.js";
import { EventBus } from "../../observability/eventBus.js";
import { RepositoryEngine } from "../../repository-engine/engine.js";
import { readTools } from "./readTools.js";
import { patchTools } from "./patch.js";
import { commandTools } from "./command.js";
import { gitTools } from "./gitTools.js";

export function buildToolRuntime(
  engine: RepositoryEngine,
  policy: PolicyEngine,
  bus: EventBus,
): ToolRuntime {
  const runtime = new ToolRuntime(policy, bus);
  for (const tool of [
    ...readTools(engine),
    ...patchTools(engine),
    ...commandTools(engine),
    ...gitTools(engine),
  ]) {
    runtime.register(tool);
  }
  return runtime;
}
