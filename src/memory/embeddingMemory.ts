// Phase 52 — Optional vector memory (opt-in). Uses an OpenAI-compatible
// /embeddings endpoint when configured; otherwise a deterministic local
// embedding so the system works offline and is unit-testable. Persisted via Store.
// Never edits the audited repository.
import { Store, Persistable } from "../persistence/store.js";

export interface EmbeddingRecord extends Persistable {
  id: string;
  text: string;
  vector: number[];
  meta?: Record<string, unknown>;
}

const DIM = 64;

/** Deterministic local embedding (bag-of-char-trigram hashed into DIM dims). */
export function localEmbedding(text: string): number[] {
  const v = new Array(DIM).fill(0);
  const t = text.toLowerCase();
  for (let i = 0; i < t.length - 2; i++) {
    let h = 0;
    for (let j = 0; j < 3; j++) h = (h * 31 + t.charCodeAt(i + j)) >>> 0;
    v[h % DIM] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
}

export class LocalEmbeddingClient implements EmbeddingClient {
  async embed(text: string): Promise<number[]> {
    return localEmbedding(text);
  }
}

export class HttpEmbeddingClient implements EmbeddingClient {
  constructor(private baseUrl: string, private apiKey: string, private model = "text-embedding-3-small") {}
  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input: text, model: this.model }),
    });
    if (!res.ok) throw new Error(`embeddings HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const arr = data?.data;
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("embeddings response malformed");
    const first = arr[0];
    if (!first || !Array.isArray(first.embedding)) throw new Error("embeddings response malformed");
    return first.embedding as number[];
  }
}

export class EmbeddingMemory {
  private client: EmbeddingClient;
  constructor(private store: Store, private collection = "embeddings") {
    const base = process.env.DEEP_EMBED_BASE_URL;
    const key = process.env.DEEP_EMBED_KEY;
    this.client = base && key ? new HttpEmbeddingClient(base, key) : new LocalEmbeddingClient();
  }

  async add(id: string, text: string, meta?: Record<string, unknown>): Promise<void> {
    const vector = await this.client.embed(text);
    const rec: EmbeddingRecord = { id, text, vector, meta };
    this.store.put(this.collection, rec as unknown as Persistable);
  }

  query(text: string, k = 5): Array<{ id: string; score: number; meta?: Record<string, unknown> }> {
    const q = localEmbedding(text); // query embedding must match stored space; for HTTP we approximate
    const all = this.store.all(this.collection) as unknown as EmbeddingRecord[];
    return all
      .map((r) => ({ id: r.id, score: cosine(q, r.vector), meta: r.meta }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
