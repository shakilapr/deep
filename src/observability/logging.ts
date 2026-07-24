// Phase 44 (foundation) — structured logging + metrics
import { eventBus } from "./eventBus.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  message: string;
  ts: number;
  fields?: Record<string, unknown>;
}

export class Logger {
  private records: LogRecord[] = [];
  constructor(private minLevel: LogLevel = "info") {}

  private write(level: LogLevel, message: string, fields?: Record<string, unknown>) {
    const order: LogLevel[] = ["debug", "info", "warn", "error"];
    if (order.indexOf(level) < order.indexOf(this.minLevel)) return;
    const rec: LogRecord = { level, message, ts: Date.now(), fields };
    this.records.push(rec);
    const line = `[${level}] ${message}${fields ? " " + JSON.stringify(fields) : ""}`;
    if (level === "error") console.error(line);
    else console.log(line);
  }
  debug(m: string, f?: Record<string, unknown>) { this.write("debug", m, f); }
  info(m: string, f?: Record<string, unknown>) { this.write("info", m, f); }
  warn(m: string, f?: Record<string, unknown>) { this.write("warn", m, f); }
  error(m: string, f?: Record<string, unknown>) { this.write("error", m, f); }

  recent(): readonly LogRecord[] { return this.records; }
}

export const logger = new Logger(process.env.DEEP_LOG_LEVEL === "debug" ? "debug" : "info");

// Simple metrics accumulator (Phase 44 foundation).
export class Metrics {
  private counters = new Map<string, number>();
  private timers: Array<{ name: string; ms: number }> = [];

  inc(name: string, by = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }
  recordTimer(name: string, ms: number) {
    this.timers.push({ name, ms });
  }
  snapshot() {
    return { counters: Object.fromEntries(this.counters), timers: this.timers };
  }
}

export const metrics = new Metrics();

// Surface key events into metrics automatically.
eventBus.subscribe((e) => {
  if (e.type === "ModelRequestCompleted" && e.usage) {
    metrics.inc("tokens.input", e.usage.inputTokens);
    metrics.inc("tokens.output", e.usage.outputTokens);
    metrics.inc("cost.usd", e.usage.estimatedCostUsd);
  }
  if (e.type === "ToolCallCompleted") metrics.inc(`tool.${e.tool}.${e.ok ? "ok" : "fail"}`);
});
