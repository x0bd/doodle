import { describe, expect, it } from "vitest";
import { brought, dayKey, noted, readingTime, streak, wordsOn, type Stats } from "./stats";

const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe("goals and stats", () => {
  it("today is the net change since the day's first look, never below nothing", () => {
    let s: Stats = { goal: 500, days: {} };
    s = noted(s, 1000, "2026-09-24"); // first look: the base
    s = noted(s, 1250, "2026-09-24");
    expect(wordsOn(s, "2026-09-24")).toBe(250);
    s = noted(s, 900, "2026-09-24"); // a chapter cut
    expect(wordsOn(s, "2026-09-24")).toBe(0);
  });

  it("a new day starts from where the book stands, at local midnight", () => {
    let s: Stats = { goal: 0, days: {} };
    s = noted(s, 1000, dayKey(on(2026, 9, 23)));
    s = noted(s, 1400, dayKey(on(2026, 9, 23)));
    s = noted(s, 1400, dayKey(on(2026, 9, 24)));
    expect(wordsOn(s, "2026-09-23")).toBe(400);
    expect(wordsOn(s, "2026-09-24")).toBe(0);
    expect(dayKey(new Date(2026, 8, 24, 0, 0, 1))).toBe("2026-09-24");
    expect(dayKey(new Date(2026, 8, 23, 23, 59, 59))).toBe("2026-09-23");
  });

  it("a streak counts the days in a row the goal was met, from today or yesterday", () => {
    const d = (base: number, end: number) => ({ base, end });
    const s: Stats = { goal: 300, days: { "2026-09-20": d(0, 400), "2026-09-21": d(400, 800), "2026-09-22": d(800, 1200), "2026-09-23": d(1200, 1300) } };
    expect(streak(s, on(2026, 9, 23))).toBe(3); // today (the 23rd) still under way: counted from the 22nd
    expect(streak(s, on(2026, 9, 24))).toBe(0); // the 23rd ended short of the goal: broken
    // today not yet met: the streak so far still counts
    expect(streak({ ...s, days: { ...s.days, "2026-09-23": d(1200, 1600), "2026-09-24": d(1600, 1650) } }, on(2026, 9, 24))).toBe(4);
    // no goal: any words make a day
    expect(streak({ goal: 0, days: { "2026-09-24": d(0, 5) } }, on(2026, 9, 24))).toBe(1);
  });

  it("reading time at 230 words a minute", () => {
    expect(readingTime(100)).toBe("1 min");
    expect(readingTime(4600)).toBe("20 min");
    expect(readingTime(134000)).toBe("9 h 43 min");
  });
});

describe("words brought in", () => {
  it("an import raises the day's base, so it is not today's writing", () => {
    let s = noted({ goal: 0, days: {} }, 1000, "2026-09-24");
    s = noted(s, 1200, "2026-09-24"); // 200 written
    s = brought(s, 13500, "2026-09-24");
    expect(wordsOn(s, "2026-09-24")).toBe(200);
    s = noted(s, 14700 + 50, "2026-09-24"); // and 50 more written after
    expect(wordsOn(s, "2026-09-24")).toBe(250);
  });
});
