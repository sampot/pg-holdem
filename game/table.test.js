import { describe, it, expect } from "vitest";
import {
  createMatch,
  startHand,
  applyAction,
  legalActions,
  advanceIfNeeded,
  totalPot,
  BLIND_LEVELS,
} from "./table.js";
import { mulberry32 } from "./deck.js";

describe("table blinds & deal", () => {
  it("posts SB/BB and deals two hole cards", () => {
    const m = createMatch({ seatCount: 6, seed: 42 });
    startHand(m);
    expect(m.street).toBe("preflop");
    expect(m.sb).toBe(BLIND_LEVELS[0][0]);
    expect(m.bb).toBe(BLIND_LEVELS[0][1]);
    const withCards = m.seats.filter((s) => s.chips > 0 || s.contrib > 0);
    for (const s of m.seats) {
      if (s.inHand) expect(s.hole.length).toBe(2);
    }
    expect(totalPot(m)).toBe(m.sb + m.bb);
    expect(withCards.length).toBe(6);
  });
});

describe("betting actions", () => {
  it("allows fold call raise; illegal raise rejected", () => {
    const m = createMatch({ seatCount: 3, seed: 7 });
    startHand(m);
    const acts = legalActions(m);
    expect(acts.canFold).toBe(true);
    expect(acts.toCall).toBeGreaterThan(0);

    const actor = m.toAct;
    applyAction(m, { type: "fold" });
    expect(m.seats[actor].folded).toBe(true);

    // next player calls
    applyAction(m, { type: "call" });
    const before = m.currentBet;
    const r = applyAction(m, { type: "raise", amount: before + m.minRaise });
    expect(r.ok).toBe(true);
    expect(m.currentBet).toBeGreaterThan(before);

    const bad = applyAction(m, { type: "raise", amount: 1 });
    expect(bad.ok).toBe(false);
  });

  it("everyone folds to one player → they win pot without showdown", () => {
    const m = createMatch({ seatCount: 3, seed: 99 });
    startHand(m);
    const winnerChipsBefore = {};
    for (const s of m.seats) winnerChipsBefore[s.id] = s.chips + s.contrib;

    // fold until one remains
    let guard = 0;
    while (m.street !== "handOver" && guard++ < 20) {
      const active = m.seats.filter((s) => s.inHand && !s.folded);
      if (active.length === 1) break;
      const la = legalActions(m);
      if (la.canFold) applyAction(m, { type: "fold" });
      else applyAction(m, { type: "check" });
      advanceIfNeeded(m);
    }
    advanceIfNeeded(m);
    expect(m.street).toBe("handOver");
    const winners = m.lastAwards ? Object.keys(m.lastAwards).map(Number) : [];
    expect(winners.length).toBe(1);
  });
});

describe("full hand to showdown", () => {
  it("check down to river and showdown with fixed seed", () => {
    // Use 2 seats HU, both check/call to showdown
    const m = createMatch({ seatCount: 2, seed: 123, startChips: 1500 });
    startHand(m);
    let guard = 0;
    while (m.street !== "handOver" && guard++ < 80) {
      const la = legalActions(m);
      if (!la) break;
      if (la.toCall > 0) applyAction(m, { type: "call" });
      else applyAction(m, { type: "check" });
      advanceIfNeeded(m);
    }
    expect(m.street).toBe("handOver");
    expect(m.board.length).toBe(5);
    expect(m.lastShowdown).toBe(true);
    const sumChips = m.seats.reduce((a, s) => a + s.chips, 0);
    expect(sumChips).toBe(3000);
  });
});

describe("side pot via all-in", () => {
  it("short all-in creates side pot awards summing to total", () => {
    const m = createMatch({ seatCount: 3, seed: 55, startChips: 1500 });
    // manually set stacks before hand
    m.seats[0].chips = 50;
    m.seats[1].chips = 500;
    m.seats[2].chips = 500;
    startHand(m);
    // Force short stack all-in somehow by raising all-in when toAct is seat 0
    let guard = 0;
    while (m.street === "preflop" && guard++ < 30) {
      const seat = m.seats[m.toAct];
      if (seat.chips + seat.streetBet <= m.currentBet || seat.chips < 100) {
        applyAction(m, { type: "allin" });
      } else if (legalActions(m).toCall > 0) {
        applyAction(m, { type: "call" });
      } else {
        applyAction(m, { type: "check" });
      }
      advanceIfNeeded(m);
    }
    while (m.street !== "handOver" && guard++ < 100) {
      const la = legalActions(m);
      if (!la) {
        advanceIfNeeded(m);
        continue;
      }
      if (la.toCall > 0) applyAction(m, { type: "call" });
      else applyAction(m, { type: "check" });
      advanceIfNeeded(m);
    }
    const sum = m.seats.reduce((a, s) => a + s.chips, 0);
    expect(sum).toBe(1050);
  });
});

describe("seeded deck deterministic", () => {
  it("same seed same first hole cards", () => {
    const a = createMatch({ seatCount: 2, seed: 777 });
    const b = createMatch({ seatCount: 2, seed: 777 });
    startHand(a);
    startHand(b);
    expect(a.seats[0].hole).toEqual(b.seats[0].hole);
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });
});
