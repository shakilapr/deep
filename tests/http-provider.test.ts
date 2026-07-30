import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { HttpProvider } from "../src/model-router/http.js";
import { ProviderError } from "../src/protocol/model.js";
import type { ModelRequest } from "../src/protocol/model.js";

let server: Server | undefined;
let lastAuth: string | undefined;

function start(handler: (body: string) => { status: number; json: unknown }): Promise<number> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        lastAuth = req.headers["authorization"];
        const { status, json } = handler(body);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve((server!.address() as AddressInfo).port));
  });
}

afterEach(() => {
  server?.close();
  server = undefined;
});

const baseReq: ModelRequest = {
  modelId: "openrouter/test",
  role: "main",
  messages: [{ role: "user", content: "x" }],
};

describe("HttpProvider (offline, local server)", () => {
  it("serializes the request and parses content + tool_calls", async () => {
    const port = await start(() => ({
      status: 200,
      json: {
        choices: [
          {
            message: {
              content: "ok",
              tool_calls: [
                {
                  id: "t1",
                  type: "function",
                  function: { name: "run_command", arguments: JSON.stringify({ command: "echo hi" }) },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      },
    }));
    const p = new HttpProvider({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: "secret-key",
      defaultModel: "openrouter/test",
    });
    const res = await p.complete({ ...baseReq, tools: [] });
    expect(res.content).toBe("ok");
    expect(res.toolCalls?.[0]?.name).toBe("run_command");
    expect((res.toolCalls?.[0]?.arguments as { command: string }).command).toBe("echo hi");
    expect(res.usage.inputTokens).toBe(5);
    expect(res.usage.outputTokens).toBe(2);
  });

  it("sends the Authorization header", async () => {
    const port = await start(() => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } }));
    const p = new HttpProvider({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: "secret-key",
      defaultModel: "openrouter/test",
    });
    await p.complete(baseReq);
    expect(lastAuth).toBe("Bearer secret-key");
  });

  it("maps 401 to an auth error", async () => {
    const port = await start(() => ({ status: 401, json: { error: { message: "bad key" } } }));
    const p = new HttpProvider({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: "x",
      defaultModel: "openrouter/test",
    });
    await expect(p.complete(baseReq)).rejects.toMatchObject({ kind: "auth" });
  });

  it("maps 429 to a rate_limit error", async () => {
    const port = await start(() => ({ status: 429, json: { error: { message: "slow down" } } }));
    const p = new HttpProvider({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: "x",
      defaultModel: "openrouter/test",
    });
    await expect(p.complete(baseReq)).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("maps 5xx to an unavailable error", async () => {
    const port = await start(() => ({ status: 503, json: { error: { message: "down" } } }));
    const p = new HttpProvider({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: "x",
      defaultModel: "openrouter/test",
    });
    let err: unknown;
    try {
      await p.complete(baseReq);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe("unavailable");
  });
});
