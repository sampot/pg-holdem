import { bestOfSeven, rankValue } from "./handRank.js";
import { legalActions, totalPot } from "./table.js";

const PROFILES = {
  阿強: { tight: 0.7, agr: 0.55 },
  小美: { tight: 0.45, agr: 0.4 },
  老王: { tight: 0.6, agr: 0.7 },
  阿杰: { tight: 0.35, agr: 0.65 },
  阿珍: { tight: 0.55, agr: 0.35 },
};

function profileFor(seat) {
  return PROFILES[seat.name] || { tight: 0.5, agr: 0.5 };
}

/** crude preflop strength 0–1 */
function preflopStrength(hole) {
  if (!hole || hole.length < 2) return 0;
  const [a, b] = hole;
  const va = rankValue(a.rank);
  const vb = rankValue(b.rank);
  const high = Math.max(va, vb);
  const low = Math.min(va, vb);
  const paired = va === vb;
  const suited = a.suit === b.suit;
  let s = high / 14 * 0.45 + low / 14 * 0.15;
  if (paired) s += 0.35;
  if (suited) s += 0.08;
  if (high - low <= 2 && !paired) s += 0.06;
  return Math.min(1, s);
}

function postflopStrength(hole, board) {
  if (board.length < 3) return preflopStrength(hole);
  const r = bestOfSeven([...hole, ...board]);
  return (r.category + (r.kickers[0] || 0) / 14) / 9;
}

/**
 * @returns {{ type: string, amount?: number }}
 */
export function chooseAction(match, seat, { rand = Math.random } = {}) {
  const la = legalActions(match);
  if (!la || la.seatId !== seat.id) return { type: "check" };

  const prof = profileFor(seat);
  const strength =
    match.street === "preflop"
      ? preflopStrength(seat.hole)
      : postflopStrength(seat.hole, match.board);

  const pot = totalPot(match) || 1;
  const potOdds = la.toCall / (pot + la.toCall);
  const threshold = prof.tight * 0.55 + (1 - strength) * 0.35;

  if (la.toCall > 0) {
    if (strength < threshold - 0.15 && rand() < 0.7) {
      return { type: "fold" };
    }
    if (strength > 0.72 && rand() < prof.agr) {
      if (la.canRaise) {
        const half = Math.min(
          la.maxRaiseTo,
          Math.max(la.minRaiseTo, match.currentBet + Math.floor(pot / 2)),
        );
        return { type: "raise", amount: half };
      }
      return { type: "allin" };
    }
    if (strength + 0.05 >= potOdds || strength > 0.4) {
      return { type: "call" };
    }
    return rand() < 0.35 ? { type: "call" } : { type: "fold" };
  }

  // can check
  if (strength > 0.65 && la.canRaise && rand() < prof.agr) {
    const betTo = Math.min(
      la.maxRaiseTo,
      Math.max(la.minRaiseTo, Math.floor(pot / 2) || match.bb),
    );
    return { type: "raise", amount: betTo };
  }
  if (strength > 0.85 && la.canRaise && rand() < 0.25) {
    return { type: "allin" };
  }
  return { type: "check" };
}
