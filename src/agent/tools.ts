/**
 * Doodle's tools for the agent (plan §11.3: observe and propose).
 *
 * Codex reaches them over MCP (src-tauri/src/mcp.rs hands each request
 * here as a `mcp` event); the mock reaches them directly, through the
 * request's `runTool`. Either way the same functions answer. The `doodle_*`
 * tools read the document; the `propose_*` tools leave proposals on a page
 * — ghosts, drafts — that the writer keeps or drops. None of them changes
 * the document.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "../platform/fs";
import { graph, childrenOf, inputs, type GraphNode } from "../state/graph";
import { nav, trail } from "../state/nav";
import { doc } from "../state/doc";
import { KINDS } from "../graph/kinds";
import { plain, formOf, countWords } from "../writer/markup";
import { tiedTo } from "../state/anchors";
import { offer, type Idea } from "../state/ideas";
import { shots, parseShots } from "../state/shots";
import { drafts } from "../state/drafts";

type Args = Record<string, unknown>;
interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** reads only (true) or leaves a proposal (false) */
  readOnly: boolean;
  run(args: Args, by: string): string;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });

const node = (id: unknown): GraphNode => {
  const n = graph.get().nodes[String(id ?? "")];
  if (!n) throw new Error(`No node with id "${String(id)}". doodle_outline lists them.`);
  return n;
};
const label = (n: GraphNode) => `${n.title} (${KINDS[n.kind].title.toLowerCase()}, id ${n.id}${n.status !== "canon" ? `, ${n.status}` : ""})`;
const wordsOf = (n: GraphNode) => {
  const key = n.kind === "character" || n.kind === "location" || n.kind === "style" || n.kind === "shot" ? "description" : n.kind === "chapter" ? "summary" : "text";
  return String(n.data[key] ?? "");
};
const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}… (${t.length - max} more characters)` : t);

export const TOOLS: Tool[] = [
  {
    name: "doodle_here",
    title: "Where the writer is",
    description: "What the writer has open and selected right now, the path to it, and the project's rules. Call this first.",
    inputSchema: obj({}),
    readOnly: true,
    run() {
      const g = graph.get();
      const focus = nav.get().focus;
      const open = focus ? g.nodes[focus] : undefined;
      const b = doc.get().bible;
      return [
        `Document: ${doc.get().name}`,
        `Path: ${[doc.get().name, ...trail().map((id) => g.nodes[id]?.title ?? id)].join(" › ")}`,
        open ? `Open: ${label(open)}` : "Open: the top level of the document",
        g.selection.length ? `Selected: ${g.selection.map((id) => (g.nodes[id] ? label(g.nodes[id]) : id)).join("; ")}` : "Selected: nothing",
        b.tone && `Tone: ${b.tone}`,
        b.rules && `Rules of the world: ${b.rules}`,
        b.avoid && `Avoid: ${b.avoid}`,
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "doodle_outline",
    title: "The document's outline",
    description: "Every node in the document as a tree: chapters, pages, scenes, beats, characters, places, styles, shots — each with its kind, id, state and size.",
    inputSchema: obj({}),
    readOnly: true,
    run() {
      const g = graph.get();
      const lines: string[] = [];
      const walk = (parent: string | null, depth: number) => {
        const kids = childrenOf(g, parent).map((id) => g.nodes[id]).sort((a, b) => a.seq - b.seq);
        for (const n of kids) {
          if (lines.length > 400) return;
          const w = countWords(wordsOf(n), formOf(n.data));
          const inside = childrenOf(g, n.id).length;
          lines.push(`${"  ".repeat(depth)}- ${label(n)}${w ? ` · ${w} words` : ""}${inside ? ` · ${inside} inside` : ""}`);
          walk(n.id, depth + 1);
        }
      };
      walk(null, 0);
      return lines.join("\n") || "The document is empty.";
    },
  },
  {
    name: "doodle_read",
    title: "Read a node",
    description: "One node in full: its words as written (Markdown, or Fountain for a screenplay), its fields, what feeds it, what is inside it and the passages its beats are tied to.",
    inputSchema: obj({ id: str("The node's id, from doodle_here or doodle_outline.") }, ["id"]),
    readOnly: true,
    run(args) {
      const n = node(args.id);
      const g = graph.get();
      const fed = Object.values(g.edges)
        .filter((e) => e.to.node === n.id)
        .map((e) => `${inputs(n).find((p) => p.id === e.to.port)?.name ?? e.to.port} ← ${g.nodes[e.from.node] ? label(g.nodes[e.from.node]) : "gone"}`);
      const feeds = Object.values(g.edges)
        .filter((e) => e.from.node === n.id)
        .map((e) => (g.nodes[e.to.node] ? label(g.nodes[e.to.node]) : "gone"));
      const kids = childrenOf(g, n.id).map((id) => g.nodes[id]).sort((a, b) => a.seq - b.seq);
      const ties = tiedTo(g, n.id);
      const fields = Object.entries(n.data).filter(([k, v]) => !["text", "description", "summary", "output"].includes(k) && v !== "" && v !== undefined);
      const words = wordsOf(n);
      return [
        label(n),
        n.kind === "page" || n.kind === "prompt" || n.kind === "note" ? `Form: ${formOf(n.data)}` : "",
        n.asset ? "Has a picture." : "",
        fields.length ? `Fields: ${fields.map(([k, v]) => `${k}=${String(v)}`).join(", ")}` : "",
        fed.length ? `Fed by:\n${fed.map((f) => `  ${f}`).join("\n")}` : "",
        feeds.length ? `Feeds: ${feeds.join("; ")}` : "",
        `Words:\n${words.trim() ? clip(words, 20000) : "(none yet)"}`,
        kids.length
          ? `Inside:\n${kids
              .map((k) => {
                const t = ties.find((x) => x.node.id === k.id);
                const tied = t ? (t.found ? ` — tied to "${clip(t.anchor.text, 120)}"` : " — adrift from its passage") : "";
                return `  - ${label(k)}${tied}: ${clip(plain(wordsOf(k), formOf(k.data)).replace(/\s+/g, " "), 300)}`;
              })
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    },
  },
  {
    name: "doodle_find",
    title: "Find in the document",
    description: "Nodes whose title or words contain the query, with the line it was found in.",
    inputSchema: obj({ query: str("Words to look for; case does not matter.") }, ["query"]),
    readOnly: true,
    run(args) {
      const q = String(args.query ?? "").toLowerCase().trim();
      if (!q) throw new Error("An empty query.");
      const hits = Object.values(graph.get().nodes)
        .map((n) => {
          const words = plain(wordsOf(n), formOf(n.data));
          const i = words.toLowerCase().indexOf(q);
          if (i < 0 && !n.title.toLowerCase().includes(q)) return null;
          const line = i < 0 ? "" : words.slice(Math.max(0, i - 60), i + q.length + 60).replace(/\s+/g, " ");
          return `- ${label(n)}${line ? `: …${line}…` : ""}`;
        })
        .filter(Boolean)
        .slice(0, 20);
      return hits.length ? hits.join("\n") : `Nothing matches "${q}".`;
    },
  },
  {
    name: "propose_beats",
    title: "Propose beats",
    description:
      "Propose beats (or notes) inside a scene or a page. They appear as proposals on its page for the writer to keep or drop. Give `quote` — the exact words of the scene a beat comes from — and a kept beat is tied to that passage.",
    inputSchema: obj(
      {
        id: str("The scene's or page's id."),
        beats: {
          type: "array",
          items: obj({ title: str("A few words."), text: str("The beat, a sentence or two."), quote: str("Optional: the exact passage of the scene it comes from."), why: str("Optional: why.") }, ["title", "text"]),
        },
      },
      ["id", "beats"],
    ),
    readOnly: false,
    run(args, by) {
      const n = node(args.id);
      const items = (Array.isArray(args.beats) ? args.beats : []) as Idea[];
      const count = offer(n.id, items.map((b) => ({ kind: n.kind === "page" ? "note" : "beat", title: String(b.title ?? ""), text: String(b.text ?? ""), quote: b.quote ? String(b.quote) : undefined, why: b.why ? String(b.why) : undefined })), by);
      return count ? `Proposed ${count} on ${label(n)}. They wait on its page until the writer keeps them.` : "Nothing to propose.";
    },
  },
  {
    name: "propose_shots",
    title: "Propose shots",
    description: "Propose shots for a scene. They appear as proposed shots on its page for the writer to keep or drop.",
    inputSchema: obj(
      {
        id: str("The scene's id."),
        shots: {
          type: "array",
          items: obj(
            {
              title: str("A few words."),
              description: str("What the camera sees, one or two sentences."),
              shotSize: { type: "string", enum: ["ECU", "CU", "MCU", "MS", "MLS", "WS", "EWS"] },
              lensMm: { type: "number" },
              movement: { type: "string", enum: ["static", "pan", "tilt", "dolly-in", "dolly-out", "truck", "handheld", "crane"] },
              durationMs: { type: "number" },
              rationale: str("Why this shot, briefly."),
            },
            ["title", "description", "shotSize", "lensMm", "movement", "durationMs"],
          ),
        },
      },
      ["id", "shots"],
    ),
    readOnly: false,
    run(args, by) {
      const n = node(args.id);
      const items = parseShots(JSON.stringify({ shots: args.shots ?? [] }));
      const id = `sa${Date.now().toString(36)}`;
      shots.set((s) => ({ ...s, [id]: { id, nodeId: n.id, state: "ready", items, provider: by } }));
      return `Proposed ${items.length} shots on ${label(n)}. They wait on its page until the writer keeps them.`;
    },
  },
  {
    name: "propose_text",
    title: "Propose words",
    description: "Propose new words for a node — to replace its words, or to follow them. It appears as a draft under the words for the writer to keep or discard. Write in the node's own form (Markdown for prose, Fountain for a screenplay).",
    inputSchema: obj({ id: str("The node's id."), text: str("The words."), mode: { type: "string", enum: ["replace", "append"] }, why: str("Optional: what changed and why, in a line.") }, ["id", "text", "mode"]),
    readOnly: false,
    run(args, by) {
      const n = node(args.id);
      const text = String(args.text ?? "").trim();
      if (!text) throw new Error("No words to propose.");
      const id = `da${Date.now().toString(36)}`;
      const ask = args.mode === "replace" ? "rewrite" : "continue";
      drafts.set((d) => ({ ...d, [id]: { id, nodeId: n.id, ask, instruction: String(args.why ?? ""), text, state: "ready", provider: by } }));
      return `A draft waits under ${label(n)}.`;
    },
  },
  {
    name: "propose_characters",
    title: "Propose characters",
    description: "Propose new characters, beside a node. They appear as proposals on that node's page for the writer to keep or drop.",
    inputSchema: obj({ id: str("The node to propose them beside — usually the one open."), characters: { type: "array", items: obj({ name: str("Their name."), description: str("Who they are and how they look.") }, ["name", "description"]) } }, ["id", "characters"]),
    readOnly: false,
    run(args, by) {
      const n = node(args.id);
      const list = (Array.isArray(args.characters) ? args.characters : []) as { name?: string; description?: string }[];
      const count = offer(n.id, list.map((c) => ({ kind: "character", title: String(c.name ?? ""), text: String(c.description ?? "") })), by);
      return count ? `Proposed ${count} characters on ${label(n)}.` : "Nothing to propose.";
    },
  },
  {
    name: "propose_places",
    title: "Propose places",
    description: "Propose new places (locations), beside a node. They appear as proposals on that node's page for the writer to keep or drop.",
    inputSchema: obj({ id: str("The node to propose them beside — usually the one open."), places: { type: "array", items: obj({ name: str("Its name."), description: str("What it is like.") }, ["name", "description"]) } }, ["id", "places"]),
    readOnly: false,
    run(args, by) {
      const n = node(args.id);
      const list = (Array.isArray(args.places) ? args.places : []) as { name?: string; description?: string }[];
      const count = offer(n.id, list.map((c) => ({ kind: "location", title: String(c.name ?? ""), text: String(c.description ?? "") })), by);
      return count ? `Proposed ${count} places on ${label(n)}.` : "Nothing to propose.";
    },
  },
];

/** a tool by name, run, its answer as words; an error says what went wrong */
export function runTool(name: string, args: Args, by = "the agent"): { text: string; error: boolean } {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `No tool named ${name}.`, error: true };
  try {
    return { text: tool.run(args ?? {}, by), error: false };
  } catch (e) {
    return { text: e instanceof Error ? e.message : String(e), error: true };
  }
}

/** what the agent is told about where it is, for a turn that has the tools */
export function briefing(nodeId: string): string {
  const n = graph.get().nodes[nodeId];
  return [
    "You are the writing partner inside Doodle, a creative document made of nodes — chapters, pages, scenes, beats, characters, places, styles, shots.",
    n ? `The writer is on ${label(n)}.` : "",
    "Read what you need with the doodle_* tools before you answer (doodle_read the node you are on first).",
    "You cannot change the document. To suggest additions use propose_beats, propose_shots, propose_characters, propose_places or propose_text: they appear as proposals the writer keeps or drops.",
    "Keep your final reply short — what you proposed and why, or the answer to the question.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Answer the MCP server's requests. The listener belongs to the window,
 *  the way the menu's does, so no hot patch can leave it talking to nobody. */
const KEPT = "__doodleAgent";
export function listenForAgent() {
  if (!inTauri) return;
  const w = window as unknown as Record<string, { ready?: Promise<() => void> } | undefined>;
  const kept = w[KEPT] ?? {};
  w[KEPT] = kept;
  // one listener, ever: the one before is gone before this one arrives, even
  // when a second mount starts before the first has finished listening (as
  // React's development mount does) — two would run every tool twice
  const before = kept.ready;
  kept.ready = (async () => {
    if (before) (await before)();
    return listen<{ id: number; method: string; params: { name?: string; arguments?: Args } }>("mcp", (e) => {
      const { id, method, params } = e.payload;
      if (method === "tools/list") {
        const tools = TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly, destructiveHint: false } }));
        void invoke("mcp_reply", { id, result: { tools } });
        return;
      }
      const r = runTool(String(params?.name ?? ""), params?.arguments ?? {}, "ChatGPT");
      void invoke("mcp_reply", { id, result: { content: [{ type: "text", text: r.text }], isError: r.error } });
    });
  })();
}
