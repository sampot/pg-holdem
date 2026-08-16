import { describe, it, expect } from "vitest";
import {
  createMatch,
  startHand,
  applyAction,
  legalActions,
  advanceIfNeeded,
  finishHandCleanup,
  BLIND_LEVELS,
  HANDS_PER_LEVEL,
} from "./table.js";
import { placeForFinish, bankDeltaForPlace } from "./sng.js";

describe("sng blind levels", () => {
  it("upgrades blinds every HANDS_PER_LEVEL hands", () => {
    const m = createMatch({ seatCount: 3, seed: 1 });
    expect(m.blindLevel).toBe(0);
    for (let h = 0; h < HANDS_PER_LEVEL; h++) {
      startHand(m);
      // fold out quickly
      let g = 0;
      while (m.street !== "handOver" && g++ < 40) {
        const la = legalActions(m);
        if (la?.canFold) applyAction(m, { type: "fold" });
        else if (la) applyAction(m, { type: la.toCall > 0 ? "call" : "check" });
        advanceIfNeeded(m);
      }
      finishHandCleanup(m);
    }
    expect(m.blindLevel).toBe(1);
    expect(m.sb).toBe(BLIND_LEVELS[1][0]);
  });
});

describe("sng elimination places", () => {
  it("records places when busted; last standing place 1", () => {
    const m = createMatch({ seatCount: 3, seed: 3, startChips: 100 });
    // drain seats artificially after a hand
    m.seats[1].chips = 0;
    m.seats[2].chips = 0;
    m.seats[0].chips = 300;
    const places = placeForFinish(m);
    expect(places[0]).toBe(1);
    expect([places[1], places[2]].sort()).toEqual([2, 3]);
  });

  it("bank deltas match plan", () => {
    expect(bankDeltaForPlace(1)).toBe(2500);
    expect(bankDeltaForPlace(2)).toBe(1000);
    expect(bankDeltaForPlace(3)).toBe(500);
    expect(bankDeltaForPlace(4)).toBe(0);
  });
});
