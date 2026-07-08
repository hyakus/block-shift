/**
 * Depth-first solver with memoisation. Used to (a) guarantee a generated level
 * is actually solvable, and (b) provide an optional "hint" (the first move of a
 * winning line) in the game.
 *
 * Tubes are interchangeable, so the visited-set key sorts the tubes to collapse
 * symmetric states. That keeps the search tractable for PoC board sizes
 * (up to 10 colours + spare tubes).
 */
import type { Board, Move } from "./types";
import {
  applyMove,
  cloneBoard,
  isSolved,
  legalMoves,
  movableCount,
} from "./logic";

function canonicalKey(board: Board): string {
  return board
    .map((t) => t.join(","))
    .sort()
    .join("|");
}

/** Prefer moves that make progress: completing a tube, or emptying a tube. */
function scoreMove(board: Board, m: Move): number {
  const src = board[m.from];
  const dst = board[m.to];
  let score = 0;
  // Emptying a source tube entirely is good.
  if (m.count === src.length) score += 3;
  // Pouring onto a matching non-empty tube consolidates colours.
  if (dst.length > 0) score += 2;
  // Avoid pouring into a fresh empty tube unless it frees the source.
  if (dst.length === 0 && m.count !== src.length) score -= 2;
  return score;
}

export interface SolveResult {
  solvable: boolean;
  /** First move of a solution (for hints), if any. */
  firstMove: Move | null;
  /** Full solution move list, shortest-ish (greedy, not guaranteed optimal). */
  moves: Move[];
}

export function solve(input: Board, maxStates = 200_000): SolveResult {
  const visited = new Set<string>();
  const path: Move[] = [];
  let states = 0;

  const dfs = (board: Board): boolean => {
    if (isSolved(board)) return true;
    if (states++ > maxStates) return false;

    const key = canonicalKey(board);
    if (visited.has(key)) return false;
    visited.add(key);

    const moves = legalMoves(board)
      .filter((m) => isProductive(board, m))
      .sort((a, b) => scoreMove(board, b) - scoreMove(board, a));

    for (const m of moves) {
      const next = cloneBoard(board);
      applyMove(next, m.from, m.to);
      path.push(m);
      if (dfs(next)) return true;
      path.pop();
    }
    return false;
  };

  const solvable = dfs(cloneBoard(input));
  return {
    solvable,
    firstMove: solvable && path.length > 0 ? path[0] : null,
    moves: solvable ? path.slice() : [],
  };
}

/**
 * Prune obviously pointless moves to keep the search shallow:
 *  - never pour a tube that is already a single uniform colour touching bottom
 *    into an empty tube (no progress),
 *  - never move a full run into an empty tube if the source becomes empty and
 *    was already uniform (just shuffling).
 */
function isProductive(board: Board, m: Move): boolean {
  const src = board[m.from];
  const dst = board[m.to];
  // Moving the entire contents of a uniform tube into an empty tube is a no-op
  // in disguise.
  if (dst.length === 0 && m.count === src.length) {
    const uniform = src.every((c) => c === src[0]);
    if (uniform) return false;
  }
  return movableCount(board, m.from, m.to) > 0;
}
