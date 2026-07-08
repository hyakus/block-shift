/**
 * Pure game rules for Block Shift. No rendering, no Phaser — this module is
 * deliberately dependency-free so it can be unit tested and reused by the
 * solver and level generator.
 */
import { TUBE_CAPACITY } from "../config";
import type { Board, Move, Tube } from "./types";

export function cloneBoard(board: Board): Board {
  return board.map((tube) => tube.slice());
}

export function topColor(tube: Tube): number | null {
  return tube.length > 0 ? tube[tube.length - 1] : null;
}

/**
 * Size of the movable top "run": the number of identical-colour blocks at the
 * top of the tube. The player may move the whole run at once (spec rule 2).
 */
export function topRunLength(tube: Tube): number {
  if (tube.length === 0) return 0;
  const color = tube[tube.length - 1];
  let n = 1;
  for (let i = tube.length - 2; i >= 0; i--) {
    if (tube[i] === color) n++;
    else break;
  }
  return n;
}

/** A tube is "complete" when empty, or full of a single colour. */
export function isTubeComplete(tube: Tube): boolean {
  if (tube.length === 0) return true;
  if (tube.length !== TUBE_CAPACITY) return false;
  return tube.every((c) => c === tube[0]);
}

/** The board is solved when every tube is complete. */
export function isSolved(board: Board): boolean {
  return board.every(isTubeComplete);
}

/**
 * How many blocks can actually move from `from` onto `to`, honouring:
 *  - can't pour a tube into itself
 *  - source must be non-empty
 *  - destination must have room
 *  - destination must be empty OR its top colour matches the source run colour
 * Returns 0 when the move is illegal.
 */
export function movableCount(board: Board, from: number, to: number): number {
  if (from === to) return 0;
  const src = board[from];
  const dst = board[to];
  if (src.length === 0) return 0;
  if (dst.length >= TUBE_CAPACITY) return 0;

  const color = src[src.length - 1];
  if (dst.length > 0 && dst[dst.length - 1] !== color) return 0;

  const run = topRunLength(src);
  const room = TUBE_CAPACITY - dst.length;
  return Math.min(run, room);
}

export function canMove(board: Board, from: number, to: number): boolean {
  return movableCount(board, from, to) > 0;
}

/**
 * Apply a move in place and return how many blocks were moved (0 if illegal).
 * Always moves the *whole* legal run that fits — matches the classic games and
 * the spec's "move multiple if adjacent blocks are the same colour".
 */
export function applyMove(board: Board, from: number, to: number): number {
  const n = movableCount(board, from, to);
  if (n === 0) return 0;
  const src = board[from];
  const dst = board[to];
  for (let i = 0; i < n; i++) dst.push(src.pop()!);
  return n;
}

/** Enumerate every legal move on the board. */
export function legalMoves(board: Board): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < board.length; from++) {
    for (let to = 0; to < board.length; to++) {
      const count = movableCount(board, from, to);
      if (count > 0) moves.push({ from, to, count });
    }
  }
  return moves;
}

/**
 * A move is "useful" for detecting a dead end. Pouring a run into an equally
 * empty tube when nothing is gained still counts as a legal move, so the raw
 * "no legal moves" test is enough for the fail condition (spec rule 5): if the
 * board is not solved and there are zero legal moves, the level is lost.
 */
export function isDeadEnd(board: Board): boolean {
  return !isSolved(board) && legalMoves(board).length === 0;
}
