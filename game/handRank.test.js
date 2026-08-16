import { describe, it, expect } from "vitest";
import {
  evaluateFive,
  bestOfSeven,
  compareRanks,
  handCategoryName,
  RANK_CATEGORY,
} from "./handRank.js";

function C(suit, rank) {
  return { suit, rank };
}

describe("evaluateFive", () => {
  it("detects royal flush as straight flush top", () => {
    const r = evaluateFive([
      C(0, 10),
      C(0, 11),
      C(0, 12),
      C(0, 13),
      C(0, 1),
    ]);
    expect(r.category).toBe(RANK_CATEGORY.STRAIGHT_FLUSH);
    expect(r.kickers[0]).toBe(14);
  });

  it("detects wheel straight A-2-3-4-5", () => {
    const r = evaluateFive([C(0, 1), C(1, 2), C(2, 3), C(3, 4), C(0, 5)]);
    expect(r.category).toBe(RANK_CATEGORY.STRAIGHT);
    expect(r.kickers[0]).toBe(5);
  });

  it("detects four of a kind with kicker", () => {
    const r = evaluateFive([C(0, 9), C(1, 9), C(2, 9), C(3, 9), C(0, 2)]);
    expect(r.category).toBe(RANK_CATEGORY.FOUR);
    expect(r.kickers).toEqual([9, 2]);
  });

  it("detects full house", () => {
    const r = evaluateFive([C(0, 8), C(1, 8), C(2, 8), C(0, 3), C(1, 3)]);
    expect(r.category).toBe(RANK_CATEGORY.FULL_HOUSE);
    expect(r.kickers).toEqual([8, 3]);
  });

  it("detects flush and orders kickers", () => {
    const r = evaluateFive([C(2, 2), C(2, 5), C(2, 9), C(2, 11), C(2, 13)]);
    expect(r.category).toBe(RANK_CATEGORY.FLUSH);
    expect(r.kickers).toEqual([13, 11, 9, 5, 2]);
  });

  it("detects two pair", () => {
    const r = evaluateFive([C(0, 7), C(1, 7), C(0, 4), C(1, 4), C(2, 10)]);
    expect(r.category).toBe(RANK_CATEGORY.TWO_PAIR);
    expect(r.kickers).toEqual([7, 4, 10]);
  });

  it("detects high card", () => {
    const r = evaluateFive([C(0, 2), C(1, 5), C(2, 7), C(3, 9), C(0, 12)]);
    expect(r.category).toBe(RANK_CATEGORY.HIGH);
    expect(r.kickers[0]).toBe(12);
  });
});

describe("bestOfSeven + compare", () => {
  it("picks flush over pair from seven cards", () => {
    const hole = [C(0, 2), C(0, 5)];
    const board = [C(0, 9), C(0, 11), C(0, 13), C(1, 2), C(2, 2)];
    const best = bestOfSeven([...hole, ...board]);
    expect(best.category).toBe(RANK_CATEGORY.FLUSH);
  });

  it("ties identical hands", () => {
    const a = evaluateFive([C(0, 10), C(1, 10), C(2, 3), C(3, 5), C(0, 7)]);
    const b = evaluateFive([C(2, 10), C(3, 10), C(0, 3), C(1, 5), C(2, 7)]);
    expect(compareRanks(a, b)).toBe(0);
  });

  it("higher pair wins", () => {
    const a = evaluateFive([C(0, 12), C(1, 12), C(2, 3), C(3, 5), C(0, 7)]);
    const b = evaluateFive([C(0, 11), C(1, 11), C(2, 3), C(3, 5), C(0, 7)]);
    expect(compareRanks(a, b)).toBe(1);
  });
});

describe("handCategoryName", () => {
  it("returns Chinese names", () => {
    expect(handCategoryName(RANK_CATEGORY.STRAIGHT_FLUSH)).toBe("同花順");
    expect(handCategoryName(RANK_CATEGORY.TWO_PAIR)).toBe("兩對");
  });
});
