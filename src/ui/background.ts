/** Shared retro background: gradient wash + CRT scanlines + faint grid. */
import Phaser from "phaser";
import { THEME, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../config";

export function drawRetroBackground(scene: Phaser.Scene): void {
  const W = VIRTUAL_WIDTH;
  const H = VIRTUAL_HEIGHT;
  const g = scene.add.graphics();

  // Vertical gradient wash.
  g.fillGradientStyle(THEME.bgTop, THEME.bgTop, THEME.bgBottom, THEME.bgBottom, 1);
  g.fillRect(0, 0, W, H);

  // Faint grid for a "retro terminal" feel.
  g.lineStyle(1, 0xffffff, 0.03);
  for (let x = 0; x <= W; x += 24) {
    g.lineBetween(x, 0, x, H);
  }
  for (let y = 0; y <= H; y += 24) {
    g.lineBetween(0, y, W, y);
  }

  // CRT scanlines.
  g.fillStyle(0x000000, 0.10);
  for (let y = 0; y < H; y += 3) {
    g.fillRect(0, y, W, 1);
  }

  // Corner vignette.
  g.fillStyle(0x000000, 0.25);
  g.fillRect(0, 0, W, 4);
  g.fillRect(0, H - 4, W, 4);
}
