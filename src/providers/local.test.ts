import { describe, expect, it } from "vitest";
import { makeRoom } from "./local";

const GB = 1e9;

describe("the memory guard (M4.4)", () => {
  it("leaves Ollama alone when FLUX fits beside it", async () => {
    const gone: string[] = [];
    expect(await makeRoom(48 * GB, [{ name: "glm-ocr", size: 4.1 * GB }], async (n) => void gone.push(n))).toEqual([]);
    expect(gone).toEqual([]);
  });

  it("asks the largest to step aside when both would not fit — and only as many as it takes", async () => {
    const gone: string[] = [];
    const held = [
      { name: "glm-ocr", size: 4.1 * GB },
      { name: "hemmingway", size: 23 * GB },
    ];
    expect(await makeRoom(48 * GB, held, async (n) => void gone.push(n))).toEqual(["hemmingway"]);
    expect(gone).toEqual(["hemmingway"]);
  });

  it("on a small Mac, everything steps aside", async () => {
    expect(await makeRoom(24 * GB, [{ name: "a", size: 2 * GB }, { name: "b", size: 3 * GB }], async () => {})).toEqual(["b", "a"]);
  });
});
