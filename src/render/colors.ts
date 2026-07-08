/** Small colour helpers for deriving pixel-art shading from a base hue. */

export function toRgb(hex: number): { r: number; g: number; b: number } {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

export function rgbToCss(r: number, g: number, b: number): string {
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

export function cssHex(hex: number): string {
  return "#" + hex.toString(16).padStart(6, "0");
}

/** Mix toward white by t (0..1). */
export function lighten(hex: number, t: number): string {
  const { r, g, b } = toRgb(hex);
  return rgbToCss(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

/** Mix toward black by t (0..1). */
export function darken(hex: number, t: number): string {
  const { r, g, b } = toRgb(hex);
  return rgbToCss(r * (1 - t), g * (1 - t), b * (1 - t));
}

function pack(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** Mix toward white by t, returned as a 0xRRGGBB number (for Phaser fills/tints). */
export function lightenHex(hex: number, t: number): number {
  const { r, g, b } = toRgb(hex);
  return pack(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

/** Mix toward black by t, returned as a 0xRRGGBB number. */
export function darkenHex(hex: number, t: number): number {
  const { r, g, b } = toRgb(hex);
  return pack(r * (1 - t), g * (1 - t), b * (1 - t));
}
