/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { chaptersFrom } from "./importer";

/** Each plain reader's fixture against its expected chapters
 *  (`fixtures/import/<file>.json`; set UPDATE=1 to write them afresh — then read them). */
const cases: [string, string][] = [
  ["harbour.md", "md"],
  ["letters.txt", "txt"],
  ["pilot.fountain", "fountain"],
];

describe("the readers' fixtures", () => {
  for (const [file, kind] of cases)
    it(file, () => {
      const src = readFileSync(`fixtures/import/${file}`, "utf8");
      const got = chaptersFrom(kind, src, file.replace(/\.[^.]+$/, ""));
      const at = `fixtures/import/${file}.json`;
      if (process.env.UPDATE || !existsSync(at)) writeFileSync(at, `${JSON.stringify(got, null, 2)}\n`);
      expect(got).toEqual(JSON.parse(readFileSync(at, "utf8")));
    });
});
