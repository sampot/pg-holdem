import { seatsWithChips } from "./table.js";

export const BUY_IN = 500;
export const DEFAULT_BANK = 5000;

/** Rewards after SNG (on top of sunk buy-in). */
export function bankDeltaForPlace(place) {
  if (place === 1) return 2500;
  if (place === 2) return 1000;
  if (place === 3) return 500;
  return 0;
}

/**
 * Finalize places when match ends (or force from chip counts).
 * @returns {Record<number, number>} seatId → place
 */
export function placeForFinish(match) {
  const places = {};
  for (const s of match.seats) {
    if (s.place != null) places[s.id] = s.place;
  }
  const alive = seatsWithChips(match).sort((a, b) => b.chips - a.chips);
  if (alive.length === 1) {
    places[alive[0].id] = 1;
    alive[0].place = 1;
  } else if (alive.length > 1 && match.finished) {
    // shouldn't happen mid-design; assign by chips
    alive.forEach((s, i) => {
      places[s.id] = i + 1;
      s.place = i + 1;
    });
  }
  // fill missing by chip order among unsettled
  const missing = match.seats.filter((s) => places[s.id] == null);
  if (missing.length) {
    missing.sort((a, b) => b.chips - a.chips);
    const used = new Set(Object.values(places));
    let p = 1;
    for (const s of missing) {
      while (used.has(p)) p++;
      places[s.id] = p;
      s.place = p;
      used.add(p);
      p++;
    }
  }
  return places;
}

export function settleBank(bank, place) {
  return bank + bankDeltaForPlace(place);
}
