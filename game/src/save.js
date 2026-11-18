// Saving: the whole campaign state is one small JSON object in localStorage — cash,
// health, position, mission progress, wanted level and the pistol. Loading it drops the
// player back on the street where they saved; the world is rebuilt fresh around them.
// Storage can be off (private windows): then saves last the visit only, and nothing breaks.

import { BEST_KEY, SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return save;
  } catch {
    return null;
  }
}

export function writeSave(snapshot) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

export function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Best cash lasts this visit only when storage is off.
  }
}
