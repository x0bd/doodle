import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import { parse, serialize, plain, plainOf, toPos, toOffset, countWords, figureAfter } from "./markup";
import { schema, type Form } from "./schema";

const N = schema.nodes;
const K = schema.marks;
const round = (t: string, form: Form = "prose") => serialize(parse(t, form), form);

describe("prose", () => {
  it("keeps words that were never marked up exactly as they were", () => {
    const t = "The ship is there at first light, the way a word is there when you wake with it. No sail set.\n\nMara counts the gulls on the yard and stops at eleven.";
    expect(round(t)).toBe(t);
    expect(plain(t)).toBe(t);
  });

  it("reads headings, quotes, marks and line breaks, and writes them back", () => {
    const t = "# One\n\n## The morning\n\nShe saw it **first**, from the _gallery_; the light ~~was~~ is still turning.\nA second line.\n\n> What the manifest says\n>\n> and what it does not";
    const doc = parse(t);
    expect(doc.child(0).type).toBe(N.heading);
    expect(doc.child(1).attrs.level).toBe(2);
    expect(doc.child(3).type).toBe(N.quote);
    expect(doc.child(3).childCount).toBe(2);
    expect(round(t)).toBe(t);
    expect(plain(t)).toBe("One\n\nThe morning\n\nShe saw it first, from the gallery; the light was is still turning.\nA second line.\n\nWhat the manifest says\n\nand what it does not");
  });

  it("reads *em* as well as _em_, and writes emphasis inside a word with stars", () => {
    expect(parse("a *word* here").child(0).child(1).marks[0].type).toBe(K.em);
    const doc = N.doc.create(null, [N.paragraph.create(null, [schema.text("in"), schema.text("side", [K.em.create()]), schema.text("word and snake_case")])]);
    expect(serialize(doc)).toBe("in*side*word and snake_case");
    expect(plain(serialize(doc))).toBe("insideword and snake_case");
  });

  it("keeps characters that look like markup as words", () => {
    const doc = N.doc.create(null, [
      N.paragraph.create(null, schema.text("# not a heading")),
      N.paragraph.create(null, schema.text("> not a quote, 5 * 3 = 15, a ~~ b, back\\slash")),
    ]);
    const t = serialize(doc);
    expect(plainOf(parse(t)).text).toBe(plainOf(doc).text);
    expect(parse(t).child(0).type).toBe(N.paragraph);
  });

  it("keeps the spaces at a mark's edges outside its delimiters", () => {
    const doc = N.doc.create(null, [N.paragraph.create(null, [schema.text("a "), schema.text("bold ", [K.strong.create()]), schema.text("word")])]);
    expect(serialize(doc)).toBe("a **bold** word");
  });

  it("counts the words, not the markup", () => {
    expect(countWords("# Title\n\n**Two** *words*")).toBe(3);
  });
});

describe("screenplay", () => {
  const scene = [
    "INT. GREENHOUSE - NIGHT",
    "The door has not opened in years. It opens for R-404.",
    "R-404\n(quietly)\nIs anyone here?",
    "MARA (V.O.)\nOnly you.",
    "CUT TO:",
    ".A FORCED HEADING",
    "> FADE OUT",
  ].join("\n\n");

  it("reads the screenplay's elements", () => {
    const doc = parse(scene, "screenplay");
    const types = [] as string[];
    doc.forEach((b) => types.push(b.type.name));
    expect(types).toEqual(["scene", "paragraph", "character", "parenthetical", "dialogue", "character", "dialogue", "transition", "scene", "transition"]);
  });

  it("writes them back as Fountain", () => {
    expect(round(scene, "screenplay")).toBe(scene);
  });

  it("forces action that would read as something else", () => {
    const doc = N.doc.create(null, [N.paragraph.create(null, [schema.text("BANG."), N.hard_break.create(), schema.text("The glass goes.")])]);
    const t = serialize(doc, "screenplay");
    expect(t.startsWith("!")).toBe(true);
    expect(parse(t, "screenplay").child(0).type).toBe(N.paragraph);
  });
});

describe("positions", () => {
  it("maps a place in the words to the document and back", () => {
    const doc = parse("# One\n\nFirst **line**\nsecond\n\n> quoted");
    const p = plainOf(doc);
    for (let off = 0; off <= p.text.length; off++) {
      const pos = toPos(p, off);
      const inGap = p.blocks.every((b) => off < b.start || off > b.start + b.len);
      if (!inGap) expect(toOffset(p, pos)).toBe(off);
    }
    const at = p.text.indexOf("line");
    expect(doc.textBetween(toPos(p, at), toPos(p, at + 4))).toBe("line");
  });
});

/** a random document, of the blocks a form offers, with awkward words */
function randomDoc(form: Form, seed: number): PMNode {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const words = ["light", "the", "sea", "Mara", "5 * 3", "a*b", "~~", "\\", "#", ">", "(aside)", "INT.", "TO:", "!", ".", "wreck", "ok", "_", "snake_case", "__init__", "***"];
  const phrase = () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => pick(words)).join(" ");
  const rich = () => {
    const out: PMNode[] = [];
    const n = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      if (i && rnd() < 0.15) out.push(N.hard_break.create());
      const marks = [K.strong, K.em, K.strike].filter(() => rnd() < 0.25).map((m) => m.create());
      out.push(schema.text(`${i ? " " : ""}${phrase()}`, marks));
    }
    return out;
  };
  const blocks: PMNode[] = [];
  const count = 1 + Math.floor(rnd() * 8);
  for (let i = 0; i < count; i++) {
    if (form === "prose") {
      const k = pick(["p", "p", "h", "q"]);
      if (k === "h") blocks.push(N.heading.create({ level: 1 + Math.floor(rnd() * 3) }, schema.text(phrase())));
      else if (k === "q") blocks.push(N.quote.create(null, [N.paragraph.create(null, rich())]));
      else blocks.push(N.paragraph.create(null, rich()));
    } else {
      const k = pick(["scene", "action", "cue", "transition"]);
      if (k === "scene") blocks.push(N.scene.create(null, schema.text(`INT. ${phrase()}`)));
      else if (k === "transition") blocks.push(N.transition.create(null, schema.text("CUT TO:")));
      else if (k === "cue") {
        blocks.push(N.character.create(null, schema.text(pick(["MARA", "R-404", "KEI (V.O.)"]))));
        blocks.push(N.dialogue.create(null, rich()));
      } else blocks.push(N.paragraph.create(null, rich()));
    }
  }
  return N.doc.create(null, blocks);
}

describe("no words are lost", () => {
  for (const form of ["prose", "screenplay"] as Form[]) {
    it(`${form}: 1000 random documents survive write → read → write → read`, () => {
      for (let seed = 1; seed <= 1000; seed++) {
        const doc = randomDoc(form, seed);
        const once = serialize(doc, form);
        const back = parse(once, form);
        // what was read once reads back the same, however it is written
        const again = parse(serialize(back, form), form);
        expect(again.eq(back), `seed ${seed}`).toBe(true);
        // the words themselves come back, whatever the markup did
        const squash = (t: string) => t.replace(/\s+/g, " ").trim();
        expect(squash(plainOf(back).text), `seed ${seed}`).toBe(squash(plainOf(doc).text));
      }
    });
  }
});

describe("figures (M5.4)", () => {
  it("read and write back — caption, alt text, placement — between the words", () => {
    const t = 'She opens it.\n\n![The manifest, its last line a name](assets/ab12.jpg "A folded paper in oilcloth"){.page}\n\nThe paper is dry.\n\n![Dusk](assets/cd34.png)';
    const doc = parse(t);
    expect(doc.child(1).type).toBe(N.figure);
    expect(doc.child(1).attrs).toEqual({ src: "assets/ab12.jpg", caption: "The manifest, its last line a name", alt: "A folded paper in oilcloth", place: "page" });
    expect(doc.child(3).attrs.place).toBe("inline");
    expect(round(t)).toBe(t);
  });

  it("keep brackets and quotes in their words", () => {
    const t = '![A [torn] map](assets/x.jpg "The \\"north\\" rocks"){.opener}';
    expect(parse(t).child(0).attrs).toMatchObject({ caption: "A [torn] map", alt: 'The "north" rocks', place: "opener" });
    expect(round(t)).toBe('![A [torn\\] map](assets/x.jpg "The \\"north\\" rocks"){.opener}');
    expect(round(round(t))).toBe(round(t));
  });

  it("are not words: not counted, not in the plain text anchors hold to", () => {
    const t = "One two.\n\n![Three four five](assets/x.jpg)\n\nSix.";
    expect(countWords(t)).toBe(3);
    expect(plain(t)).toBe("One two.\n\nSix.");
  });

  it("a picture inside a paragraph stays words, as it was", () => {
    const t = "Before ![x](assets/x.jpg) after.";
    expect(parse(t).child(0).type).toBe(N.paragraph);
  });
});

describe("a figure after a passage (M5.3)", () => {
  it("goes in after the paragraph the passage is in — its markup read away — else at the end", () => {
    const t = "The ship is there. *No sail set.*\n\nMara counts the gulls.\n\nTom comes along the causeway.";
    const fig = "![](assets/a.jpg)";
    expect(figureAfter(t, "No sail set. ", fig)).toBe("The ship is there. *No sail set.*\n\n![](assets/a.jpg)\n\nMara counts the gulls.\n\nTom comes along the causeway.");
    expect(figureAfter(t, "Tom comes", fig).endsWith(`causeway.\n\n${fig}`)).toBe(true);
    expect(figureAfter(t, "gone from the book", fig).endsWith(`causeway.\n\n${fig}`)).toBe(true);
  });
});
