/** Shared pixel-art layout metrics (in virtual pixels). */

export const BLOCK_W = 46;
export const BLOCK_H = 40;
/** Transparent margin baked into each block texture so stacked blocks show a gap. */
export const BLOCK_MARGIN = 2;

/** Glass tube geometry. */
export const TUBE_WALL = 5;
export const TUBE_PAD = 6; // inner padding above the top block / below bottom
export const TUBE_INNER_W = BLOCK_W;
export const TUBE_LIP = 6; // extra height at the rim

export function tubeWidth(): number {
  return TUBE_INNER_W + TUBE_WALL * 2;
}

export function tubeHeight(capacity: number): number {
  return capacity * BLOCK_H + TUBE_PAD * 2 + TUBE_WALL + TUBE_LIP;
}
