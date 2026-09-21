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
      return { nodes, edges };
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
        makeNode("model", 360, 290, { id: "m1" }),
        makeNode("generate", 680, 80, { id: "g1", title: "Storyboard" }),
        makeNode("preview", 1020, 60, { id: "v1", title: "Frame" }),
      ];
      const edges = [
        wire(["m1", "model"], ["g1", "model"]),
        wire(["p1", "text"], ["g1", "positive"]),
        wire(["s1", "text"], ["g1", "style"]),
        wire(["c1", "text"], ["g1", "character"]),
        wire(["g1", "image"], ["v1", "image"]),
      ];
      return { nodes, edges };
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
        makeNode("generate", 680, 380, { id: "g2", title: "Panel 2" }),
        makeNode("preview", 1020, 40, { id: "v1", title: "Page · panel 1" }),
        makeNode("preview", 1020, 380, { id: "v2", title: "Page · panel 2" }),
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
      return { nodes, edges };
    },
  },
  {
    id: "book",
    name: "Book",
    note: "A brief, a voice and a cast, written into a page.",
    build() {
      const nodes = [
        makeNode("character", 60, 40, { id: "c1", title: "Mara", data: { name: "Mara", description: "A lighthouse keeper's daughter who has never seen the mainland and reads every wreck's cargo manifest." } }),
        makeNode("style", 60, 290, { id: "s1", title: "Voice", data: { description: "Close third person, present tense, short sentences, weather in every paragraph.", palette: "", lighting: "" } }),
        makeNode("prompt", 360, 40, { id: "p1", title: "Brief", data: { text: "Chapter one. The morning a ship comes in without a crew." } }),
        makeNode("write", 680, 100, { id: "w1" }),
        makeNode("page", 1020, 40, { id: "pg1" }),
      ];
      const edges = [
        wire(["p1", "text"], ["w1", "brief"]),
        wire(["c1", "text"], ["w1", "character"]),
        wire(["s1", "text"], ["w1", "style"]),
        wire(["w1", "text"], ["pg1", "text"]),
      ];
      return { nodes, edges };
    },
  },
];

export const templateById = (id: TemplateId) => TEMPLATES.find((t) => t.id === id)!;
