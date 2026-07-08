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
import { isTubeComplete, topRunLength } from "./logic";
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

function scramble(colors: number, emptyTubes: number, rng: () => number): Board {
  // Solved start: one full tube per colour, then the spare empty tubes.
  const board: Board = [];
  for (let c = 0; c < colors; c++) board.push([c, c, c, c]);
  for (let e = 0; e < emptyTubes; e++) board.push([]);

  const count = board.length;
  const reserved = count - 1; // last spare — kept single-colour, drained at end

  const target = colors * 12 + 20;
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

/** Acceptable = has working space, isn't near-solved, and is solvable. */
function acceptable(board: Board): boolean {
  if (emptyCount(board) < 1) return false;
  if (board.filter(isTubeComplete).length > 1) return false;
  return solve(board).solvable; // safety net; reverse-gen should always pass
}

export function generateLevel(levelNumber: number): GeneratedLevel {
  const spec = levelSpec(levelNumber);
  const baseSeed = seedFor(levelNumber);

  let board = scramble(spec.colors, spec.emptyTubes, mulberry32(baseSeed));
  for (let attempt = 1; !acceptable(board) && attempt < 80; attempt++) {
    board = scramble(
      spec.colors,
      spec.emptyTubes,
      mulberry32(baseSeed + attempt * 2654435761),
    );
  }

  return { board, spec, levelNumber, tubeCount: board.length };
}
