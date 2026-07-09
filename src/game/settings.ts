/**
 * Persisted player options (localStorage). Audio's mute flag lives in audio/sfx;
 * this holds the rest — currently the accessibility "symbols on blocks" mode.
 */

const GLYPHS_KEY = "block-shift.glyphs";

/** Accessibility: show an embossed shape glyph on each block (colour-blind aid). */
export function glyphsEnabled(): boolean {
  try {
    return localStorage.getItem(GLYPHS_KEY) === "1";
  } catch {
    return false; // off by default (and on any storage error)
  }
}

export function setGlyphsEnabled(on: boolean): void {
  try {
    localStorage.setItem(GLYPHS_KEY, on ? "1" : "0");
  } catch {
    /* ignore private-mode storage errors */
  }
}
