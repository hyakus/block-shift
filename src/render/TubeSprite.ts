/**
 * Visual representation of a single tube: a pixel-art glass container plus the
 * stack of block sprites inside it. Owns block sprite lifecycle and the small
 * "lift / lower / pour" animations. All geometry is derived from metrics.ts.
 */
import Phaser from "phaser";
import { THEME, TUBE_CAPACITY } from "../config";
import {
  BLOCK_H,
  TUBE_LIP,
  TUBE_PAD,
  TUBE_WALL,
  tubeHeight,
  tubeWidth,
} from "./metrics";
import { blockTextureKey } from "./textures";
import { glyphsEnabled } from "../game/settings";

export class TubeSprite {
  readonly scene: Phaser.Scene;
  readonly index: number;
  /** Centre x of the tube. */
  readonly cx: number;
  /** Top y of the glass. */
  readonly top: number;
  readonly capacity: number;

  private glass: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private zone: Phaser.GameObjects.Zone;
  /** Block sprites, bottom-first. */
  blocks: Phaser.GameObjects.Image[] = [];

  constructor(
    scene: Phaser.Scene,
    index: number,
    cx: number,
    top: number,
    capacity = TUBE_CAPACITY,
  ) {
    this.scene = scene;
    this.index = index;
    this.cx = cx;
    this.top = top;
    this.capacity = capacity;

    this.glow = scene.add.graphics().setDepth(0);
    this.drawGlow(false);

    this.glass = scene.add.graphics().setDepth(1);
    this.drawGlass();

    // Interactive zone covers the tube plus headroom above the rim (so taps on
    // a lifted block register). Slightly wider than the glass for easy tapping.
    const w = tubeWidth() + 12;
    const h = tubeHeight(capacity) + BLOCK_H;
    this.zone = scene.add
      .zone(cx, top - BLOCK_H + h / 2, w, h)
      .setInteractive({ useHandCursor: true });
  }

  onTap(cb: (index: number) => void): void {
    this.zone.on("pointerdown", () => cb(this.index));
  }

  private drawGlass(): void {
    const g = this.glass;
    g.clear();
    const w = tubeWidth();
    const h = tubeHeight(this.capacity);
    const x = this.cx - w / 2;
    const y = this.top;

    // Drop shadow under the tube.
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(x + 3, y + h - 6, w, 10, { tl: 0, tr: 0, bl: 12, br: 12 });

    // Glass frame.
    g.fillStyle(THEME.glassEdge, 1);
    g.fillRoundedRect(x, y, w, h, { tl: 8, tr: 8, bl: 14, br: 14 });

    // Interior (open top: no top wall, translucent glass tint).
    g.fillStyle(THEME.glass, 1);
    g.fillRoundedRect(x + TUBE_WALL, y, w - TUBE_WALL * 2, h - TUBE_WALL, {
      tl: 0,
      tr: 0,
      bl: 9,
      br: 9,
    });

    // Left-wall vertical highlight streak (glass sheen).
    g.fillStyle(0xffffff, 0.10);
    g.fillRect(x + TUBE_WALL + 2, y + TUBE_LIP, 3, h - TUBE_LIP - TUBE_WALL - 4);

    // Rim caps on each wall for a polished lip.
    g.fillStyle(THEME.glassEdge, 1);
    g.fillRoundedRect(x, y, TUBE_WALL + 2, TUBE_LIP, { tl: 8, tr: 3, bl: 0, br: 0 });
    g.fillRoundedRect(x + w - TUBE_WALL - 2, y, TUBE_WALL + 2, TUBE_LIP, {
      tl: 3,
      tr: 8,
      bl: 0,
      br: 0,
    });
  }

  private drawGlow(on: boolean, color: number = THEME.accent): void {
    const g = this.glow;
    g.clear();
    if (!on) return;
    const w = tubeWidth();
    const h = tubeHeight(this.capacity);
    const x = this.cx - w / 2;
    const y = this.top;
    g.lineStyle(6, color, 0.9);
    g.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 16);
    g.lineStyle(12, color, 0.25);
    g.strokeRoundedRect(x - 6, y - 6, w + 12, h + 12, 18);
  }

  /** Y centre of the block occupying stack index i (0 = bottom). */
  slotY(i: number): number {
    const h = tubeHeight(this.capacity);
    const floor = this.top + h - TUBE_WALL - TUBE_PAD; // inner bottom
    return floor - i * BLOCK_H - BLOCK_H / 2;
  }

  /** Y centre for a lifted block hovering above the rim (stack pos j, 0 = lowest lifted). */
  liftedY(j: number): number {
    return this.top - BLOCK_H * 0.55 - j * BLOCK_H;
  }

  /** Build the block stack from a list of colour indices (bottom-first). */
  setStack(colors: number[]): void {
    this.blocks.forEach((b) => b.destroy());
    this.blocks = [];
    const glyph = glyphsEnabled();
    colors.forEach((color, i) => {
      const img = this.scene.add
        .image(this.cx, this.slotY(i), blockTextureKey(color, glyph))
        .setDepth(5);
      img.setData("color", color);
      this.blocks.push(img);
    });
  }

  get size(): number {
    return this.blocks.length;
  }

  setSelected(on: boolean): void {
    this.drawGlow(on, THEME.accent);
  }

  setHint(on: boolean): void {
    this.drawGlow(on, 0x54d178);
  }

  destroy(): void {
    this.blocks.forEach((b) => b.destroy());
    this.glass.destroy();
    this.glow.destroy();
    this.zone.destroy();
  }
}
