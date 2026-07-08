/** Tiny localStorage-backed progress store (levels completed per difficulty). */
import { DIFFICULTIES } from "../config";

const KEY = "block-shift.progress.v1";
const STARS_KEY = "block-shift.stars.v1";
export const LEVELS_PER_DIFFICULTY = 12;

type Store = Record<string, number>; // difficultyKey -> highest completed level (1-based)
type StarStore = Record<string, number>; // "difficultyKey:level" -> best stars (1..3)

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

const load = (): Store => readJson<Store>(KEY);
const save = (store: Store): void => writeJson(KEY, store);
const starKey = (difficultyKey: string, level: number): string => `${difficultyKey}:${level}`;

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

/** Best star rating earned on a level (0 if never cleared). */
export function bestStars(difficultyKey: string, level: number): number {
  return readJson<StarStore>(STARS_KEY)[starKey(difficultyKey, level)] ?? 0;
}

/** Record a level's star rating, keeping the best. */
export function recordStars(difficultyKey: string, level: number, stars: number): void {
  const store = readJson<StarStore>(STARS_KEY);
  const k = starKey(difficultyKey, level);
  store[k] = Math.max(store[k] ?? 0, stars);
  writeJson(STARS_KEY, store);
}

/** Total stars earned across every level (for a menu readout, if wanted). */
export function totalStars(): number {
  const store = readJson<StarStore>(STARS_KEY);
  return Object.values(store).reduce((a, b) => a + b, 0);
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
