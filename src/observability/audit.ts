// Phase 37 — Audit log (append-only JSONL), secret-redacted.
import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EventBus } from "./eventBus.js";
import type { CodeClawEvent } from "../protocol/events.js";
import { redactObject } from "../policy/secret.js";

export interface AuditQuery {
  type?: string;
  since?: number;
}

export class AuditLog {
  private readonly file: string;

  constructor(dir: string) {
    const auditDir = join(dir, ".deep", "audit");
    mkdirSync(auditDir, { recursive: true });
    this.file = join(auditDir, "audit.log.jsonl");
  }

  /** Subscribe to security-relevant events and record structured entries. */
  attach(bus: EventBus): () => void {
    return bus.subscribe((event: CodeClawEvent) => {
      switch (event.type) {
        case "ToolCallCompleted":
          this.record({
            type: event.type,
            ts: event.timestamp,
            sessionId: event.sessionId,
            role: event.role,
            tool: event.tool,
            ok: event.ok,
            callId: event.callId,
          });
          break;
        case "ApprovalRequested":
          this.record({
            type: event.type,
            ts: event.timestamp,
            sessionId: event.sessionId,
            role: event.role,
            action: event.action,
          });
          break;
        case "ApprovalResolved":
          this.record({
            type: event.type,
            ts: event.timestamp,
            sessionId: event.sessionId,
            action: event.action,
            approved: event.approved,
          });
          break;
        case "ResearchCompleted":
          this.record({
            type: event.type,
            ts: event.timestamp,
            sessionId: event.sessionId,
            researchId: event.researchId,
          });
          break;
        case "ModelRequestCompleted":
          this.record({
            type: event.type,
            ts: event.timestamp,
            sessionId: event.sessionId,
            role: event.role,
            modelId: event.modelId,
            // Usage carries no secrets, but redactObject is applied in record().
            usage: event.usage,
          });
          break;
        default:
          break;
      }
    });
  }

  /** Append one entry, redacting any secret-bearing values first. */
  record(entry: Record<string, unknown>): void {
    const safe = redactObject({ ts: Date.now(), ...entry }) as Record<string, unknown>;
    appendFileSync(this.file, JSON.stringify(safe) + "\n", "utf8");
  }

  /** Read back entries, optionally filtered by type and/or timestamp. */
  query(filter: AuditQuery = {}): Record<string, unknown>[] {
    if (!existsSync(this.file)) return [];
    const lines = readFileSync(this.file, "utf8").split("\n").filter((l) => l.trim().length > 0);
    const entries: Record<string, unknown>[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Skip malformed lines.
      }
    }
    return entries.filter((e) => {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.since !== undefined && typeof e.ts === "number" && e.ts < filter.since) return false;
      return true;
    });
  }
}
