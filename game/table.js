import { makeDeck, mulberry32 } from "./deck.js";
import { bestOfSeven } from "./handRank.js";
import { buildPots, awardPots } from "./pots.js";

export const BLIND_LEVELS = [
  [10, 20],
  [15, 30],
  [25, 50],
  [50, 100],
  [75, 150],
  [100, 200],
  [150, 300],
  [250, 500],
  [500, 1000],
  [1000, 2000],
];

export const HANDS_PER_LEVEL = 8;
export const DEFAULT_START_CHIPS = 1500;

const AI_NAMES = ["阿強", "小美", "老王", "阿杰", "阿珍"];

/**
 * @param {{ seatCount?: number, startChips?: number, seed?: number, humanIndex?: number, mode?: 'sng'|'hu' }} opts
 */
export function createMatch({
  seatCount = 6,
  startChips = DEFAULT_START_CHIPS,
  seed = Date.now() % 1e9,
  humanIndex = 0,
  mode = "sng",
} = {}) {
  const n = mode === "hu" ? 2 : seatCount;
  const seats = [];
  for (let i = 0; i < n; i++) {
    seats.push({
      id: i,
      name: i === humanIndex ? "你" : AI_NAMES[(i - 1 + AI_NAMES.length) % AI_NAMES.length],
      isHuman: i === humanIndex,
      chips: startChips,
      hole: [],
      folded: false,
      allIn: false,
      inHand: false,
      streetBet: 0,
      contrib: 0,
      acted: false,
      place: null,
    });
  }
  return {
    mode,
    seed,
    rand: mulberry32(seed),
    seats,
    humanIndex,
    button: n - 1,
    blindLevel: 0,
    sb: BLIND_LEVELS[0][0],
    bb: BLIND_LEVELS[0][1],
    handsPlayed: 0,
    handIndex: 0,
    street: "idle",
    board: [],
    deck: [],
    currentBet: 0,
    minRaise: BLIND_LEVELS[0][1],
    toAct: null,
    lastAggressor: null,
    lastAwards: null,
    lastShowdown: false,
    lastRanks: null,
    status: "",
    finished: false,
    winnerId: null,
  };
}

export function livingSeats(match) {
  return match.seats.filter((s) => s.chips > 0 || (s.inHand && s.contrib > 0));
}

export function seatsWithChips(match) {
  return match.seats.filter((s) => s.chips > 0);
}

function nextOccupied(match, from, pred) {
  const n = match.seats.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (pred(match.seats[i], i)) return i;
  }
  return null;
}

export function totalPot(match) {
  return match.seats.reduce((a, s) => a + s.contrib, 0);
}

function syncBlinds(match) {
  const lvl = Math.min(match.blindLevel, BLIND_LEVELS.length - 1);
  match.sb = BLIND_LEVELS[lvl][0];
  match.bb = BLIND_LEVELS[lvl][1];
}

export function startHand(match) {
  if (match.finished) return { ok: false, error: "match over" };
  const alive = seatsWithChips(match);
  if (alive.length < 2) {
    match.finished = true;
    match.winnerId = alive[0]?.id ?? null;
    match.street = "matchOver";
    return { ok: false, error: "not enough players" };
  }

  syncBlinds(match);
  match.rand = mulberry32(match.seed + match.handIndex * 9973);
  match.deck = makeDeck(match.rand);
  match.board = [];
  match.currentBet = 0;
  match.minRaise = match.bb;
  match.lastAggressor = null;
  match.lastAwards = null;
  match.lastShowdown = false;
  match.lastRanks = null;
  match.street = "preflop";

  for (const s of match.seats) {
    s.hole = [];
    s.folded = false;
    s.allIn = false;
    s.streetBet = 0;
    s.contrib = 0;
    s.acted = false;
    s.inHand = s.chips > 0;
  }

  // move button to next with chips
  match.button = nextOccupied(match, match.button, (s) => s.chips > 0);

  const isHu = alive.length === 2;
  let sbIdx;
  let bbIdx;
  if (isHu) {
    sbIdx = match.button;
    bbIdx = nextOccupied(match, match.button, (s) => s.inHand);
  } else {
    sbIdx = nextOccupied(match, match.button, (s) => s.inHand);
    bbIdx = nextOccupied(match, sbIdx, (s) => s.inHand);
  }

  postBlind(match, sbIdx, match.sb);
  postBlind(match, bbIdx, match.bb);
  match.currentBet = Math.max(
    match.seats[sbIdx].streetBet,
    match.seats[bbIdx].streetBet,
  );

  // deal 2 cards each, starting left of button
  let dealFrom = match.button;
  for (let c = 0; c < 2; c++) {
    let idx = dealFrom;
    for (let p = 0; p < match.seats.length; p++) {
      idx = nextOccupied(match, idx, (s) => s.inHand);
      match.seats[idx].hole.push(match.deck.pop());
    }
  }

  // first to act
  if (isHu) {
    match.toAct = sbIdx; // button/SB acts first preflop
  } else {
    match.toAct = nextOccupied(match, bbIdx, (s) => s.inHand && !s.allIn);
  }

  // blinds already "acted" only if they fully matched? Standard: blinds can still act.
  for (const s of match.seats) {
    if (s.inHand) s.acted = false;
  }

  match.status = `盲注 ${match.sb}/${match.bb}`;
  return { ok: true };
}

function postBlind(match, idx, amount) {
  const s = match.seats[idx];
  const pay = Math.min(amount, s.chips);
  s.chips -= pay;
  s.streetBet += pay;
  s.contrib += pay;
  if (s.chips === 0) s.allIn = true;
}

function putChips(seat, amount) {
  const pay = Math.min(amount, seat.chips);
  seat.chips -= pay;
  seat.streetBet += pay;
  seat.contrib += pay;
  if (seat.chips === 0) seat.allIn = true;
  return pay;
}

export function legalActions(match) {
  if (match.toAct == null || match.street === "handOver" || match.street === "idle") {
    return null;
  }
  const seat = match.seats[match.toAct];
  if (!seat || !seat.inHand || seat.folded || seat.allIn) return null;
  const toCall = Math.max(0, match.currentBet - seat.streetBet);
  const canCheck = toCall === 0;
  const canFold = true;
  const maxRaiseTo = seat.streetBet + seat.chips;
  const minRaiseTo = match.currentBet + match.minRaise;
  const canRaise = seat.chips > toCall && maxRaiseTo > match.currentBet;
  return {
    seatId: seat.id,
    toCall,
    canCheck,
    canFold,
    canRaise,
    minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
    maxRaiseTo,
    pot: totalPot(match),
    stack: seat.chips,
    streetBet: seat.streetBet,
  };
}

/**
 * @param {{ type: 'fold'|'check'|'call'|'raise'|'allin', amount?: number }} action
 * amount for raise = total street bet to raise TO (not increment)
 */
export function applyAction(match, action) {
  const la = legalActions(match);
  if (!la) return { ok: false, error: "no action" };
  const seat = match.seats[match.toAct];

  if (action.type === "fold") {
    if (!la.canFold) return { ok: false, error: "cannot fold" };
    seat.folded = true;
    seat.acted = true;
    match.status = `${seat.name} 蓋牌`;
    afterAction(match);
    return { ok: true };
  }

  if (action.type === "check") {
    if (!la.canCheck) return { ok: false, error: "cannot check" };
    seat.acted = true;
    match.status = `${seat.name} 過牌`;
    afterAction(match);
    return { ok: true };
  }

  if (action.type === "call") {
    if (la.toCall <= 0) return { ok: false, error: "nothing to call" };
    putChips(seat, la.toCall);
    seat.acted = true;
    match.status = seat.allIn ? `${seat.name} 跟注全下` : `${seat.name} 跟注 ${la.toCall}`;
    afterAction(match);
    return { ok: true };
  }

  if (action.type === "allin") {
    const raiseTo = seat.streetBet + seat.chips;
    return applyRaiseTo(match, seat, raiseTo, true);
  }

  if (action.type === "raise") {
    const raiseTo = action.amount;
    if (raiseTo == null) return { ok: false, error: "need amount" };
    return applyRaiseTo(match, seat, raiseTo, false);
  }

  return { ok: false, error: "unknown action" };
}

function applyRaiseTo(match, seat, raiseTo, forceAllIn) {
  const la = legalActions(match);
  const maxRaiseTo = seat.streetBet + seat.chips;
  let target = Math.min(raiseTo, maxRaiseTo);
  if (target <= seat.streetBet) return { ok: false, error: "invalid raise" };

  const isAllIn = forceAllIn || target >= maxRaiseTo || seat.chips === target - seat.streetBet;
  // short all-in below min raise is allowed but doesn't reopen full min
  const opening = match.currentBet === 0 && seat.streetBet === 0;
  const minTo = la.minRaiseTo;

  if (!isAllIn && target < minTo && target < maxRaiseTo) {
    return { ok: false, error: "raise too small" };
  }
  if (!isAllIn && target <= match.currentBet && !opening) {
    // must be raise above current unless calling — handled elsewhere
    if (target < match.currentBet) return { ok: false, error: "below current" };
  }

  const need = target - seat.streetBet;
  putChips(seat, need);
  target = seat.streetBet;

  const prevBet = match.currentBet;
  if (target > prevBet) {
    const raiseSize = target - prevBet;
    if (raiseSize >= match.minRaise) {
      match.minRaise = raiseSize;
      // reopen action
      for (const s of match.seats) {
        if (s.inHand && !s.folded && !s.allIn && s.id !== seat.id) s.acted = false;
      }
    } else if (!seat.allIn) {
      // shouldn't happen
    } else {
      // short all-in: players who already acted don't need to re-act unless they haven't matched
      for (const s of match.seats) {
        if (s.inHand && !s.folded && !s.allIn && s.streetBet < target) s.acted = false;
      }
    }
    match.currentBet = target;
    match.lastAggressor = seat.id;
  } else {
    // all-in call
    for (const s of match.seats) {
      if (s.inHand && !s.folded && !s.allIn && s.streetBet < match.currentBet) {
        /* keep */
      }
    }
  }

  seat.acted = true;
  match.status = seat.allIn
    ? `${seat.name} 全下 ${target}`
    : `${seat.name} 加注至 ${target}`;
  afterAction(match);
  return { ok: true };
}

function afterAction(match) {
  // if only one not folded → end
  const contenders = match.seats.filter((s) => s.inHand && !s.folded);
  if (contenders.length === 1) {
    settleUncontested(match, contenders[0]);
    return;
  }

  const next = nextToAct(match);
  if (next != null) {
    match.toAct = next;
    return;
  }

  // betting round complete
  match.toAct = null;
  advanceStreet(match);
}

function nextToAct(match) {
  const n = match.seats.length;
  const start = match.toAct;
  for (let step = 1; step <= n; step++) {
    const i = (start + step) % n;
    const s = match.seats[i];
    if (!s.inHand || s.folded || s.allIn) continue;
    if (!s.acted || s.streetBet < match.currentBet) return i;
  }
  return null;
}

function settleUncontested(match, winner) {
  const pot = totalPot(match);
  for (const s of match.seats) {
    s.contrib = 0;
    s.streetBet = 0;
  }
  winner.chips += pot;
  match.lastAwards = { [winner.id]: pot };
  match.lastShowdown = false;
  match.street = "handOver";
  match.toAct = null;
  match.status = `${winner.name} 未攤牌獲勝（+${pot}）`;
}

function resetStreetBets(match) {
  for (const s of match.seats) {
    s.streetBet = 0;
    s.acted = false;
  }
  match.currentBet = 0;
  match.minRaise = match.bb;
  match.lastAggressor = null;
}

function firstToActPostflop(match) {
  // left of button (SB position), skip folded/all-in without chips to act
  return nextOccupied(
    match,
    match.button,
    (s) => s.inHand && !s.folded && !s.allIn,
  );
}

function playersCanBet(match) {
  return match.seats.filter((s) => s.inHand && !s.folded && !s.allIn).length;
}

function advanceStreet(match) {
  // if ≤1 player can still bet and no one to match, run out board or showdown
  const contenders = match.seats.filter((s) => s.inHand && !s.folded);
  if (contenders.length === 1) {
    settleUncontested(match, contenders[0]);
    return;
  }

  const needRunout =
    playersCanBet(match) <= 1 &&
    contenders.some((s) => s.allIn || s.streetBet >= 0);

  if (match.street === "preflop") {
    dealBoard(match, 3);
    match.street = "flop";
  } else if (match.street === "flop") {
    dealBoard(match, 1);
    match.street = "turn";
  } else if (match.street === "turn") {
    dealBoard(match, 1);
    match.street = "river";
  } else if (match.street === "river") {
    showdown(match);
    return;
  }

  resetStreetBets(match);

  if (needRunout || playersCanBet(match) <= 1) {
    // keep dealing until river then showdown
    while (match.street !== "river" && match.street !== "handOver") {
      if (match.street === "flop") {
        dealBoard(match, 1);
        match.street = "turn";
      } else if (match.street === "turn") {
        dealBoard(match, 1);
        match.street = "river";
      } else break;
    }
    if (match.board.length < 5) {
      // still on flop with needRunout — deal rest
      while (match.board.length < 5) dealBoard(match, 1);
      match.street = "river";
    }
    showdown(match);
    return;
  }

  match.toAct = firstToActPostflop(match);
  if (match.toAct == null) {
    showdown(match);
  }
}

function dealBoard(match, n) {
  for (let i = 0; i < n; i++) {
    match.board.push(match.deck.pop());
  }
}

function showdown(match) {
  match.street = "showdown";
  const contenders = match.seats.filter((s) => s.inHand && !s.folded);
  /** @type {Record<number, ReturnType<typeof bestOfSeven>>} */
  const ranks = {};
  for (const s of contenders) {
    ranks[s.id] = bestOfSeven([...s.hole, ...match.board]);
  }
  match.lastRanks = ranks;
  const pots = buildPots(
    match.seats.map((s) => ({
      id: s.id,
      contrib: s.contrib,
      folded: s.folded || !s.inHand,
    })),
  );
  const awards = awardPots(pots, ranks);
  for (const s of match.seats) {
    const won = awards[s.id] || 0;
    s.chips += won;
    s.contrib = 0;
    s.streetBet = 0;
  }
  match.lastAwards = awards;
  match.lastShowdown = true;
  match.street = "handOver";
  match.toAct = null;
  const names = Object.keys(awards)
    .filter((id) => awards[id] > 0)
    .map((id) => match.seats[Number(id)].name)
    .join("、");
  match.status = `攤牌：${names || "分配完畢"}`;
}

/** Call after each action from UI loop; no-op if mid-round. */
export function advanceIfNeeded(match) {
  // streets advance inside afterAction; this handles idle toAct null mid-hand edge cases
  if (match.street === "handOver" || match.street === "matchOver") return;
  if (match.toAct != null) return;
  if (["flop", "turn", "river", "preflop"].includes(match.street)) {
    // betting round ended but street not advanced? shouldn't happen
  }
}

/**
 * After handOver: eliminate, bump blinds, rotate for next.
 */
export function finishHandCleanup(match) {
  if (match.street !== "handOver") return { ok: false };

  // assign places to newly busted
  const busted = match.seats.filter((s) => s.chips <= 0 && s.place == null);
  const stillAlive = match.seats.filter((s) => s.chips > 0).length;
  // places: when busted, place = stillAlive + bustedRank
  // If multiple bust same hand, higher contrib / chip order: higher place number = worse
  busted.sort((a, b) => a.chips - b.chips);
  let place = stillAlive + busted.length;
  for (const s of busted) {
    s.place = place;
    place -= 1;
  }

  match.handsPlayed += 1;
  match.handIndex += 1;
  if (match.handsPlayed % HANDS_PER_LEVEL === 0) {
    match.blindLevel = Math.min(match.blindLevel + 1, BLIND_LEVELS.length - 1);
    syncBlinds(match);
  }

  const alive = seatsWithChips(match);
  if (alive.length <= 1) {
    match.finished = true;
    match.winnerId = alive[0]?.id ?? null;
    if (alive[0]) alive[0].place = 1;
    // remaining without place (shouldn't)
    for (const s of match.seats) {
      if (s.place == null) s.place = stillAlive > 0 ? 2 : 1;
    }
    match.street = "matchOver";
    match.status = alive[0] ? `${alive[0].name} 獲得冠軍！` : "比賽結束";
    return { ok: true, matchOver: true };
  }

  match.street = "idle";
  return { ok: true, matchOver: false };
}
