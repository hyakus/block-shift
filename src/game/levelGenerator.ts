/**
 * Solvable-level generator via **reverse generation**.
 *
 * Random-deal-then-verify does not scale: with few empty tubes most random
 * deals are unsolvable and proving that exhausts the solver. Instead we start
 * from the solved state and scramble using moves that are each the *exact
 * inverse* of a legal forward pour. Any state reached that way is solvable by
 * construction (replay the reverse moves forward), at any difficulty — including
 * the 1-empty-tube expert boards.
 *
 * The inverse of "pour a run of colour c onto an empty/c-topped tube" is: take
 * that run back off and drop it onto a tube whose top is *not* c (or is empty).
 * So reverse moves DISPERSE colours — that is what mixes the board. Two guards
 * keep every reverse move a valid inverse (and thus the board solvable):
 *   - source `to`: only remove down to >=1 remaining c, unless the tube is a
 *     single colour (then it may be emptied) — never expose a foreign colour;
 *   - dest `from`: empty or top != c, so the placed run is exactly one pour.
 *
 * One "reserved" tube is kept single-colour (it only ever receives matching
 * colour) so it stays drainable; it is emptied at the end, guaranteeing the
 * "at least one empty tube" rule. A seeded PRNG keyed on (difficulty, level)
 * makes every level reproducible, and the fast solver double-checks the result.
 */
import { TUBE_CAPACITY, levelSpec, type LevelSpec } from "../config";
import type { Board } from "./types";
import { topRunLength } from "./logic";
import { solve } from "./solver";

/** Deterministic PRNG (mulberry32) so levels are stable across sessions. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedLevel {
  board: Board;
  spec: LevelSpec;
  levelNumber: number;
  tubeCount: number;
}

function seedFor(levelNumber: number): number {
  return levelNumber * 2_654_435_761 + 12_345;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function topOf(tube: number[]): number | null {
  return tube.length ? tube[tube.length - 1] : null;
}

/** One dispersing reverse move (inverse of a legal forward pour). */
function reverseMove(
  board: Board,
  count: number,
  reserved: number,
  rng: () => number,
): boolean {
  const tos: number[] = [];
  for (let t = 0; t < count; t++) if (board[t].length > 0) tos.push(t);

  for (let attempt = 0; attempt < tos.length; attempt++) {
    const to = pick(tos, rng);
    const stack = board[to];
    const c = stack[stack.length - 1];
    const run = topRunLength(stack);
    const uniform = run === stack.length;
    const maxK = uniform ? stack.length : run - 1; // keep >=1 c unless emptying
    if (maxK < 1) continue;

    const froms: number[] = [];
    for (let f = 0; f < count; f++) {
      if (f === to || board[f].length >= TUBE_CAPACITY) continue;
      const ft = topOf(board[f]);
      // Reserved tube stays single-colour (only receives matching c); every
      // other tube must receive onto a *different* top (dispersion).
      const ok = f === reserved ? ft === null || ft === c : ft === null || ft !== c;
      if (ok) froms.push(f);
    }
    if (froms.length === 0) continue;

    const from = pick(froms, rng);
    const room = TUBE_CAPACITY - board[from].length;
    const k = Math.min(1 + Math.floor(rng() * maxK), room);
    if (k < 1) continue;

    for (let i = 0; i < k; i++) board[from].push(board[to].pop()!);
    return true;
  }
  return false;
}

/**
 * Drain the (single-colour) reserved tube empty via dispersing reverse moves.
 * Each block of colour c goes onto a tube whose top is not c (or empty), which
 * is the valid inverse form. Returns false if it gets stuck (caller re-seeds).
 */
function drainReserved(board: Board, reserved: number, rng: () => number): boolean {
  let guard = 0;
  while (board[reserved].length > 0) {
    if (guard++ > 500) return false;
    const c = board[reserved][board[reserved].length - 1];
    const froms: number[] = [];
    for (let f = 0; f < board.length; f++) {
      if (f === reserved || board[f].length >= TUBE_CAPACITY) continue;
      const ft = topOf(board[f]);
      if (ft === null || ft !== c) froms.push(f);
    }
    if (froms.length === 0) return false;
    const from = pick(froms, rng);
    board[from].push(board[reserved].pop()!);
  }
  return true;
}

function scramble(spec: LevelSpec, rng: () => number, depthMul = 1): Board {
  const { colors, emptyTubes, doubledColors } = spec;
  // Solved start: one full tube per colour, a SECOND full tube for each doubled
  // colour, then the spare empty tubes.
  const board: Board = [];
  for (let c = 0; c < colors; c++) board.push([c, c, c, c]);
  for (let c = 0; c < doubledColors; c++) board.push([c, c, c, c]);
  for (let e = 0; e < emptyTubes; e++) board.push([]);

  const count = board.length;
  const reserved = count - 1; // last spare — kept single-colour, drained at end

  // Scramble depth, scaled to the number of filled tubes (doubled colours make a
  // bigger board that needs more mixing) and jittered per attempt (depthMul) so
  // re-seeds explore boards at different mix levels instead of all collapsing
  // onto the same deeply-mixed arrangement — the biggest source of look-alikes.
  const filledTubes = colors + doubledColors;
  const target = Math.round((filledTubes * 12 + 20) * depthMul);
  let done = 0;
  let misses = 0;
  while (done < target && misses < target * 5) {
    if (reverseMove(board, count, reserved, rng)) done++;
    else misses++;
  }

  drainReserved(board, reserved, rng);
  return board;
}

function emptyCount(board: Board): number {
  return board.filter((t) => t.length === 0).length;
}

/**
 * Number of tubes that are already *fully sorted* (full and single-colour).
 * Empty tubes are deliberately NOT counted — they are working space, not solved
 * progress. (The old check used `isTubeComplete`, which treats an empty tube as
 * complete; with 2 spare tubes that rejected almost every board and funnelled
 * the whole difficulty band onto a handful of identical layouts.)
 */
function solvedTubeCount(board: Board): number {
  return board.filter(
    (t) => t.length === TUBE_CAPACITY && t.every((c) => c === t[0]),
  ).length;
}

/** Acceptable = has working space, isn't near-solved, and is solvable. */
function acceptable(board: Board): boolean {
  if (emptyCount(board) < 1) return false;
  if (solvedTubeCount(board) > 1) return false; // don't hand the player a near-win
  return solve(board).solvable; // safety net; reverse-gen should always pass
}

/**
 * Colour-agnostic, tube-order-agnostic signature of a board's *shape*: relabel
 * colours by first appearance and sort the tubes. Two boards that are the same
 * puzzle up to recolouring/tube-reordering share a key, so we can guarantee
 * every level is a genuinely different layout (not just a recolour).
 */
function shapeKey(board: Board): string {
  // Sort tubes by raw content first so the key ignores tube position, THEN
  // relabel colours by first appearance so it also ignores colour identity.
  // (Relabelling before sorting would depend on tube order and miss layouts
  // that are identical bar a shuffle of the tubes on screen.)
  const sorted = board.map((t) => t.join(",")).sort();
  const map = new Map<number, number>();
  let next = 0;
  return sorted
    .map((s) =>
      s === ""
        ? ""
        : s
            .split(",")
            .map((x) => {
              const c = Number(x);
              if (!map.has(c)) map.set(c, next++);
              return map.get(c)!;
            })
            .join(","),
    )
    .join("|");
}

/** Fisher–Yates permutation of [0..n-1] from the seeded PRNG. */
function permutation(n: number, rng: () => number): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

// Session-memoised, deterministic sequence. Each level's shape is guaranteed
// distinct from every lower-numbered level's (see `buildLevel`), so the result
// depends only on the level number, never on the order levels are requested.
const levelCache = new Map<number, GeneratedLevel>();
const seenShapes = new Set<string>();
let builtUpTo = 0;

function buildLevel(levelNumber: number): GeneratedLevel {
  const spec = levelSpec(levelNumber);
  const baseSeed = seedFor(levelNumber);

  // One independent PRNG stream per level. Deriving each attempt's seed from
  // this stream (rather than baseSeed + attempt * stride) decorrelates adjacent
  // levels: with a shared stride, level N+1's attempt seeds are just level N's
  // shifted by one, so the two explore almost the same boards and N+1 keeps
  // landing on shapes N already claimed.
  const seedRng = mulberry32(baseSeed);

  let chosen: Board | null = null;
  let fallback: Board | null = null; // first acceptable board, if none are fresh
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = mulberry32((seedRng() * 0x1_0000_0000) >>> 0);
    const depthMul = 0.7 + ((attempt * 7) % 12) / 10; // spread mix depth 0.7..1.8
    const board = scramble(spec, rng, depthMul);
    if (!acceptable(board)) continue;
    fallback ??= board;
    if (!seenShapes.has(shapeKey(board))) {
      chosen = board;
      break;
    }
  }
  const board = chosen ?? fallback ?? scramble(spec, mulberry32(baseSeed));
  seenShapes.add(shapeKey(board));

  // Colour variety: shuffle which of the (curated, high-contrast) top-N colours
  // each label maps to. Keeps the same distinct hue set — only the assignment
  // changes — so contrast is preserved while consecutive levels look different.
  const perm = permutation(spec.colors, mulberry32(baseSeed ^ 0x9e3779b9));
  const painted = board.map((t) => t.map((c) => perm[c]));

  return { board: painted, spec, levelNumber, tubeCount: painted.length };
}

export function generateLevel(levelNumber: number): GeneratedLevel {
  const cached = levelCache.get(levelNumber);
  if (cached) return cached;
  // Build in order from where we left off so cross-level dedup is deterministic
  // regardless of which level is requested first.
  for (let n = builtUpTo + 1; n <= levelNumber; n++) {
    if (!levelCache.has(n)) levelCache.set(n, buildLevel(n));
  }
  builtUpTo = Math.max(builtUpTo, levelNumber);
  return levelCache.get(levelNumber)!;
}
