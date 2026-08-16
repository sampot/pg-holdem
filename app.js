import { HoldemAudio } from "./audio.js";
import { cardAsset } from "./game/deck.js";
import { handCategoryName } from "./game/handRank.js";
import { chooseAction } from "./game/ai.js";
import {
  createMatch,
  startHand,
  applyAction,
  legalActions,
  advanceIfNeeded,
  finishHandCleanup,
  totalPot,
} from "./game/table.js";
import {
  BUY_IN,
  DEFAULT_BANK,
  bankDeltaForPlace,
  placeForFinish,
} from "./game/sng.js";
import {
  loadBank,
  saveBank,
  loadRecords,
  saveRecords,
  loadSettings,
  saveSettings,
} from "./game/persist.js";

const audio = new HoldemAudio();
const reduced =
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** @type {import('./game/table.js').createMatch extends (...args: any) => infer R ? R : never | null} */
let match = null;
let bank = DEFAULT_BANK;
let records = { played: 0, wins: 0, peakBank: DEFAULT_BANK };
let settings = { mute: false };
let aiTimer = null;
let pendingMode = "sng";

const $ = (id) => document.getElementById(id);

function show(el, on) {
  el.classList.toggle("hidden", !on);
}

function flashLobby(msg) {
  $("lobby-flash").textContent = msg;
}

async function init() {
  bank = await loadBank();
  records = await loadRecords();
  settings = await loadSettings();
  audio.setEnabled(!settings.mute);
  $("btn-mute").textContent = settings.mute ? "音效關" : "音效開";
  renderLobby();

  $("btn-mute").onclick = async () => {
    settings.mute = !settings.mute;
    audio.setEnabled(!settings.mute);
    $("btn-mute").textContent = settings.mute ? "音效關" : "音效開";
    await saveSettings(settings);
  };

  $("btn-about").onclick = () => show($("about-panel"), true);
  $("btn-about-close").onclick = () => show($("about-panel"), false);

  $("btn-topup").onclick = async () => {
    bank = Math.max(bank, DEFAULT_BANK);
    records.peakBank = Math.max(records.peakBank, bank);
    await saveBank(bank);
    await saveRecords(records);
    renderLobby();
    flashLobby("已補至銀行上限");
  };

  $("btn-sng").onclick = () => startMode("sng");
  $("btn-hu").onclick = () => startMode("hu");

  $("btn-fold").onclick = () => playerAct({ type: "fold" });
  $("btn-call").onclick = () => {
    const la = legalActions(match);
    if (!la) return;
    playerAct({ type: la.toCall > 0 ? "call" : "check" });
  };
  $("btn-raise").onclick = () => {
    show($("raise-panel"), true);
    show($("action-bar"), false);
  };
  $("btn-raise-cancel").onclick = () => {
    show($("raise-panel"), false);
    updateActionBar();
  };
  for (const btn of document.querySelectorAll("[data-raise]")) {
    btn.addEventListener("click", () => {
      const la = legalActions(match);
      if (!la) return;
      const kind = btn.getAttribute("data-raise");
      let amount = la.maxRaiseTo;
      if (kind === "half") {
        amount = Math.min(
          la.maxRaiseTo,
          Math.max(la.minRaiseTo, match.currentBet + Math.floor(la.pot / 2)),
        );
      } else if (kind === "pot") {
        amount = Math.min(
          la.maxRaiseTo,
          Math.max(la.minRaiseTo, match.currentBet + la.pot),
        );
      } else {
        playerAct({ type: "allin" });
        show($("raise-panel"), false);
        return;
      }
      playerAct({ type: "raise", amount });
      show($("raise-panel"), false);
    });
  }

  $("btn-next-hand").onclick = () => {
    const r = finishHandCleanup(match);
    if (r.matchOver) {
      onMatchOver();
      return;
    }
    audio.shuffle();
    startHand(match);
    renderTable();
    scheduleAiOrWait();
  };

  $("btn-leave").onclick = () => {
    if (match?.mode === "hu" || match?.street === "idle" || match?.finished) {
      leaveToLobby(false);
      return;
    }
    show($("confirm-reset"), true);
  };
  $("btn-leave-no").onclick = () => show($("confirm-reset"), false);
  $("btn-leave-yes").onclick = () => {
    show($("confirm-reset"), false);
    leaveToLobby(true);
  };

  $("btn-again").onclick = () => {
    show($("match-over"), false);
    startMode(pendingMode);
  };
  $("btn-to-lobby").onclick = () => {
    show($("match-over"), false);
    leaveToLobby(false);
  };

  window.addEventListener("keydown", (e) => {
    if (!match || match.street === "handOver" || match.finished) return;
    const seat = match.seats[match.toAct];
    if (!seat?.isHuman) return;
    if (e.key === "f" || e.key === "F") playerAct({ type: "fold" });
    if (e.key === "c" || e.key === "C") {
      const la = legalActions(match);
      if (la) playerAct({ type: la.toCall > 0 ? "call" : "check" });
    }
    if (e.key === "r" || e.key === "R") {
      show($("raise-panel"), true);
      show($("action-bar"), false);
    }
  });
}

function renderLobby() {
  $("lobby-bank").textContent = String(bank);
  $("lobby-records").textContent = `戰績：${records.played} 局 · 冠軍 ${records.wins} · 峰值 ${records.peakBank}`;
}

async function startMode(mode) {
  await audio.unlock();
  pendingMode = mode;
  if (mode === "sng") {
    if (bank < BUY_IN) {
      flashLobby("銀行不足，請先補籌碼");
      return;
    }
    bank -= BUY_IN;
    await saveBank(bank);
  }
  match = createMatch({
    mode,
    seatCount: mode === "hu" ? 2 : 6,
    seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0,
  });
  show($("view-lobby"), false);
  show($("view-table"), true);
  show($("match-over"), false);
  audio.shuffle();
  startHand(match);
  renderTable();
  scheduleAiOrWait();
}

function leaveToLobby(abandoned) {
  clearAi();
  match = null;
  show($("view-table"), false);
  show($("view-lobby"), true);
  show($("hand-over"), false);
  show($("action-bar"), false);
  show($("raise-panel"), false);
  renderLobby();
  flashLobby(abandoned ? "已離開牌桌" : "");
}

function clearAi() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function playerAct(action) {
  if (!match) return;
  const seat = match.seats[match.toAct];
  if (!seat?.isHuman) return;
  const r = applyAction(match, action);
  if (!r.ok) return;
  sfxFor(action);
  advanceIfNeeded(match);
  renderTable();
  scheduleAiOrWait();
}

function sfxFor(action) {
  if (action.type === "fold") audio.fold();
  else if (action.type === "check") audio.deal();
  else audio.chip();
}

function scheduleAiOrWait() {
  clearAi();
  if (!match) return;

  if (match.street === "handOver") {
    show($("action-bar"), false);
    show($("raise-panel"), false);
    show($("hand-over"), true);
    const msg = match.status;
    let detail = "";
    if (match.lastShowdown && match.lastRanks) {
      const bits = Object.keys(match.lastRanks).map((id) => {
        const s = match.seats[Number(id)];
        const r = match.lastRanks[id];
        return `${s.name}：${handCategoryName(r.category)}`;
      });
      detail = bits.join(" · ");
    }
    $("hand-over-msg").textContent = detail ? `${msg}（${detail}）` : msg;
    if (match.lastAwards && Object.values(match.lastAwards).some((v) => v > 0)) {
      audio.win();
    }
    return;
  }

  if (match.finished || match.street === "matchOver") {
    onMatchOver();
    return;
  }

  const seat = match.seats[match.toAct];
  if (!seat) {
    renderTable();
    return;
  }
  if (seat.isHuman) {
    updateActionBar();
    renderTable();
    return;
  }

  show($("action-bar"), false);
  const delay = reduced ? 120 : 400 + Math.floor(Math.random() * 500);
  aiTimer = setTimeout(() => {
    const act = chooseAction(match, seat);
    applyAction(match, act);
    sfxFor(act);
    advanceIfNeeded(match);
    renderTable();
    scheduleAiOrWait();
  }, delay);
}

async function onMatchOver() {
  clearAi();
  show($("hand-over"), false);
  show($("action-bar"), false);
  const places = placeForFinish(match);
  const myPlace = places[match.humanIndex];
  let delta = 0;
  let msg = "";
  if (match.mode === "sng") {
    delta = bankDeltaForPlace(myPlace);
    bank += delta;
    records.played += 1;
    if (myPlace === 1) records.wins += 1;
    records.peakBank = Math.max(records.peakBank, bank);
    await saveBank(bank);
    await saveRecords(records);
    msg = `名次第 ${myPlace} 名 · 銀行 ${delta >= 0 ? "+" : ""}${delta} → ${bank}`;
    audio.win();
  } else {
    msg = myPlace === 1 ? "單挑練習獲勝（不計銀行）" : "單挑練習結束（不計銀行）";
  }
  $("match-msg").textContent = msg;
  show($("match-over"), true);
  renderLobby();
}

function updateActionBar() {
  const la = legalActions(match);
  if (!la) {
    show($("action-bar"), false);
    return;
  }
  show($("action-bar"), true);
  show($("raise-panel"), false);
  const callBtn = $("btn-call");
  if (la.toCall > 0) {
    callBtn.textContent = `跟注 ${la.toCall}`;
  } else {
    callBtn.textContent = "過牌";
  }
  $("btn-raise").disabled = !la.canRaise;
}

function renderTable() {
  if (!match) return;
  $("hud-blinds").textContent = `盲注 ${match.sb}/${match.bb}`;
  $("hud-hand").textContent = `第 ${match.handIndex + 1} 手`;
  $("status").textContent = match.status || "";
  $("pot").textContent = `底池 ${totalPot(match)}`;

  const board = $("board");
  board.innerHTML = "";
  for (const c of match.board) {
    const img = document.createElement("img");
    img.src = cardAsset(c);
    img.alt = "";
    board.appendChild(img);
  }

  const seatsEl = $("seats");
  seatsEl.innerHTML = "";
  // layout: opponents only in grid; human at bottom
  const order = seatDisplayOrder(match);
  for (const idx of order) {
    const s = match.seats[idx];
    if (s.isHuman) continue;
    const div = document.createElement("div");
    div.className = "seat";
    if (match.toAct === idx) div.classList.add("active");
    if (s.folded) div.classList.add("folded");
    if (s.chips <= 0 && !s.inHand) div.classList.add("bust");
    let badge = "";
    if (s.folded) badge = "蓋牌";
    else if (s.allIn) badge = "全下";
    else if (s.streetBet > 0) badge = `注 ${s.streetBet}`;
    else if (s.place) badge = `第${s.place}名`;
    div.innerHTML = `<span class="name">${s.name}</span><span class="chips">${s.chips}</span><span class="badge">${badge}</span>`;
    seatsEl.appendChild(div);
  }

  const hero = match.seats[match.humanIndex];
  const hc = $("hero-cards");
  hc.innerHTML = "";
  for (const c of hero.hole) {
    const img = document.createElement("img");
    img.src = cardAsset(c);
    img.alt = "";
    hc.appendChild(img);
  }
  $("hero-meta").innerHTML = `<div>${hero.name}</div><div class="chips">${hero.chips}</div><div>${
    hero.folded ? "已蓋牌" : hero.allIn ? "全下" : hero.streetBet ? `本街 ${hero.streetBet}` : ""
  }</div>`;

  if (match.street === "handOver") {
    // reveal opponent cards briefly in status already; optionally show on seats — skip for MVP density
  }
}

function seatDisplayOrder(m) {
  // put human at end conceptually; grid shows others starting left of human
  const n = m.seats.length;
  const out = [];
  for (let step = 1; step < n; step++) {
    out.push((m.humanIndex + step) % n);
  }
  return out;
}

init();
