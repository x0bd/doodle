import { afterEach, describe, expect, it, vi } from "vitest";
import { ollama } from "./ollama";
import type { TextRequest } from "./types";

/** Ollama's server, stood in for: the models it holds, what each can do,
 *  and a chat that answers from a script, one reply a round */
function serve(models: Record<string, string[]>, replies: object[][]) {
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith("/api/tags")) return Response.json({ models: Object.keys(models).map((name) => ({ name })) });
    if (url.endsWith("/api/show")) return Response.json({ capabilities: models[body.model] ?? [] });
    if (url.endsWith("/api/chat")) {
      sent.push(body);
      const lines = replies.shift() ?? [];
      // split mid-line, as a network would
      const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
      const cut = Math.floor(text.length / 2);
      return new Response(new ReadableStream({ start: (c) => (c.enqueue(new TextEncoder().encode(text.slice(0, cut))), c.enqueue(new TextEncoder().encode(text.slice(cut))), c.close()) }));
    }
    return new Response("", { status: 404 });
  });
  return sent;
}
const words = (...parts: string[]) => [...parts.map((content) => ({ message: { role: "assistant", content } })), { done: true }];
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe("Ollama", () => {
  it("counts a Hugging Face finetune as a writer, an OCR model not", async () => {
    serve({ "hf.co/bartowski/Altworld_Hemmingway-1-GGUF:Q6_K": ["completion"], "glm-ocr:latest": ["completion"] }, []);
    expect(await ollama.status()).toBe("available");
    serve({ "glm-ocr:latest": ["completion"] }, []);
    expect(await ollama.status()).toBe("unavailable");
  });

  it("streams the words as they come, thinking off for a model that thinks", async () => {
    const sent = serve({ "writer:27b": ["completion", "thinking"] }, [words("The wind ", "comes in ", "off the water.")]);
    await ollama.status();
    const seen: string[] = [];
    const out = await ollama.streamText!({ prompt: "Begin.", system: "Continue." }, (t) => seen.push(t), signal());
    expect(out).toBe("The wind comes in off the water.");
    expect(seen).toEqual(["The wind ", "The wind comes in ", "The wind comes in off the water."]);
    expect(sent[0]).toMatchObject({ model: "writer:27b", stream: true, think: false, messages: [{ role: "system", content: "Continue." }, { role: "user", content: "Begin." }] });
  });

  it("says nothing of thinking to a model that cannot, and hands a schema over as the format", async () => {
    const sent = serve({ "plain:7b": ["completion"] }, [words('{"a":1}')]);
    await ollama.status();
    await ollama.generateText!({ prompt: "x", schema: { type: "object" }, context: 16384 }, signal());
    expect(sent[0].think).toBeUndefined();
    expect(sent[0].format).toEqual({ type: "object" });
    expect(sent[0].options).toEqual({ num_ctx: 16384 });
  });

  it("works the document: calls the tools, is told what they said, and answers", async () => {
    const call = (name: string, args: object) => ({ message: { role: "assistant", content: "", tool_calls: [{ function: { name, arguments: args } }] } });
    const sent = serve({ "writer:27b": ["completion", "tools"] }, [
      [call("doodle_here", {}), { done: true }],
      [call("propose_beats", { id: "p1", beats: [{ title: "Ship", text: "A ship." }] }), { done: true }],
      words("I proposed ", "one beat."),
    ]);
    await ollama.status();
    const ran: string[] = [];
    const req: TextRequest = {
      prompt: "The page.",
      tools: true,
      instructions: "You are the writing partner.",
      toolSpecs: [
        { name: "doodle_here", description: "Where", inputSchema: { type: "object", properties: {} } },
        { name: "propose_beats", description: "Beats", inputSchema: { type: "object", properties: {} } },
      ],
      runTool: (name, args) => (ran.push(`${name} ${JSON.stringify(args)}`), { text: name === "doodle_here" ? "Open: Page (page, id p1)" : "Proposed 1.", error: false }),
      onTool: () => {},
    };
    const out = await ollama.streamText!(req, () => {}, signal());
    expect(out).toBe("I proposed one beat.");
    expect(ran).toEqual(['doodle_here {}', 'propose_beats {"id":"p1","beats":[{"title":"Ship","text":"A ship."}]}']);
    // the tools went with every round; each answer went back to the model
    expect(sent[0].tools).toHaveLength(2);
    expect((sent[2].messages as { role: string; content: string; tool_name?: string }[]).filter((m) => m.role === "tool")).toEqual([
      { role: "tool", tool_name: "doodle_here", content: "Open: Page (page, id p1)" },
      { role: "tool", tool_name: "propose_beats", content: "Proposed 1." },
    ]);
  });

  it("stops reaching for the tools after twelve rounds and answers without them", async () => {
    const call = { message: { role: "assistant", content: "", tool_calls: [{ function: { name: "doodle_here", arguments: {} } }] } };
    const sent = serve({ "writer:27b": ["completion", "tools"] }, [...Array.from({ length: 12 }, () => [call, { done: true }]), words("Done.")]);
    await ollama.status();
    const req: TextRequest = { prompt: "x", tools: true, toolSpecs: [{ name: "doodle_here", description: "Where", inputSchema: {} }], runTool: () => ({ text: "Here.", error: false }) };
    expect(await ollama.streamText!(req, () => {}, signal())).toBe("Done.");
    expect(sent).toHaveLength(13);
    expect(sent[12].tools).toBeUndefined();
  });
});
