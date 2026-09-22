/**
 * The kinds of node, in one registry: what each one is called, the ports
 * it has, its size on the field, the data it starts with, and the fields
 * the inspector edits. The canvas and the inspector both read from here;
 * neither knows a kind by name.
 */
export type NodeKind = "model" | "prompt" | "generate" | "preview" | "character" | "style" | "write" | "page" | "note" | "shot" | "chapter";

/** the kinds that are written in — entered, they are a document; zoomed
 *  into on the field, they open */
export const WRITTEN = new Set<NodeKind>(["page", "chapter", "prompt", "note"]);
/** the kinds that are a place — entered, they are a field of what they hold */
export const PLACES = new Set<NodeKind>(["chapter"]);
export type PortType = "model" | "text" | "image";

export interface Port {
  id: string;
  name: string;
  type: PortType;
}

export type Field =
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "number"; min: number; max: number; step: number; digits?: number }
  /** a number you set by hand along a track, with its figure beside it */
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; digits?: number; unit?: string }
  /** one of a few, all of them shown — a row of keys in a well */
  | { key: string; label: string; type: "choice"; options: string[] }
  | { key: string; label: string; type: "seed" }
  | { key: string; label: string; type: "line" }
  | { key: string; label: string; type: "text"; rows?: number };

export interface KindDef {
  kind: NodeKind;
  title: string;
  note: string;
  inputs: Port[];
  outputs: Port[];
  size: { w: number; h: number };
  data: Record<string, string | number>;
  /** the inspector's groups */
  groups: { name: string; fields: Field[] }[];
}

export const KINDS: Record<NodeKind, KindDef> = {
  model: {
    kind: "model",
    title: "Model",
    note: "Which model draws",
    inputs: [],
    outputs: [{ id: "model", name: "model", type: "model" }],
    size: { w: 240, h: 80 },
    data: { model: "Default" },
    groups: [
      {
        name: "Model",
        fields: [
          { key: "model", label: "Checkpoint", type: "select", options: ["Default", "DreamShaper 6 (SD1.5)", "SDXL 1.0", "Flux.1 schnell"] },
        ],
      },
    ],
  },
  prompt: {
    kind: "prompt",
    title: "Prompt",
    note: "What you want, or what you do not",
    inputs: [],
    outputs: [{ id: "text", name: "text", type: "text" }],
    size: { w: 240, h: 176 },
    data: { text: "" },
    groups: [{ name: "Text", fields: [{ key: "text", label: "Prompt", type: "text", rows: 5 }] }],
  },
  generate: {
    kind: "generate",
    title: "Image Generator",
    note: "Generator · mock",
    inputs: [
      { id: "model", name: "model", type: "model" },
      { id: "positive", name: "positive", type: "text" },
      { id: "negative", name: "negative", type: "text" },
      { id: "style", name: "style", type: "text" },
      { id: "character", name: "character", type: "text" },
    ],
    outputs: [{ id: "image", name: "image", type: "image" }],
    size: { w: 260, h: 338 },
    data: { seed: 12345, control: "Fixed", steps: 30, strength: 8, sampler: "dpm++ 2M", width: 1024, height: 1024, count: 1 },
    groups: [
      {
        name: "Sampling",
        fields: [
          { key: "seed", label: "Randomness", type: "seed" },
          { key: "control", label: "Control mode", type: "choice", options: ["Fixed", "Random", "Increment"] },
          { key: "steps", label: "Quality steps", type: "range", min: 1, max: 150, step: 1 },
          { key: "strength", label: "Prompt strength", type: "range", min: 0, max: 30, step: 0.5, digits: 1 },
          { key: "sampler", label: "Sampling method", type: "select", options: ["dpm++ 2M", "euler", "euler a", "ddim"] },
        ],
      },
      {
        name: "Output",
        fields: [
          { key: "count", label: "Candidates", type: "choice", options: ["1", "2", "3", "4"] },
          { key: "width", label: "Width", type: "number", min: 256, max: 2048, step: 64 },
          { key: "height", label: "Height", type: "number", min: 256, max: 2048, step: 64 },
        ],
      },
    ],
  },
  preview: {
    kind: "preview",
    title: "Preview",
    note: "What came out",
    inputs: [{ id: "image", name: "image", type: "image" }],
    outputs: [],
    size: { w: 260, h: 320 },
    data: {},
    groups: [],
  },
  character: {
    kind: "character",
    title: "Character",
    note: "Someone in the world — reused, never retyped",
    inputs: [],
    outputs: [{ id: "text", name: "description", type: "text" }],
    size: { w: 240, h: 190 },
    data: { name: "", description: "" },
    groups: [
      {
        name: "Identity",
        fields: [
          { key: "name", label: "Name", type: "line" },
          { key: "description", label: "Appearance", type: "text", rows: 5 },
        ],
      },
    ],
  },
  style: {
    kind: "style",
    title: "Style",
    note: "How everything looks",
    inputs: [],
    outputs: [{ id: "text", name: "description", type: "text" }],
    size: { w: 240, h: 150 },
    data: { description: "", palette: "", lighting: "" },
    groups: [
      {
        name: "Look",
        fields: [
          { key: "description", label: "Description", type: "text", rows: 3 },
          { key: "palette", label: "Palette", type: "line" },
          { key: "lighting", label: "Lighting", type: "line" },
        ],
      },
    ],
  },
  write: {
    kind: "write",
    title: "Write",
    note: "Writer · mock",
    inputs: [
      { id: "brief", name: "brief", type: "text" },
      { id: "character", name: "character", type: "text" },
      { id: "style", name: "style", type: "text" },
    ],
    outputs: [{ id: "text", name: "text", type: "text" }],
    size: { w: 240, h: 150 },
    data: { model: "Default", length: "Scene" },
    groups: [
      {
        name: "Writing",
        fields: [
          { key: "model", label: "Model", type: "select", options: ["Default", "llama3.2", "gemma3", "qwen3", "mistral"] },
          { key: "length", label: "Length", type: "choice", options: ["Beat", "Scene", "Chapter"] },
        ],
      },
    ],
  },
  shot: {
    kind: "shot",
    title: "Shot",
    note: "One frame of the scene, with its camera",
    inputs: [],
    outputs: [{ id: "text", name: "brief", type: "text" }],
    size: { w: 240, h: 156 },
    data: { description: "", shotSize: "MS", lensMm: 35, movement: "static", durationMs: 3000 },
    groups: [
      {
        name: "Camera",
        fields: [
          { key: "description", label: "What we see", type: "text", rows: 3 },
          { key: "shotSize", label: "Size", type: "select", options: ["ECU", "CU", "MCU", "MS", "MLS", "WS", "EWS"] },
          { key: "lensMm", label: "Lens", type: "range", min: 8, max: 200, step: 1, unit: "mm" },
          { key: "movement", label: "Movement", type: "select", options: ["static", "pan", "tilt", "dolly-in", "dolly-out", "truck", "handheld", "crane"] },
          { key: "durationMs", label: "Duration", type: "range", min: 500, max: 60000, step: 250, unit: "ms" },
        ],
      },
    ],
  },
  note: {
    kind: "note",
    title: "Note",
    note: "A thought, kept where it belongs",
    inputs: [],
    outputs: [],
    size: { w: 240, h: 150 },
    data: { text: "" },
    groups: [{ name: "Note", fields: [{ key: "text", label: "Text", type: "text", rows: 6 }] }],
  },
  page: {
    kind: "page",
    title: "Page",
    note: "A sheet — written on, or written into",
    inputs: [{ id: "text", name: "text", type: "text" }],
    outputs: [{ id: "text", name: "text", type: "text" }],
    size: { w: 300, h: 400 },
    data: { text: "" },
    groups: [],
  },
  chapter: {
    kind: "chapter",
    title: "Chapter",
    note: "Pages, in order. Enter it and they are the field.",
    inputs: [],
    outputs: [{ id: "text", name: "text", type: "text" }],
    size: { w: 280, h: 236 },
    data: { summary: "" },
    groups: [{ name: "Chapter", fields: [{ key: "summary", label: "In a line", type: "text", rows: 3 }] }],
  },
};
