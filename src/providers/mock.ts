/**
 * The mock provider: product infrastructure, not a stub. It takes the time
 * a real render takes, reports every step, honours cancellation, and
 * returns the fixture. Every run path is proven against this first.
 */
import { FIXTURES } from "./fixtures";
import type { ImageRequest, ImageResult, Progress, Provider, TextRequest } from "./types";

const STEP_MS = 70;

/** a shot list the mock proposes for any scene — quiet, in order */
const SHOTS = [
  { title: "The door", description: "Wide on the greenhouse door from inside, dust in the one shaft of light. It has not opened in years.", shotSize: "WS", lensMm: 24, movement: "static", durationMs: 4000, rationale: "Establish the room and the stillness before anything moves" },
  { title: "It opens", description: "The door, closer. It gives, slowly, and R-404's silhouette fills the gap.", shotSize: "MS", lensMm: 35, movement: "static", durationMs: 3000, rationale: "The first change in a still world" },
  { title: "The plant", description: "Close on one leaf in a dry bed, the only green in frame.", shotSize: "CU", lensMm: 85, movement: "static", durationMs: 2500, rationale: "What all of this is about" },
  { title: "Reach", description: "R-404's hand enters, stops short of the leaf, pulls back.", shotSize: "MCU", lensMm: 50, movement: "handheld", durationMs: 3500, rationale: "Hesitation, in the hands" },
  { title: "Reserve", description: "Low angle: the reserve tank, a gauge near empty, R-404 unscrewing the valve.", shotSize: "MS", lensMm: 35, movement: "dolly-in", durationMs: 4000, rationale: "The cost is shown, not said" },
  { title: "Water", description: "Overhead. A thin line of water finds the soil. The leaf does not move. Hold.", shotSize: "CU", lensMm: 50, movement: "static", durationMs: 5000, rationale: "The act, and nothing answering it yet" },
];

/** The fixture, varied by the seed — a flip, a shift of tone — so
 *  candidates can be told apart. Rendered once per seed into a PNG. */
async function vary(seed: number): Promise<string> {
  const img = new Image();
  img.src = FIXTURES.blackBear;
  await img.decode();
  const size = 768;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const flip = seed % 2 === 1;
  const hue = (seed % 7) * 12 - 36;
  const bright = 1 + ((seed % 5) - 2) * 0.05;
  ctx.filter = `hue-rotate(${hue}deg) brightness(${bright})`;
  ctx.translate(flip ? size : 0, 0);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.drawImage(img, 0, 0, size, size);
  return c.toDataURL("image/png");
}

/** twelve paragraphs of a morning, so a chapter run has pages to turn */
const MOCK_CHAPTER = [
  "The wind comes in off the water before the light does. She is on the gallery with the glass still in her hand when she sees it — a hull where no hull should be, riding low, no lamp lit, no one at the rail. She counts to ten. Nothing on it moves.",
  "Her father is asleep. He sleeps in the afternoons now and wakes in the dark and calls the hours up the stairs as if the light still needed him to say them. She does not wake him. She writes the bearing on the slate by the door, the way he taught her, and the time, and under it, because the slate is hers as much as his, she writes: no crew.",
  "The path down to the landing is wet with the night's rain. The gorse has grown over the second turn again and she goes through it with her arms up, the way you go into cold water. Below her the ship has come round a little with the tide. She can read the name now. She has read it before, on a manifest, in a hand she did not like.",
  "There is a dinghy on the landing that is not hers and not her father's. It is tied with a knot she knows from the mainland boats, a knot that is meant to be undone in a hurry. She stands over it for a while. Then she unties it, because leaving it tied would be a kind of decision too.",
  "The ship's ladder is down. That is the thing she keeps coming back to, later, when she tries to tell it in order. Not the emptiness of the deck, or the galley fire still warm, or the cup on the chart table with the coffee gone cold and a skin on it. The ladder. Somebody put it down for somebody.",
  "She goes up. The deck is clean. Too clean — swabbed within the hour, the boards still dark with it, and the water in the scuppers has not yet found its way out. She calls once, not loud. The gulls answer. Nothing else does.",
  "In the cabin the log is open to the day before. The entries are ordinary. Wind, sea, a sail sighted to the south and lost again. The last line is the noon position, and it is wrong; it puts them forty miles east of where the rock is, in open water, with nothing to run from and nowhere to be going.",
  "She takes the log. She tells herself it is so that her father can read it, and that is true, and it is not the reason. The reason is that a wrong position in a careful hand is the first thing she has ever found that is exactly her size.",
  "The manifest is in the drawer under the chart table, where they always are. Twelve crates, lamp oil. Four crates, the word after them scored out and written again: instruments. A passenger, no name, berth six. She reads it twice and puts it inside her coat, against her chest, and goes to find berth six.",
  "Berth six is made up. The blanket is folded back the way you fold it if you mean to come back to it. On the shelf above it there is a book with the island's name on the spine, in a language she does not have, and a pressed flower in it marking a page with a drawing of the light.",
  "She hears the dinghy before she sees it. Someone is rowing badly, the oars catching, from the far side of the ship where the landing is not. She goes up on deck and stands where she can be seen, because being seen first is the only advantage she has ever had.",
  "The morning is full now. Her father is awake; she can tell by the smoke. From here the light looks very small, and very white, and the door of it is open, and she understands that whoever put the ladder down is on the island, and has been, since before the light went out.",
];

export const mock: Provider = {
  descriptor: { id: "mock", name: "Mock", capabilities: ["image.generate", "text.generate"] },
  async status() {
    return "available";
  },
  async generateImage(req: ImageRequest, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<ImageResult> {
    const t0 = performance.now();
    const steps = Math.max(1, Math.round(req.steps));
    for (let i = 1; i <= steps; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      await new Promise((r) => setTimeout(r, STEP_MS));
      onProgress({ fraction: i / steps, note: `${i}/${steps}` });
    }
    const asset = req.seed === 12345 ? FIXTURES.blackBear : await vary(req.seed);
    return { asset, seed: req.seed, elapsedMs: performance.now() - t0 };
  },
  async streamText(req: TextRequest, onDelta: (t: string) => void, signal: AbortSignal): Promise<string> {
    const whole = await this.generateText!(req, signal);
    let out = "";
    for (const word of whole.split(/(?<=\s)/)) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      await new Promise((r) => setTimeout(r, 18));
      out += word;
      onDelta(out);
    }
    return whole;
  },
  async generateText(req: TextRequest, signal: AbortSignal): Promise<string> {
    await new Promise((r) => setTimeout(r, 400));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (req.tools && req.runTool) return agent(req, signal);
    // build from the board: a book's makings from its numbered material, cited by number
    if (req.system?.startsWith("BUILD FROM THE BOARD")) {
      const n = (req.prompt.match(/^\[(\d+)\]/gm) ?? []).length;
      const at = (k: number) => (n ? [((k - 1) % n) + 1] : []);
      return JSON.stringify({
        cast: [
          { name: "Mara", description: "A lighthouse keeper's daughter who reads every wreck's manifest.", from: at(1) },
          { name: "The boatman", description: "Takes her down to the shore; says little.", from: at(2) },
        ],
        places: [{ name: "Hollin Head", description: "The lighthouse on the point, and the bar below it.", from: at(1) }],
        things: [{ name: "The manifest", description: "A ship's list of what it carried, and what it did not.", from: at(2) }],
        style: { name: "Navy dusk", description: "Flat colour, a low sun over dark water.", palette: "Navy, pale yellow, teal", lighting: "Low sun, long light", from: at(n) },
        outline: [
          { title: "The ship", summary: "A ship comes in at first light with no one on it.", from: at(1) },
          { title: "The bar", summary: "It grounds on the bar; they cannot reach it.", from: at(2) },
          { title: "The manifest", summary: "What it carried, and what it did not.", from: at(3) },
        ],
        bible: { tone: "Quiet, close, weather in every paragraph.", rules: "The lamp is lit every night, whatever happens.", avoid: "Explaining the ship." },
      });
    }
    // a continuity check: the chapter's first sentence against the first source's
    if (req.system?.startsWith("CONTINUITY CHECK")) {
      const chapter = req.prompt.match(/<chapter[^>]*>\n([\s\S]*?)\n<\/chapter>/)?.[1] ?? "";
      const src = req.prompt.match(/<source name="([^"]*)">\n([\s\S]*?)\n<\/source>/);
      const first = (t: string) => t.trim().split(/(?<=[.!?])\s/)[0] ?? "";
      const quote = first(chapter);
      return JSON.stringify({
        findings: quote && src ? [{ quote, source: src[1], says: first(src[2]), problem: "(Mock) This does not agree with what the book has fixed.", fix: "Change it to agree." }] : [],
      });
    }
    if (req.system?.includes("JSON array only")) {
      const n = Number(req.system.match(/Propose (\d+) shots/)?.[1] ?? 6);
      return JSON.stringify(SHOTS.slice(0, Math.max(1, Math.min(SHOTS.length, n))));
    }
    const brief = req.prompt.trim().replace(/\.$/, "");
    const scene = `The wind comes in off the water before the light does. She is on the gallery with the glass still in her hand when she sees it — a hull where no hull should be, riding low, no lamp lit, no one at the rail. She counts to ten. Nothing on it moves.`;
    // a chapter is long enough to turn a page or two; a beat is one breath
    const length = req.system?.match(/Length: (\w+)/)?.[1];
    if (length === "Chapter") return `${brief}.\n\n${MOCK_CHAPTER.join("\n\n")}`;
    if (length === "Beat") return scene.split(". ")[0] + ".";
    return `${brief}.\n\n${scene}\n\n(Mock. Wire a real writer in Settings when there is one.)`;
  },
};

/** The mock as an agent: it works the document through the same tools a
 *  real one reaches over MCP — where it is, what is written there — and
 *  proposes what the ask is about: shots, characters, or (by default) a
 *  beat for each of the first sentences, each tied to its sentence. */
async function agent(req: TextRequest, signal: AbortSignal): Promise<string> {
  const step = async (name: string, args: Record<string, unknown> = {}) => {
    req.onTool?.(name);
    await new Promise((r) => setTimeout(r, 350));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    return req.runTool!(name, args);
  };
  const here = (await step("doodle_here")).text;
  const id = here.match(/Open: .*?id ([\w-]+)/)?.[1] ?? here.match(/Selected: .*?id ([\w-]+)/)?.[1];
  if (!id) return "(Mock) Open a scene or a page and ask again — I work on what is open.";
  const read = (await step("doodle_read", { id })).text;
  const words = read.split("Words:\n")[1]?.split("\n\nInside:")[0]?.trim() ?? "";
  const ask = `${req.system ?? ""}`.toLowerCase();
  if (/\bshots?\b/.test(ask)) {
    const r = await step("propose_shots", { id, shots: SHOTS.slice(0, 4) });
    return `(Mock) I read it and ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)}`;
  }
  if (/character|who/.test(ask)) {
    const r = await step("propose_characters", { id, characters: [{ name: "The keeper", description: "Mara's father; says little, watches the weather for a living." }] });
    return `(Mock) ${r.text}`;
  }
  const sentences = words.replace(/[#>*_~]/g, "").split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter((t) => t.length > 12).slice(0, 4);
  if (!sentences.length) return "(Mock) There are no words here yet to find beats in.";
  const r = await step("propose_beats", {
    id,
    beats: sentences.map((t, i) => ({ title: t.split(/[,.;:!?]/)[0].split(" ").slice(0, 5).join(" "), text: `Beat ${i + 1}: ${t}`, quote: t })),
  });
  return `(Mock) I read it and ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)}`;
}
