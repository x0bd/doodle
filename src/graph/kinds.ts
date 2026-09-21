/**
 * The kinds of node, in one registry: what each one is called, the ports
 * it has, its size on the field, the data it starts with, and the fields
 * the inspector edits. The canvas and the inspector both read from here;
 * neither knows a kind by name.
 */
export type NodeKind = "model" | "prompt" | "generate" | "preview" | "character" | "style" | "write" | "page" | "note";
export type PortType = "model" | "text" | "image";

export interface Port {
  id: string;
  name: string;
  type: PortType;
}

export type Field =
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "number"; min: number; max: number; step: number; digits?: number }
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
    size: { w: 220, h: 104 },
    data: { model: "DreamShaper 6 (SD1.5)" },
    groups: [
      {
        name: "Model",
        fields: [
          { key: "model", label: "Checkpoint", type: "select", options: ["DreamShaper 6 (SD1.5)", "SDXL 1.0", "Flux.1 schnell", "Mock"] },
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
    size: { w: 220, h: 168 },
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
    size: { w: 240, h: 298 },
    data: { seed: 12345, control: "Fixed", steps: 30, strength: 8, sampler: "dpm++ 2M", width: 1024, height: 1024, count: 1 },
    groups: [
      {
        name: "Sampling",
        fields: [
          { key: "seed", label: "Randomness", type: "seed" },
          { key: "control", label: "Control mode", type: "select", options: ["Fixed", "Random", "Increment"] },
          { key: "steps", label: "Quality steps", type: "number", min: 1, max: 150, step: 1 },
          { key: "strength", label: "Prompt strength", type: "number", min: 0, max: 30, step: 0.5, digits: 1 },
          { key: "sampler", label: "Sampling method", type: "select", options: ["dpm++ 2M", "euler", "euler a", "ddim"] },
        ],
      },
      {
        name: "Output",
        fields: [
          { key: "count", label: "Candidates", type: "number", min: 1, max: 4, step: 1 },
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
    size: { w: 260, h: 300 },
    data: {},
    groups: [],
  },
  character: {
    kind: "character",
    title: "Character",
    note: "Someone in the world — reused, never retyped",
    inputs: [],
    outputs: [{ id: "text", name: "description", type: "text" }],
    size: { w: 220, h: 210 },
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
    size: { w: 220, h: 150 },
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
    size: { w: 240, h: 178 },
    data: { model: "Mock", length: "Scene" },
    groups: [
      {
        name: "Writing",
        fields: [
          { key: "model", label: "Model", type: "select", options: ["Mock", "Ollama · llama3.2"] },
          { key: "length", label: "Length", type: "select", options: ["Beat", "Scene", "Chapter"] },
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
    size: { w: 220, h: 140 },
    data: { text: "" },
    groups: [{ name: "Note", fields: [{ key: "text", label: "Text", type: "text", rows: 6 }] }],
  },
  page: {
    kind: "page",
    title: "Page",
    note: "What was written",
    inputs: [{ id: "text", name: "text", type: "text" }],
    outputs: [],
    size: { w: 300, h: 340 },
    data: { text: "" },
    groups: [],
  },
};

/** the rows the in-node fields show, per kind — label and the key to read */
export const NODE_ROWS: Partial<Record<NodeKind, { label: string; key: string }[]>> = {
  write: [
    { label: "Model", key: "model" },
    { label: "Length", key: "length" },
  ],
  style: [
    { label: "Palette", key: "palette" },
    { label: "Lighting", key: "lighting" },
  ],
  generate: [
    { label: "Randomness", key: "seed" },
    { label: "Control mode", key: "control" },
    { label: "Quality steps", key: "steps" },
    { label: "Prompt strength", key: "strength" },
    { label: "Sampling method", key: "sampler" },
  ],
};
