/**
 * Global game configuration: virtual resolution, palette and difficulty tuning.
 *
 * The game renders into a fixed virtual resolution (VIRTUAL_WIDTH x
 * VIRTUAL_HEIGHT) and Phaser's Scale.FIT manager scales that up to the
 * device screen, keeping the pixel art crisp and the layout identical across
 * phones, tablets and the browser.
 */

export const VIRTUAL_WIDTH = 480;

/**
 * Virtual (design) height. Derived from the device's real portrait aspect ratio
 * so Scale.FIT fills the whole screen instead of letterboxing on tall phones
 * (e.g. iPhone 14 Pro ≈ 19.5:9). Clamped to a sane range so unusually
 * tall/short screens still lay out well. Fixed width keeps layout maths simple.
 */
function computeVirtualHeight(): number {
  const fallback = 960;
  if (typeof window === "undefined") return fallback;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!w || !h) return fallback;
  const ratio = Math.max(1.77, Math.min(2.22, h / w)); // 16:9 … ~20:9
  return Math.round(VIRTUAL_WIDTH * ratio);
}

export const VIRTUAL_HEIGHT = computeVirtualHeight();

/**
 * Read a CSS safe-area inset (Dynamic Island / notch / home indicator) in real
 * pixels by probing `env(safe-area-inset-*)`, which only resolves when applied
 * to an element. Returns 0 on the web / non-notched devices.
 */
function safeAreaInset(side: "top" | "bottom"): number {
  if (typeof document === "undefined" || !document.body) return 0;
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "0";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.visibility = "hidden";
  probe.style.setProperty(side, "0");
  probe.style.setProperty(`padding-${side}`, `env(safe-area-inset-${side})`);
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).getPropertyValue(`padding-${side}`)) || 0;
  probe.remove();
  return px;
}

/** Convert a real-pixel length to virtual/game units (canvas is width-fitted). */
function toGameUnits(px: number): number {
  const w = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : VIRTUAL_WIDTH;
  return Math.round((px * VIRTUAL_WIDTH) / w);
}

/**
 * True on a Capacitor iOS device tall enough to have a notch / Dynamic Island
 * and home indicator (where env() is unreliable and a fixed inset is needed).
 * Old home-button iPhones (≈16:9) are excluded so they aren't over-inset.
 */
function needsFixedIOSInset(): boolean {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } })
    .Capacitor;
  const isIOS = !!cap?.getPlatform && cap.getPlatform() === "ios";
  const tall = window.innerHeight / (window.innerWidth || 1) > 2.0;
  return isIOS && tall;
}

// Safe-area insets in game units, computed lazily and cached. Prefer the real
// CSS env() value (correct on the web and Android). It reliably returns 0 in the
// Capacitor iOS WKWebView, so there we fall back to fixed insets big enough to
// clear the status bar / notch / Dynamic Island and the home indicator.
let _safeTop = -1;
let _safeBottom = -1;

/** Top inset (Dynamic Island / notch) in game units — add to top-anchored UI. */
export function safeTop(): number {
  if (_safeTop >= 0) return _safeTop;
  const env = toGameUnits(safeAreaInset("top"));
  _safeTop = env > 0 ? env : needsFixedIOSInset() ? toGameUnits(55) : 0;
  return _safeTop;
}

/** Bottom inset (home indicator) in game units — add to bottom-anchored UI. */
export function safeBottom(): number {
  if (_safeBottom >= 0) return _safeBottom;
  const env = toGameUnits(safeAreaInset("bottom"));
  _safeBottom = env > 0 ? env : needsFixedIOSInset() ? toGameUnits(30) : 0;
  return _safeBottom;
}

/** Blocks per tube. Fixed by the design spec. */
export const TUBE_CAPACITY = 4;

/**
 * Modern-pixel-art block palette. Each entry is a base colour; the renderer
 * derives a lighter highlight and darker shadow from it for the pixel shading.
 * Ordered so that early (easy) levels use the most visually distinct hues.
 */
export const BLOCK_COLORS: number[] = [
  0xff4d5b, // red
  0x4da6ff, // blue
  0x54d178, // green
  0xffd23f, // yellow
  0xb26bff, // purple
  0xff8f3f, // orange
  0x3fe0d0, // teal
  0xff6fb5, // pink
  0xa3e635, // lime
  0x8b93ff, // periwinkle
];

/** UI / retro theme colours. */
export const THEME = {
  bgTop: 0x1a1730,
  bgBottom: 0x0d0b17,
  panel: 0x241f3d,
  panelEdge: 0x3d3466,
  ink: "#f4f1ff",
  inkDim: "#a89fd6",
  accent: 0xffd23f,
  accentHex: "#ffd23f",
  glass: 0x2b2748,
  glassEdge: 0x4a4478,
  danger: "#ff4d5b",
  good: "#54d178",
} as const;

export interface Difficulty {
  key: string;
  label: string;
  /** Number of distinct colours (each contributes one full tube of blocks). */
  colors: number;
  /** Extra empty tubes available for manoeuvring (min 1 per spec). */
  emptyTubes: number;
}

/**
 * Difficulty ramp. More colours + fewer spare empty tubes = harder, matching
 * the spec's "more tubes and less initial moves". Always at least one empty
 * tube (spec requirement 7).
 */
export const DIFFICULTIES: Difficulty[] = [
  { key: "warmup", label: "WARM-UP", colors: 3, emptyTubes: 2 },
  { key: "easy", label: "EASY", colors: 4, emptyTubes: 2 },
  { key: "medium", label: "MEDIUM", colors: 6, emptyTubes: 2 },
  { key: "hard", label: "HARD", colors: 8, emptyTubes: 1 },
  { key: "expert", label: "EXPERT", colors: 10, emptyTubes: 1 },
];
