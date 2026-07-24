// Phase 48 — Live HTTP provider (OpenAI-compatible; OpenRouter free models)
import {
  Provider,
  ProviderError,
  ModelRequest,
  ModelResponse,
  ModelMessage,
  ToolDefinition,
} from "../protocol/model.js";

export interface HttpProviderOptions {
  /** Base URL, e.g. https://openrouter.ai/api/v1 */
  baseUrl: string;
  apiKey: string;
  /** Extra headers (e.g. HTTP-Referer / X-Title for OpenRouter). */
  headers?: Record<string, string>;
  /** Default model id used by `supports`. */
  defaultModel?: string;
  /** Per-request temperature override. */
  temperature?: number;
}

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

function toOAIMessage(m: ModelMessage): OAIMessage {
  if (m.role === "tool") {
    return { role: "tool", content: m.content, tool_call_id: m.toolCallId ?? "" };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  return { role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user", content: m.content };
}

function toOAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

export class HttpProvider implements Provider {
  readonly id: string;
  private baseUrl: string;
  private apiKey: string;
  private headers: Record<string, string>;
  private defaultModel: string;
  private temperature: number;

  constructor(opts: HttpProviderOptions, id = "openrouter") {
    this.id = id;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.headers = opts.headers ?? {};
    this.defaultModel = opts.defaultModel ?? "";
    this.temperature = opts.temperature ?? 0.1;
  }

  supports(modelId: string): boolean {
    if (modelId.startsWith("mock/")) return false;
    return modelId.includes("/") || modelId === this.defaultModel || modelId === "openrouter";
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const oaiMessages = req.messages.map(toOAIMessage);
    const body: Record<string, unknown> = {
      model: req.modelId,
      messages: oaiMessages,
      temperature: this.temperature,
      max_tokens: req.maxTokens ?? 2048,
    };
    if (req.tools && req.tools.length > 0) {
      body.tools = toOAITools(req.tools);
      body.tool_choice = "auto";
    }
    if (req.structured) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "result", strict: true, schema: req.structured.jsonSchema },
      };
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...this.headers,
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      throw new ProviderError("connection", `network error: ${(e as Error).message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        if (j?.error?.message) msg = j.error.message;
      } catch {
        /* ignore */
      }
      if (res.status === 401 || res.status === 403) throw new ProviderError("auth", msg);
      if (res.status === 429) throw new ProviderError("rate_limit", msg);
      if (res.status === 408) throw new ProviderError("timeout", msg);
      if (res.status >= 500) throw new ProviderError("unavailable", msg);
      throw new ProviderError("server_error", msg);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content: string | null; tool_calls?: OAIMessage["tool_calls"] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new ProviderError("empty_response", "no choices in response");

    const toolCalls = (msg.tool_calls ?? []).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      return { id: tc.id, name: tc.function.name, arguments: args };
    });

    return {
      role: req.role,
      content: msg.content ?? "",
      toolCalls,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
