/** 七選五德州比牌。category 愈大愈強；同 category 比 kickers。 */

export const RANK_CATEGORY = {
  HIGH: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR: 7,
  STRAIGHT_FLUSH: 8,
};

const CATEGORY_NAME = {
  [RANK_CATEGORY.HIGH]: "高牌",
  [RANK_CATEGORY.PAIR]: "一對",
  [RANK_CATEGORY.TWO_PAIR]: "兩對",
  [RANK_CATEGORY.TRIPS]: "三條",
  [RANK_CATEGORY.STRAIGHT]: "順子",
  [RANK_CATEGORY.FLUSH]: "同花",
  [RANK_CATEGORY.FULL_HOUSE]: "葫蘆",
  [RANK_CATEGORY.FOUR]: "四條",
  [RANK_CATEGORY.STRAIGHT_FLUSH]: "同花順",
};

export function handCategoryName(category) {
  return CATEGORY_NAME[category] ?? "未知";
}

/** A=14 for high comparisons */
export function rankValue(rank) {
  return rank === 1 ? 14 : rank;
}

/**
 * @returns {{ category: number, kickers: number[] }}
 */
export function evaluateFive(cards) {
  if (cards.length !== 5) throw new Error("evaluateFive needs 5 cards");
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const straightHigh = straightHighFrom(values);
  if (isFlush && straightHigh != null) {
    return { category: RANK_CATEGORY.STRAIGHT_FLUSH, kickers: [straightHigh] };
  }
  if (byCount[0][1] === 4) {
    return {
      category: RANK_CATEGORY.FOUR,
      kickers: [byCount[0][0], byCount[1][0]],
    };
  }
  if (byCount[0][1] === 3 && byCount[1][1] === 2) {
    return {
      category: RANK_CATEGORY.FULL_HOUSE,
      kickers: [byCount[0][0], byCount[1][0]],
    };
  }
  if (isFlush) {
    return { category: RANK_CATEGORY.FLUSH, kickers: values.slice() };
  }
  if (straightHigh != null) {
    return { category: RANK_CATEGORY.STRAIGHT, kickers: [straightHigh] };
  }
  if (byCount[0][1] === 3) {
    const kickers = [byCount[0][0], ...byCount.slice(1).map((x) => x[0])];
    return { category: RANK_CATEGORY.TRIPS, kickers };
  }
  if (byCount[0][1] === 2 && byCount[1][1] === 2) {
    const highPair = Math.max(byCount[0][0], byCount[1][0]);
    const lowPair = Math.min(byCount[0][0], byCount[1][0]);
    const kicker = byCount[2][0];
    return { category: RANK_CATEGORY.TWO_PAIR, kickers: [highPair, lowPair, kicker] };
  }
  if (byCount[0][1] === 2) {
    return {
      category: RANK_CATEGORY.PAIR,
      kickers: [byCount[0][0], ...byCount.slice(1).map((x) => x[0])],
    };
  }
  return { category: RANK_CATEGORY.HIGH, kickers: values.slice() };
}

function straightHighFrom(sortedDesc) {
  const uniq = [...new Set(sortedDesc)];
  // wheel: A,5,4,3,2
  if (
    uniq.includes(14) &&
    uniq.includes(5) &&
    uniq.includes(4) &&
    uniq.includes(3) &&
    uniq.includes(2) &&
    uniq.length === 5
  ) {
    return 5;
  }
  if (uniq.length < 5) return null;
  for (let i = 0; i <= uniq.length - 5; i++) {
    const slice = uniq.slice(i, i + 5);
    let ok = true;
    for (let j = 1; j < 5; j++) {
      if (slice[j - 1] - 1 !== slice[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return slice[0];
  }
  // also check if five distinct descending consecutive from values (with dupes already stripped)
  if (uniq.length === 5) {
    let ok = true;
    for (let j = 1; j < 5; j++) {
      if (uniq[j - 1] - 1 !== uniq[j]) ok = false;
    }
    if (ok) return uniq[0];
  }
  return null;
}

export function compareRanks(a, b) {
  if (a.category !== b.category) return a.category > b.category ? 1 : -1;
  const n = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < n; i++) {
    const av = a.kickers[i] ?? 0;
    const bv = b.kickers[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

function combinations(arr, k) {
  const out = [];
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

/**
 * Best five-card rank from 5–7 cards.
 */
export function bestOfSeven(cards) {
  if (cards.length < 5) throw new Error("need at least 5 cards");
  if (cards.length === 5) return evaluateFive(cards);
  let best = null;
  for (const five of combinations(cards, 5)) {
    const r = evaluateFive(five);
    if (!best || compareRanks(r, best) > 0) best = r;
  }
  return best;
}
