// Phase 44 — Observability formatting (pure string builders)
import type { Metrics } from "./logging.js";
import type { EventBus } from "./eventBus.js";

export interface TraceOptions {
  metrics: Metrics;
  bus?: EventBus;
  lastN?: number;
}

export function formatTrace(opts: TraceOptions): string {
  const snap = opts.metrics.snapshot();
  const lines: string[] = ["trace summary"];

  const counters = Object.entries(snap.counters);
  const tokensIn = snap.counters["tokens.input"] ?? 0;
  const tokensOut = snap.counters["tokens.output"] ?? 0;
  const cost = snap.counters["cost.usd"] ?? 0;
  lines.push(`  tokens: input=${tokensIn} output=${tokensOut}`);
  lines.push(`  cost: $${Number(cost).toFixed(4)}`);

  const toolCounters = counters.filter(([k]) => k.startsWith("tool."));
  const toolCalls = toolCounters.reduce((s, [, v]) => s + v, 0);
  lines.push(`  tool calls: ${toolCalls}`);
  for (const [k, v] of toolCounters) lines.push(`    ${k}: ${v}`);

  if (snap.timers.length > 0) {
    lines.push(`  timers: ${snap.timers.length}`);
    for (const t of snap.timers.slice(-5)) lines.push(`    ${t.name}: ${t.ms}ms`);
  }

  if (opts.bus) {
    const events = opts.bus.history();
    const n = opts.lastN ?? 10;
    lines.push(`  events: ${events.length} total`);
    for (const e of events.slice(-n)) lines.push(`    ${e.type}`);
  }

  return lines.join("\n");
}

export function formatCost(metrics: Metrics): string {
  const snap = metrics.snapshot();
  const tokensIn = snap.counters["tokens.input"] ?? 0;
  const tokensOut = snap.counters["tokens.output"] ?? 0;
  const cost = snap.counters["cost.usd"] ?? 0;
  return [
    "cost summary",
    `  input tokens:  ${tokensIn}`,
    `  output tokens: ${tokensOut}`,
    `  total tokens:  ${tokensIn + tokensOut}`,
    `  estimated cost: $${Number(cost).toFixed(4)}`,
  ].join("\n");
}
