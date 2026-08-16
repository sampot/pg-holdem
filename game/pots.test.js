import { describe, it, expect } from "vitest";
import { buildPots, awardPots } from "./pots.js";
import { evaluateFive, RANK_CATEGORY } from "./handRank.js";

function C(suit, rank) {
  return { suit, rank };
}

describe("buildPots", () => {
  it("single pot when equal contributions", () => {
    const pots = buildPots([
      { id: 0, contrib: 100, folded: false },
      { id: 1, contrib: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 200, eligible: [0, 1] }]);
  });

  it("builds side pots for unequal all-ins", () => {
    // A 50 all-in, B 100, C 100
    const pots = buildPots([
      { id: 0, contrib: 50, folded: false },
      { id: 1, contrib: 100, folded: false },
      { id: 2, contrib: 100, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 150, eligible: [0, 1, 2] },
      { amount: 100, eligible: [1, 2] },
    ]);
  });

  it("folded player still funds pot but cannot win", () => {
    const pots = buildPots([
      { id: 0, contrib: 80, folded: true },
      { id: 1, contrib: 80, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 160, eligible: [1] }]);
  });
});

describe("awardPots", () => {
  it("awards main pot to best hand; side pot to remaining", () => {
    const ranks = {
      0: evaluateFive([C(0, 2), C(1, 2), C(2, 2), C(3, 2), C(0, 3)]), // quads
      1: evaluateFive([C(0, 13), C(1, 13), C(2, 13), C(0, 5), C(1, 5)]), // full
      2: evaluateFive([C(0, 9), C(1, 9), C(2, 4), C(3, 4), C(0, 7)]), // two pair
    };
    expect(ranks[0].category).toBe(RANK_CATEGORY.FOUR);
    const awards = awardPots(
      [
        { amount: 150, eligible: [0, 1, 2] },
        { amount: 100, eligible: [1, 2] },
      ],
      ranks,
    );
    expect(awards[0]).toBe(150);
    expect((awards[1] || 0) + (awards[2] || 0)).toBe(100);
    expect(awards[1]).toBe(100);
    expect(awards[2] || 0).toBe(0);
  });

  it("splits pot on tie", () => {
    const ranks = {
      0: evaluateFive([C(0, 10), C(1, 10), C(2, 3), C(3, 5), C(0, 7)]),
      1: evaluateFive([C(2, 10), C(3, 10), C(0, 3), C(1, 5), C(2, 7)]),
    };
    const awards = awardPots([{ amount: 101, eligible: [0, 1] }], ranks);
    expect(awards[0] + awards[1]).toBe(101);
    expect(Math.abs(awards[0] - awards[1])).toBeLessThanOrEqual(1);
  });
});
