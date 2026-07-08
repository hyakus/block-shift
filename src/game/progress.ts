/** Tiny localStorage-backed progress store (levels completed per difficulty). */
import { DIFFICULTIES } from "../config";

const KEY = "block-shift.progress.v1";
export const LEVELS_PER_DIFFICULTY = 12;

type Store = Record<string, number>; // difficultyKey -> highest completed level (1-based)

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function highestCompleted(difficultyKey: string): number {
  return load()[difficultyKey] ?? 0;
}

/** A level is unlocked if it's the first, or the previous one is completed. */
export function isUnlocked(difficultyKey: string, level: number): boolean {
  return level <= highestCompleted(difficultyKey) + 1;
}

export function markCompleted(difficultyKey: string, level: number): void {
  const store = load();
  store[difficultyKey] = Math.max(store[difficultyKey] ?? 0, level);
  save(store);
}

/** Overall completion percentage across all difficulties (for the menu). */
export function totalProgress(): number {
  const store = load();
  const total = DIFFICULTIES.length * LEVELS_PER_DIFFICULTY;
  let done = 0;
  for (const d of DIFFICULTIES) {
    done += Math.min(store[d.key] ?? 0, LEVELS_PER_DIFFICULTY);
  }
  return total === 0 ? 0 : done / total;
}
