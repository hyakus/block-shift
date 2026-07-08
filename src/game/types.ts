/** A colour is an index into BLOCK_COLORS. -1 is never stored (empty = absent). */
export type Color = number;

/**
 * A tube is an array of colour indices, bottom-first. Length 0..TUBE_CAPACITY.
 * The "top" block (the only movable one) is the last element.
 */
export type Tube = Color[];

/** Whole-board state: an ordered list of tubes. */
export type Board = Tube[];

/** A move: take the top run from `from` and drop it onto `to`. */
export interface Move {
  from: number;
  to: number;
  /** How many same-colour blocks are carried. */
  count: number;
}
