/**
 * Procedural pixel-art texture generation. Everything is drawn to an offscreen
 * canvas once at boot, so the game ships with zero image assets — keeping the
 * PoC self-contained and network-free.
 */
import Phaser from "phaser";
import { BLOCK_COLORS } from "../config";
import { BLOCK_H, BLOCK_MARGIN, BLOCK_W } from "./metrics";
import { darken, lighten, rgbToCss, toRgb } from "./colors";

export const blockTextureKey = (colorIndex: number) => `block-${colorIndex}`;

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

export function generateTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < BLOCK_COLORS.length; i++) {
    const key = blockTextureKey(i);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, BLOCK_W, BLOCK_H);
    if (!tex) continue;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, BLOCK_W, BLOCK_H);
    drawBlock(ctx, BLOCK_COLORS[i]);
    tex.refresh();
  }
  drawFxPixel(scene);
  drawFxConfetti(scene);
}
