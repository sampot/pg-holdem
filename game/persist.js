import { DEFAULT_BANK } from "./sng.js";

export async function loadBank() {
  try {
    const res = await fetch("/api/kv/bank");
    if (!res.ok) return DEFAULT_BANK;
    const t = await res.text();
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BANK;
  } catch {
    return DEFAULT_BANK;
  }
}

export async function saveBank(value) {
  try {
    await fetch("/api/kv/bank", { method: "PUT", body: String(value) });
  } catch {
    /* offline / no kv */
  }
}

export async function loadRecords() {
  try {
    const res = await fetch("/api/kv/records");
    if (!res.ok) return emptyRecords();
    return { ...emptyRecords(), ...JSON.parse(await res.text()) };
  } catch {
    return emptyRecords();
  }
}

export async function saveRecords(records) {
  try {
    await fetch("/api/kv/records", {
      method: "PUT",
      body: JSON.stringify(records),
    });
  } catch {
    /* ignore */
  }
}

export async function loadSettings() {
  try {
    const res = await fetch("/api/kv/settings");
    if (!res.ok) return { mute: false };
    return { mute: false, ...JSON.parse(await res.text()) };
  } catch {
    return { mute: false };
  }
}

export async function saveSettings(settings) {
  try {
    await fetch("/api/kv/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  } catch {
    /* ignore */
  }
}

export function emptyRecords() {
  return { played: 0, wins: 0, peakBank: DEFAULT_BANK };
}
