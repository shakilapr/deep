// Phase 06 — Session kernel (resumable conversations)
import { Store, Persistable } from "../persistence/store.js";
import { EventBus } from "../observability/eventBus.js";

export type MessageKind = "user" | "assistant" | "tool_call" | "tool_result" | "system";

export interface SessionMessage {
  id: string;
  kind: MessageKind;
  content: string;
  toolName?: string;
  toolCallId?: string;
  timestamp: number;
}

export interface SessionRecord {
  id: string;
  repoRoot: string;
  createdAt: number;
  updatedAt: number;
  cancelled?: boolean;
  messages: SessionMessage[];
}

const locks = new Set<string>();

export class SessionKernel {
  constructor(
    private store: Store,
    private bus: EventBus = new EventBus(),
    private idGen: () => string = () => Math.random().toString(36).slice(2),
  ) {}

  create(repoRoot: string, id?: string): SessionRecord {
    const sid = id ?? `sess_${this.idGen()}`;
    const rec: SessionRecord = {
      id: sid,
      repoRoot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    this.store.put("sessions", rec as unknown as Persistable);
    this.bus.emit({ type: "SessionStarted", sessionId: sid, timestamp: Date.now() });
    return rec;
  }

  get(id: string): SessionMessage[] | undefined {
    const rec = this.store.get("sessions", id) as unknown as SessionRecord | undefined;
    return rec?.messages;
  }

  getRecord(id: string): SessionRecord | undefined {
    return this.store.get("sessions", id) as unknown as SessionRecord | undefined;
  }

  list(): { id: string; updatedAt: number; messageCount: number }[] {
    return this.store
      .all("sessions")
      .map((r) => {
        const rec = r as unknown as SessionRecord;
        return { id: rec.id, updatedAt: rec.updatedAt, messageCount: rec.messages.length };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  append(id: string, msg: Omit<SessionMessage, "id" | "timestamp">): SessionMessage {
    const rec = this.getRecord(id);
    if (!rec) throw new Error(`session ${id} not found`);
    const full: SessionMessage = { ...msg, id: this.idGen(), timestamp: Date.now() };
    rec.messages.push(full);
    rec.updatedAt = Date.now();
    this.store.put("sessions", rec as unknown as Persistable);
    return full;
  }

  cancel(id: string): void {
    const rec = this.getRecord(id);
    if (!rec) return;
    rec.cancelled = true;
    rec.updatedAt = Date.now();
    this.store.put("sessions", rec as unknown as Persistable);
    this.bus.emit({ type: "Cancelled", scope: `session:${id}`, timestamp: Date.now() });
  }

  /** In-process lock to prevent concurrent writers to the same session. */
  acquire(id: string): () => void {
    if (locks.has(id)) throw new Error(`session ${id} is locked by another writer`);
    locks.add(id);
    return () => locks.delete(id);
  }

  export(id: string): string {
    const rec = this.getRecord(id);
    if (!rec) return "";
    return rec.messages
      .map((m) => `${m.kind.toUpperCase()} [${m.toolName ?? ""}]: ${m.content}`)
      .join("\n");
  }
}
