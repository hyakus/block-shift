/**
 * Victory celebration effects:
 *   1. each completed tube's blocks "pixel-dissolve" one at a time, bottom to
 *      top, bursting into a shower of coloured pixels,
 *   2. an animated pixel-art liquid of the same colour sits behind the blocks
 *      and is revealed as they crumble away, then gently waves/sloshes,
 *   3. as each tube's TOP block dissolves, confetti erupts up out of its mouth.
 *
 * Self-contained: it drives its own per-frame liquid redraw off the scene's
 * `update` event and tears everything down on scene shutdown.
 */
import Phaser from "phaser";
import { BLOCK_COLORS } from "../config";
import { BLOCK_H, BLOCK_W } from "./metrics";
import { darkenHex, lightenHex } from "./colors";
import type { TubeSprite } from "./TubeSprite";
import type { Board } from "../game/types";

interface Liquid {
  g: Phaser.GameObjects.Graphics;
  cx: number;
  floorY: number;
  surfaceY: number;
  base: number;
  hi: number;
  surf: number;
  sh: number;
  phase: number;
}

const CELL = 4; // pixel-art quantisation of the liquid surface
const STAGGER = 160; // ms between one block dissolving and the next (bottom→top)

export class VictoryFx {
  private scene: Phaser.Scene;
  private liquids: Liquid[] = [];
  private transient: Phaser.GameObjects.GameObject[] = [];
  private started = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Time (ms) from play() until the celebration's dissolve cascade finishes. */
  static cascadeDuration(): number {
    return STAGGER * 3 + 260;
  }

  /** Kick off the celebration for the solved board. */
  play(tubes: TubeSprite[], board: Board): void {
    if (this.started) return;
    this.started = true;

    tubes.forEach((tube, i) => {
      const stack = board[i];
      if (stack.length === 0) return; // empty tube: nothing to dissolve
      const color = BLOCK_COLORS[stack[0]];
      this.addLiquid(tube, color, i);
      this.dissolveTube(tube, color);
    });

    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Dissolve a tube's blocks one at a time, bottom to top. */
  private dissolveTube(tube: TubeSprite, color: number): void {
    const blocks = tube.blocks.slice();
    tube.blocks = []; // detach so the game scene stops referencing them
    const top = blocks.length - 1;

    blocks.forEach((block, i) => {
      this.scene.time.delayedCall(i * STAGGER, () => {
        this.burstBlock(tube, i, color);
        this.scene.tweens.add({
          targets: block,
          alpha: 0,
          scaleY: 0.55,
          duration: 220,
          ease: "Quad.easeIn",
          onComplete: () => block.destroy(),
        });
        // The very top block clears the mouth — fire confetti out of the tube.
        if (i === top) this.tubeConfetti(tube);
      });
    });
  }

  /** A puff of coloured pixels bursting from block `i`'s position. */
  private burstBlock(tube: TubeSprite, i: number, color: number): void {
    const emitter = this.scene.add
      .particles(tube.cx, tube.slotY(i), "fx-pixel", {
        tint: [color, lightenHex(color, 0.35), darkenHex(color, 0.3)],
        lifespan: { min: 360, max: 640 },
        speed: { min: 8, max: 66 },
        angle: { min: 0, max: 360 },
        gravityY: 320,
        scale: { start: 1.4, end: 0 },
        alpha: { start: 1, end: 0 },
        quantity: 0,
        emitZone: {
          type: "random",
          source: new Phaser.Geom.Rectangle(
            -BLOCK_W / 2,
            -BLOCK_H / 2,
            BLOCK_W,
            BLOCK_H,
          ) as Phaser.Types.GameObjects.Particles.RandomZoneSource,
        },
      })
      .setDepth(6);
    emitter.explode(20);
    this.transient.push(emitter);
    this.scene.time.delayedCall(800, () => emitter.destroy());
  }

  /** Confetti fountain shooting up out of a tube's mouth. */
  private tubeConfetti(tube: TubeSprite): void {
    const emitter = this.scene.add
      .particles(tube.cx, tube.top + 2, "fx-confetti", {
        tint: BLOCK_COLORS,
        lifespan: 2400,
        speed: { min: 260, max: 500 },
        angle: { min: 250, max: 290 }, // straight up (270) with a slight spread
        gravityY: 560,
        rotate: { start: 0, end: 720 },
        scale: { min: 0.7, max: 1.25 },
        alpha: { start: 1, end: 0.85 },
        quantity: 0,
      })
      .setDepth(320);
    emitter.explode(34);
    this.transient.push(emitter);
    this.scene.time.delayedCall(3200, () => emitter.destroy());
  }

  private addLiquid(tube: TubeSprite, base: number, index: number): void {
    // Full height, behind the blocks (depth 4 < blocks' depth 5): the blocks
    // hide it until they dissolve, revealing the liquid bottom-to-top.
    const g = this.scene.add.graphics().setDepth(4).setAlpha(0);
    this.scene.tweens.add({ targets: g, alpha: 1, duration: 180 });
    this.liquids.push({
      g,
      cx: tube.cx,
      floorY: tube.slotY(0) + BLOCK_H / 2,
      surfaceY: tube.slotY(tube.capacity - 1) - BLOCK_H / 2,
      base,
      hi: lightenHex(base, 0.28),
      surf: lightenHex(base, 0.55),
      sh: darkenHex(base, 0.3),
      phase: index * 1.7,
    });
    this.transient.push(g);
  }

  private onUpdate = (time: number): void => {
    const t = time / 1000;
    for (const L of this.liquids) this.drawLiquid(L, t);
  };

  private drawLiquid(L: Liquid, t: number): void {
    const g = L.g;
    g.clear();
    const left = L.cx - BLOCK_W / 2;

    for (let x = 0; x < BLOCK_W; x += CELL) {
      const wave =
        Math.sin(x * 0.18 + t * 3.0 + L.phase) * 2.4 +
        Math.sin(x * 0.36 - t * 2.1 + L.phase) * 1.4;
      let topY = L.surfaceY + wave;
      topY = Math.round(topY / 2) * 2; // chunky pixel steps
      const wx = left + x;

      g.fillStyle(L.base, 1);
      g.fillRect(wx, topY, CELL, L.floorY - topY);
      // Bright surface line.
      g.fillStyle(L.surf, 1);
      g.fillRect(wx, topY, CELL, 3);
      // Highlight just under the surface.
      g.fillStyle(L.hi, 1);
      g.fillRect(wx, topY + 3, CELL, 2);
      // Shadow pooling at the bottom.
      g.fillStyle(L.sh, 1);
      g.fillRect(wx, L.floorY - 4, CELL, 4);
    }
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.transient.forEach((o) => o.destroy());
    this.transient = [];
    this.liquids = [];
    this.started = false;
  }
}
