// Phase 05 — In-process typed event bus
import type { CodeClawEvent } from "../protocol/events.js";

export type EventSubscriber = (event: CodeClawEvent) => void | Promise<void>;

interface Subscription {
  id: number;
  fn: EventSubscriber;
}

export class EventBus {
  private subs = new Map<number, Subscription>();
  private nextId = 1;
  private log: CodeClawEvent[] = [];
  private maxLog: number;

  constructor(maxLog = 100_000) {
    this.maxLog = maxLog;
  }

  /** Synchronous publish: subscribers are awaited but failures are isolated. */
  async publish(event: CodeClawEvent): Promise<void> {
    this.log.push(event);
    if (this.log.length > this.maxLog) this.log.shift();
    const snapshot = [...this.subs.values()];
    for (const sub of snapshot) {
      try {
        await sub.fn(event);
      } catch (err) {
        // Subscriber failures must not crash unrelated subscribers or the publisher.
        console.error(`[eventbus] subscriber ${sub.id} failed for ${event.type}:`, err);
      }
    }
  }

  /** Fire-and-forget convenience (still isolated). */
  emit(event: CodeClawEvent): void {
    void this.publish(event);
  }

  subscribe(fn: EventSubscriber): () => void {
    const id = this.nextId++;
    this.subs.set(id, { id, fn });
    return () => this.subs.delete(id);
  }

  /** Replay persisted/recorded events in order (used for reconstruction & tests). */
  history(): readonly CodeClawEvent[] {
    return this.log;
  }

  clear(): void {
    this.log = [];
    this.subs.clear();
  }
}

export const eventBus = new EventBus();
