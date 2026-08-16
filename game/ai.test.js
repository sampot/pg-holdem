import { describe, it, expect } from "vitest";
import {
  createMatch,
  startHand,
  legalActions,
  applyAction,
  advanceIfNeeded,
  finishHandCleanup,
} from "./table.js";
import { chooseAction } from "./ai.js";

describe("ai chooseAction", () => {
  it("returns a legal action type", () => {
    const m = createMatch({ seatCount: 6, seed: 9 });
    startHand(m);
    for (let i = 0; i < 12; i++) {
      const la = legalActions(m);
      if (!la) break;
      const seat = m.seats[m.toAct];
      if (seat.isHuman) {
        applyAction(m, { type: la.toCall > 0 ? "call" : "check" });
      } else {
        const act = chooseAction(m, seat, { rand: () => 0.5 });
        expect(["fold", "check", "call", "raise", "allin"]).toContain(act.type);
        const r = applyAction(m, act);
        expect(r.ok).toBe(true);
      }
      advanceIfNeeded(m);
      if (m.street === "handOver") {
        finishHandCleanup(m);
        if (!m.finished) startHand(m);
        else break;
      }
    }
  });
});
