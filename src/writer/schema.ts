/**
 * The writer's schema: what a block of words can be. One schema for both
 * forms — prose uses the body, headings and quotes; a screenplay uses the
 * body as its action and the screenplay's own elements beside it. Which
 * blocks a document may take is the form's business (markup.ts), not the
 * schema's, so a page can change form without losing a word.
 */
import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";

export type Form = "prose" | "screenplay";

const block = (tag: string, cls: string, content = "inline*"): NodeSpec => ({
  group: "block",
  content,
  parseDOM: [{ tag: `${tag}.${cls}` }],
  toDOM: () => [tag, { class: cls }, 0],
});

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },
  /** a paragraph — in a screenplay, the action */
  paragraph: { group: "block", content: "inline*", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
  heading: {
    group: "block",
    content: "inline*",
    attrs: { level: { default: 1 } },
    defining: true,
    parseDOM: [1, 2, 3].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (n) => [`h${n.attrs.level}`, 0],
  },
  quote: { group: "block", content: "paragraph+", defining: true, parseDOM: [{ tag: "blockquote" }], toDOM: () => ["blockquote", 0] },
  // the screenplay's elements: marks are allowed only where Fountain has them
  scene: { ...block("p", "sp-scene", "text*"), marks: "", defining: true },
  character: { ...block("p", "sp-character", "text*"), marks: "" },
  parenthetical: { ...block("p", "sp-paren", "text*"), marks: "" },
  dialogue: block("p", "sp-dialogue"),
  transition: { ...block("p", "sp-transition", "text*"), marks: "" },
  text: { group: "inline" },
  hard_break: { inline: true, group: "inline", selectable: false, parseDOM: [{ tag: "br" }], toDOM: () => ["br"] },
};

const marks: Record<string, MarkSpec> = {
  strong: { parseDOM: [{ tag: "strong" }, { tag: "b" }], toDOM: () => ["strong", 0] },
  em: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] },
  strike: { parseDOM: [{ tag: "s" }, { tag: "del" }], toDOM: () => ["s", 0] },
};

export const schema = new Schema({ nodes, marks });

/** the blocks each form offers, in the order a menu lists them */
export const BLOCKS: Record<Form, { type: string; level?: number; name: string; key?: string }[]> = {
  prose: [
    { type: "paragraph", name: "Body", key: "⇧⌘B" },
    { type: "heading", level: 1, name: "Title", key: "⇧⌘T" },
    { type: "heading", level: 2, name: "Heading", key: "⇧⌘H" },
    { type: "heading", level: 3, name: "Subheading", key: "⇧⌘J" },
    { type: "quote", name: "Quote" },
  ],
  screenplay: [
    { type: "scene", name: "Scene heading" },
    { type: "paragraph", name: "Action" },
    { type: "character", name: "Character" },
    { type: "parenthetical", name: "Parenthetical" },
    { type: "dialogue", name: "Dialogue" },
    { type: "transition", name: "Transition" },
  ],
};
