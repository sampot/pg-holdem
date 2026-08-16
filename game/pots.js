import { compareRanks } from "./handRank.js";

/**
 * @param {{ id: number, contrib: number, folded: boolean }[]} players
 * @returns {{ amount: number, eligible: number[] }[]}
 */
export function buildPots(players) {
  const levels = [
    ...new Set(players.filter((p) => p.contrib > 0).map((p) => p.contrib)),
  ].sort((a, b) => a - b);
  let prev = 0;
  const pots = [];
  for (const level of levels) {
    const layer = level - prev;
    const inLayer = players.filter((p) => p.contrib >= level);
    const amount = layer * inLayer.length;
    const eligible = inLayer.filter((p) => !p.folded).map((p) => p.id);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

/**
 * @param {{ amount: number, eligible: number[] }[]} pots
 * @param {Record<number, { category: number, kickers: number[] }>} ranksById
 * @returns {Record<number, number>} chips won per id
 */
export function awardPots(pots, ranksById) {
  /** @type {Record<number, number>} */
  const awards = {};
  for (const pot of pots) {
    const elig = pot.eligible.filter((id) => ranksById[id]);
    if (elig.length === 0) continue;
    let best = ranksById[elig[0]];
    let winners = [elig[0]];
    for (let i = 1; i < elig.length; i++) {
      const id = elig[i];
      const cmp = compareRanks(ranksById[id], best);
      if (cmp > 0) {
        best = ranksById[id];
        winners = [id];
      } else if (cmp === 0) {
        winners.push(id);
      }
    }
    const share = Math.floor(pot.amount / winners.length);
    let rem = pot.amount - share * winners.length;
    for (const id of winners) {
      awards[id] = (awards[id] || 0) + share;
    }
    // odd chip to earliest eligible winner in pot order
    for (const id of elig) {
      if (rem <= 0) break;
      if (winners.includes(id)) {
        awards[id] = (awards[id] || 0) + 1;
        rem -= 1;
      }
    }
  }
  return awards;
}
