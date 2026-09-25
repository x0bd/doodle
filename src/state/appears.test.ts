import { describe, expect, it } from "vitest";
import { appearances, namesOf } from "./appears";

const w = (id: string, seq: number, text: string, kind = "chapter", status = "draft") => ({ id, kind, title: id, seq, status, parent: null, data: { text } });

describe("where they appear", () => {
  it("knows the names the book calls them by", () => {
    expect(namesOf({ id: "c", kind: "character", title: "Tom Keel", data: { name: "Tom Keel" } })).toEqual(["Tom Keel", "Tom"]);
    expect(namesOf({ id: "o", kind: "object", title: "The manifest", data: { name: "The manifest" } })).toEqual(["The manifest", "manifest"]);
  });

  it("finds the chapters that name a thing, in reading order, with how often", () => {
    const manifest = { id: "o", kind: "object", title: "The manifest", data: { name: "The manifest" } };
    const got = appearances(manifest, [
      w("Two", 2, "Inside is the manifest, folded in three. She reads the Manifest twice."),
      w("One", 1, "“Manifest,” he says."),
      w("Three", 3, "Nothing about it here; manifesto is not it."),
      w("Gone", 4, "The manifest again.", "chapter", "rejected"),
      w("A note", 5, "the manifest", "note"),
    ]);
    expect(got).toEqual([
      { id: "One", title: "One", count: 1 },
      { id: "Two", title: "Two", count: 2 },
    ]);
  });

  it("counts an @ mention", () => {
    const lamp = { id: "o", kind: "object", title: "Lamp", data: { name: "" } };
    expect(appearances(lamp, [w("One", 1, "Then @Lamp, lit.")])[0].count).toBe(1);
  });
});

describe("who a passage names", () => {
  it("by any of their names, or with @", async () => {
    const { namedIn } = await import("./appears");
    const cast = [
      { id: "m", kind: "character", title: "Mara", data: { name: "Mara" } },
      { id: "t", kind: "character", title: "Tom Keel", data: { name: "Tom Keel" } },
      { id: "l", kind: "location", title: "The lighthouse", data: { name: "The lighthouse" } },
      { id: "o", kind: "object", title: "The manifest", data: { name: "The manifest" } },
    ];
    expect(namedIn("Tom holds out the manifest to her.", cast).map((n) => n.id)).toEqual(["t", "o"]);
    expect(namedIn("Up the stairs of @The lighthouse; Mara waits.", cast).map((n) => n.id)).toEqual(["m", "l"]);
  });
});
