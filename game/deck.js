/** 標準 52 張；rank 1=A … 13=K；suit 0=♠ 1=♥ 2=♦ 3=♣ */

export const SUITS = ["spades", "hearts", "diamonds", "clubs"];
export const SUIT_CHAR = ["♠", "♥", "♦", "♣"];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function cardLabel(card) {
  const r =
    card.rank === 1
      ? "A"
      : card.rank === 11
        ? "J"
        : card.rank === 12
          ? "Q"
          : card.rank === 13
            ? "K"
            : String(card.rank).padStart(2, "0");
  return `${SUIT_CHAR[card.suit]}${r === "10" ? "10" : r.replace(/^0/, "")}`;
}

/** Kenney filename helper: card_spades_A.png / card_hearts_10.png */
export function cardAsset(card) {
  const rank =
    card.rank === 1
      ? "A"
      : card.rank === 11
        ? "J"
        : card.rank === 12
          ? "Q"
          : card.rank === 13
            ? "K"
            : String(card.rank).padStart(2, "0");
  return `assets/cards/card_${SUITS[card.suit]}_${rank}.png`;
}

export function makeFreshDeck() {
  const cards = [];
  for (let suit = 0; suit < 4; suit++) {
    for (const rank of RANKS) {
      cards.push({ suit, rank });
    }
  }
  return cards;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeDeck(rand = Math.random) {
  return shuffle(makeFreshDeck(), rand);
}

export function makeSeededDeck(seed) {
  return makeDeck(mulberry32(seed));
}
