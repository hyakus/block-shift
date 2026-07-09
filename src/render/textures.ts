/**
 * Procedural pixel-art texture generation. Everything is drawn to an offscreen
 * canvas once at boot, so the game ships with zero image assets — keeping the
 * PoC self-contained and network-free.
 */
import Phaser from "phaser";
import { BLOCK_COLORS } from "../config";
import { BLOCK_H, BLOCK_MARGIN, BLOCK_W } from "./metrics";
import { darken, lighten, rgbToCss, toRgb } from "./colors";

export const blockTextureKey = (colorIndex: number, glyph = false) =>
  glyph ? `block-g-${colorIndex}` : `block-${colorIndex}`;

/**
 * Draw one pixel-art block: a bevelled rounded square with a hard highlight on
 * the top/left, a hard shadow on the bottom/right and a small sheen — the
 * "modern pixel art" look (flat colour + crisp bevels, no gradients).
 */
function drawBlock(ctx: CanvasRenderingContext2D, base: number): void {
  const x0 = BLOCK_MARGIN;
  const y0 = BLOCK_MARGIN;
  const w = BLOCK_W - BLOCK_MARGIN * 2;
  const h = BLOCK_H - BLOCK_MARGIN * 2;
  const c = 3; // corner cut for the pixel-rounded look
  const { r, g, b } = toRgb(base);

  const fill = rgbToCss(r, g, b);
  const hi = lighten(base, 0.4);
  const hi2 = lighten(base, 0.7);
  const sh = darken(base, 0.32);
  const sh2 = darken(base, 0.5);

  // Body (rounded via corner cuts).
  ctx.fillStyle = fill;
  ctx.fillRect(x0 + c, y0, w - c * 2, h);
  ctx.fillRect(x0, y0 + c, w, h - c * 2);
  ctx.fillRect(x0 + 1, y0 + 1, c, c); // fill diagonal corner steps
  ctx.fillRect(x0 + w - c - 1, y0 + 1, c, c);
  ctx.fillRect(x0 + 1, y0 + h - c - 1, c, c);
  ctx.fillRect(x0 + w - c - 1, y0 + h - c - 1, c, c);

  // Top + left highlight bevel.
  ctx.fillStyle = hi;
  ctx.fillRect(x0 + c, y0, w - c * 2, 3);
  ctx.fillRect(x0, y0 + c, 3, h - c * 2);

  // Bottom + right shadow bevel.
  ctx.fillStyle = sh;
  ctx.fillRect(x0 + c, y0 + h - 3, w - c * 2, 3);
  ctx.fillRect(x0 + w - 3, y0 + c, 3, h - c * 2);

  // Darker corner accents for depth.
  ctx.fillStyle = sh2;
  ctx.fillRect(x0 + w - 3, y0 + h - 6, 3, 3);
  ctx.fillRect(x0 + w - 6, y0 + h - 3, 3, 3);

  // Sheen: a couple of bright pixels near the top-left.
  ctx.fillStyle = hi2;
  ctx.fillRect(x0 + 6, y0 + 5, 8, 3);
  ctx.fillRect(x0 + 6, y0 + 8, 3, 4);
}

// ---- Accessibility glyphs -------------------------------------------------
//
// Each colour gets a distinct shape, embossed into the block, so the blocks are
// still tellable apart without relying on hue (colour-blind aid). The shape is
// drawn twice — an offset edge tone then the face — for a carved/embossed look,
// and the face/edge tones are chosen from the block's luminance so the glyph
// contrasts on every colour (including the near-white and dark-brown blocks).

type Ctx = CanvasRenderingContext2D;

function regularPoly(ctx: Ctx, sides: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function starPath(ctx: Ctx, points: number, rOut: number, rIn: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? rOut : rIn;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function triangle(ctx: Ctx, r: number, down: boolean): void {
  const apex = down ? r : -r;
  const base = down ? -r : r;
  ctx.beginPath();
  ctx.moveTo(0, apex);
  ctx.lineTo(r, base);
  ctx.lineTo(-r, base);
  ctx.closePath();
  ctx.fill();
}

function chevron(ctx: Ctx, r: number, down: boolean): void {
  const s = down ? -1 : 1;
  const y = (v: number) => s * v * r;
  ctx.beginPath();
  ctx.moveTo(-r, y(0.15));
  ctx.lineTo(0, y(-0.55));
  ctx.lineTo(r, y(0.15));
  ctx.lineTo(r, y(0.55));
  ctx.lineTo(0, y(0.15));
  ctx.lineTo(-r, y(0.55));
  ctx.closePath();
  ctx.fill();
}

/** Fill glyph shape `i` (centred at the origin, radius `r`) with `style`. */
function paintShape(ctx: Ctx, i: number, r: number, style: string): void {
  ctx.fillStyle = style;
  switch (i % 12) {
    case 0: // circle
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 1: // square
      ctx.fillRect(-r, -r, r * 2, r * 2);
      break;
    case 2: // triangle up
      triangle(ctx, r, false);
      break;
    case 3: // triangle down
      triangle(ctx, r, true);
      break;
    case 4: // diamond
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 5: {
      // plus
      const t = r * 0.42;
      ctx.fillRect(-t, -r, t * 2, r * 2);
      ctx.fillRect(-r, -t, r * 2, t * 2);
      break;
    }
    case 6: {
      // cross (a plus rotated 45°)
      ctx.save();
      ctx.rotate(Math.PI / 4);
      const t = r * 0.38;
      const R = r * 1.05;
      ctx.fillRect(-t, -R, t * 2, R * 2);
      ctx.fillRect(-R, -t, R * 2, t * 2);
      ctx.restore();
      break;
    }
    case 7: // star
      starPath(ctx, 5, r, r * 0.46);
      break;
    case 8: // hexagon
      regularPoly(ctx, 6, r, -Math.PI / 2);
      break;
    case 9: // ring (annulus)
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2, false);
      ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2, true);
      ctx.fill();
      break;
    case 10: // chevron up
      chevron(ctx, r, false);
      break;
    case 11: // chevron down
      chevron(ctx, r, true);
      break;
  }
}

/** Perceptual luminance (0..1) of a packed 0xRRGGBB colour. */
function luminance(base: number): number {
  const { r, g, b } = toRgb(base);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Draw glyph `i` embossed into the block centred at (cx, cy). */
function drawGlyph(ctx: Ctx, i: number, cx: number, cy: number, r: number, base: number): void {
  const lightOnDark = luminance(base) <= 0.6;
  const face = lightOnDark ? "rgba(255,255,255,0.92)" : "rgba(20,18,34,0.9)";
  const edge = lightOnDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.55)";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.save(); // emboss edge, offset down-right behind the face
  ctx.translate(1.5, 1.5);
  paintShape(ctx, i, r, edge);
  ctx.restore();
  paintShape(ctx, i, r, face);
  ctx.restore();
}

/** A plain white square, tinted at runtime — used for the dissolve pixels. */
function drawFxPixel(scene: Phaser.Scene): void {
  const key = "fx-pixel";
  if (scene.textures.exists(key)) return;
  const size = 6;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

/** A small white confetti chip (with a hard shadow edge), tinted per particle. */
function drawFxConfetti(scene: Phaser.Scene): void {
  const key = "fx-confetti";
  if (scene.textures.exists(key)) return;
  const w = 8;
  const h = 6;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.28)"; // bottom shadow for a bit of depth
  ctx.fillRect(0, h - 2, w, 2);
  tex.refresh();
}

/** Render one block texture (`key`), optionally embossing colour `i`'s glyph. */
function makeBlockTexture(
  scene: Phaser.Scene,
  key: string,
  i: number,
  withGlyph: boolean,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, BLOCK_W, BLOCK_H);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, BLOCK_W, BLOCK_H);
  drawBlock(ctx, BLOCK_COLORS[i]);
  if (withGlyph) drawGlyph(ctx, i, BLOCK_W / 2, BLOCK_H / 2, 11, BLOCK_COLORS[i]);
  tex.refresh();
}

export function generateTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < BLOCK_COLORS.length; i++) {
    // Plain + glyphed variants; TubeSprite/Menu pick per the accessibility flag.
    makeBlockTexture(scene, blockTextureKey(i), i, false);
    makeBlockTexture(scene, blockTextureKey(i, true), i, true);
  }
  drawFxPixel(scene);
  drawFxConfetti(scene);
}
