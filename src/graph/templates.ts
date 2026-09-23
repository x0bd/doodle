/**
 * The four base workflows, each a graph built from kinds. A template is a
 * function so every new graph gets fresh ids.
 */
import { makeNode, type Edge, type GraphNode } from "../state/graph";
import { FIXTURES } from "../providers/fixtures";

export type TemplateId = "images" | "film" | "manga" | "book";

export interface Template {
  id: TemplateId;
  name: string;
  note: string;
  build: () => { nodes: GraphNode[]; edges: Edge[] };
}

type Ref = [string, string];
let eseq = 0;
const wire = (from: Ref, to: Ref): Edge => ({ id: `e${++eseq}`, from: { node: from[0], port: from[1] }, to: { node: to[0], port: to[1] } });

const BEAR_PROMPT = "A black bear with a pink snout, minimalist style, soft gradients, clear blue sky";
const BEAR_NEGATIVE = "No text, unnecessary details, background objects, other animals or people.";

export const TEMPLATES: Template[] = [
  {
    id: "images",
    name: "Images",
    note: "Prompt, generate, look. The plain loop.",
    build() {
      const nodes = [
        makeNode("model", 80, 140, { id: "n1" }),
        makeNode("prompt", 400, 40, { id: "n2", data: { text: BEAR_PROMPT } }),
        makeNode("prompt", 400, 250, { id: "n3", title: "Negative", data: { text: BEAR_NEGATIVE } }),
        makeNode("generate", 720, 120, { id: "n4" }),
        makeNode("preview", 1060, 100, { id: "n5", asset: FIXTURES.blackBear }),
      ];
      const edges = [
        wire(["n1", "model"], ["n4", "model"]),
        wire(["n2", "text"], ["n4", "positive"]),
        wire(["n3", "text"], ["n4", "negative"]),
        wire(["n4", "image"], ["n5", "image"]),
      ];
      return { nodes: nodes.map((n) => ({ ...n, status: "canon" as const })), edges };
    },
  },
  {
    id: "film",
    name: "Film",
    note: "A scene, its people and its look, into storyboard frames.",
    build() {
      const nodes = [
        makeNode("character", 60, 40, { id: "c1", title: "R-404", data: { name: "R-404", description: "A small maintenance robot, dented brass, one blue eye brighter than the other." } }),
        makeNode("style", 60, 290, { id: "s1", title: "Nocturne", data: { description: "Quiet, cold, a single practical light in every frame.", palette: "Ink, brass, sodium orange", lighting: "One source, long shadows" } }),
        makeNode("prompt", 360, 40, { id: "p1", title: "Scene 08", data: { text: "Night. The greenhouse. R-404 finds the last living plant and does not know what to do with its hands." } }),
        makeNode("location", 360, 420, { id: "l1", title: "The greenhouse", data: { name: "The greenhouse", description: "Glass gone green with age, half the panes blind. Warm where nothing else is. Water somewhere, always, out of sight." } }),
        makeNode("model", 360, 290, { id: "m1" }),
        makeNode("generate", 680, 80, { id: "g1", title: "Storyboard", extras: [{ id: "place", name: "place", type: "text" }] }),
        makeNode("preview", 1040, 60, { id: "v1", title: "Frame" }),
        // inside R-404
        makeNode("note", 60, 60, { id: "c1n1", title: "Voice", parent: "c1", data: { text: "Never speaks first. Answers in the fewest words that are still kind." } }),
        makeNode("note", 320, 60, { id: "c1n2", title: "History", parent: "c1", data: { text: "Built for the orbital greenhouse. Stayed after everyone left. Has not been told why." } }),
        // inside Scene 08
        makeNode("note", 60, 60, { id: "p1b1", title: "Beat 1", parent: "p1", data: { text: "The door. It has not opened in years and it opens for R-404." } }),
        makeNode("note", 320, 60, { id: "p1b2", title: "Beat 2", parent: "p1", data: { text: "The plant. One leaf. R-404 reaches, stops, reaches again." } }),
        makeNode("note", 580, 60, { id: "p1b3", title: "Beat 3", parent: "p1", data: { text: "It waters it with what is left in the reserve. That was for something else." } }),
      ];
      const edges = [
        wire(["m1", "model"], ["g1", "model"]),
        wire(["p1", "text"], ["g1", "positive"]),
        wire(["s1", "text"], ["g1", "style"]),
        wire(["c1", "text"], ["g1", "character"]),
        wire(["l1", "text"], ["g1", "place"]),
        wire(["g1", "image"], ["v1", "image"]),
      ];
      return { nodes: nodes.map((n) => ({ ...n, status: "canon" as const })), edges };
    },
  },
  {
    id: "manga",
    name: "Manga",
    note: "A script and a cast, panel by panel, onto a page.",
    build() {
      const nodes = [
        makeNode("character", 60, 40, { id: "c1", title: "Kei", data: { name: "Kei", description: "Seventeen, cropped hair, a school jacket two sizes too big, never without headphones." } }),
        makeNode("style", 60, 290, { id: "s1", title: "Screentone", data: { description: "Black ink, screentone greys, hard speed lines.", palette: "Black, white, two greys", lighting: "Flat, high contrast" } }),
        makeNode("prompt", 360, 40, { id: "p1", title: "Panel 1 · script", data: { text: "Kei on the station platform at dawn, alone, the first train's light in the distance." } }),
        makeNode("prompt", 360, 250, { id: "p2", title: "Panel 2 · script", data: { text: "Close on Kei's face: the headphones come off." } }),
        makeNode("model", 360, 460, { id: "m1" }),
        makeNode("generate", 680, 40, { id: "g1", title: "Panel 1" }),
        makeNode("generate", 680, 600, { id: "g2", title: "Panel 2" }),
        makeNode("preview", 1040, 40, { id: "v1", title: "Page · panel 1" }),
        makeNode("preview", 1040, 600, { id: "v2", title: "Page · panel 2" }),
      ];
      const edges = [
        wire(["m1", "model"], ["g1", "model"]),
        wire(["m1", "model"], ["g2", "model"]),
        wire(["p1", "text"], ["g1", "positive"]),
        wire(["p2", "text"], ["g2", "positive"]),
        wire(["s1", "text"], ["g1", "style"]),
        wire(["s1", "text"], ["g2", "style"]),
        wire(["c1", "text"], ["g1", "character"]),
        wire(["c1", "text"], ["g2", "character"]),
        wire(["g1", "image"], ["v1", "image"]),
        wire(["g2", "image"], ["v2", "image"]),
      ];
      return { nodes: nodes.map((n) => ({ ...n, status: "canon" as const })), edges };
    },
  },
  {
    id: "book",
    name: "Book",
    note: "A cast and a voice; chapters of pages. Zoom in to write.",
    build() {
      const nodes = [
        makeNode("character", 60, 40, { id: "c1", title: "Mara", data: { name: "Mara", description: "A lighthouse keeper's daughter who has never seen the mainland and reads every wreck's cargo manifest." } }),
        makeNode("style", 60, 290, { id: "s1", title: "Voice", data: { description: "Close third person, present tense, short sentences, weather in every paragraph.", palette: "", lighting: "" } }),
        makeNode("chapter", 400, 40, { id: "ch1", title: "One", data: { summary: "The morning a ship comes in without a crew." } }),
        makeNode("chapter", 720, 40, { id: "ch2", title: "Two", data: { summary: "What the manifest says, and what it does not." } }),
        // inside One: the brief, the writer, and the pages it writes into
        makeNode("prompt", 60, 60, { id: "p1", title: "Brief", parent: "ch1", data: { text: "Chapter one. The morning a ship comes in without a crew. Mara sees it first from the gallery; the light is still turning." } }),
        makeNode("write", 60, 300, { id: "w1", parent: "ch1" }),
        makeNode("page", 400, 40, { id: "pg1", title: "Page 1", parent: "ch1", data: { text: "The ship is there at first light, the way a word is there when you wake with it. No sail set. No one at the rail.\n\nMara counts the gulls on the yard and stops at eleven." } }),
        makeNode("page", 760, 40, { id: "pg2", title: "Page 2", parent: "ch1" }),
        // inside Two: a page to begin
        makeNode("page", 60, 40, { id: "pg3", title: "Page 1", parent: "ch2" }),
      ];
      const edges = [
        wire(["p1", "text"], ["w1", "brief"]),
        wire(["c1", "text"], ["w1", "character"]),
        wire(["s1", "text"], ["w1", "style"]),
        wire(["w1", "text"], ["pg1", "text"]),
      ];
      return { nodes: nodes.map((n) => ({ ...n, status: "canon" as const })), edges };
    },
  },
];

export const templateById = (id: TemplateId) => TEMPLATES.find((t) => t.id === id)!;
