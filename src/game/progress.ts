/** localStorage-backed progress: highest level completed + best stars per level. */
import { TOTAL_LEVELS } from "../config";

const KEY = "block-shift.progress.v2";
const STARS_KEY = "block-shift.stars.v2";

function readJson<T extends object>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function writeJson(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

type StarStore = Record<string, number>; // "level" -> best stars (1..3)

/** Highest level number completed (0 if none). */
export function highestCompleted(): number {
  const v = Number(readJson<{ done?: number }>(KEY).done ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** A level is unlocked if it's the first, or the previous one is completed. */
export function isUnlocked(level: number): boolean {
  return level <= highestCompleted() + 1;
}

export function markCompleted(level: number): void {
  const done = Math.max(highestCompleted(), level);
  writeJson(KEY, { done });
}

/** Best star rating earned on a level (0 if never cleared). */
export function bestStars(level: number): number {
  return readJson<StarStore>(STARS_KEY)[String(level)] ?? 0;
}

/** Record a level's star rating, keeping the best. */
export function recordStars(level: number, stars: number): void {
  const store = readJson<StarStore>(STARS_KEY);
  const k = String(level);
  store[k] = Math.max(store[k] ?? 0, stars);
  writeJson(STARS_KEY, store);
}

/** Fraction of all levels completed (for the menu readout). */
export function totalProgress(): number {
  return Math.min(highestCompleted(), TOTAL_LEVELS) / TOTAL_LEVELS;
}

/** Total stars earned across every level. */
export function totalStars(): number {
  return Object.values(readJson<StarStore>(STARS_KEY)).reduce((a, b) => a + b, 0);
}
