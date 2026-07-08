/**
 * Core gameplay scene: builds the board, renders tubes, handles tap-to-move
 * with animation, undo/restart/hint, and win / dead-end detection.
 */
import Phaser from "phaser";
import { DIFFICULTIES, THEME, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../config";
import { drawRetroBackground } from "../ui/background";
import { FONT, pixelButton, pixelText, type PixelButton } from "../ui/widgets";
import { TubeSprite } from "../render/TubeSprite";
import { VictoryFx } from "../render/VictoryFx";
import { tubeHeight, tubeWidth } from "../render/metrics";
import type { Board } from "../game/types";
import {
  applyMove,
  cloneBoard,
  isDeadEnd,
  isSolved,
  isTubeComplete,
  movableCount,
  topRunLength,
} from "../game/logic";
import { generateLevel } from "../game/levelGenerator";
import { solve } from "../game/solver";
import { playComplete, playPick, playPour, playWin } from "../audio/sfx";
import { LEVELS_PER_DIFFICULTY, isUnlocked, markCompleted } from "../game/progress";

const LIFT = 110;
const TRAVEL = 190;
const DROP = 150;

export class GameScene extends Phaser.Scene {
  private diffIndex = 0;
  private level = 1;

  private board: Board = [];
  private initialBoard: Board = [];
  private tubes: TubeSprite[] = [];
  private history: Board[] = [];

  private selected: number | null = null;
  private busy = false;
  private moveCount = 0;

  private movesText!: Phaser.GameObjects.Text;
  private undoBtn!: PixelButton;
  private overlay: Phaser.GameObjects.Container | null = null;
  private victory?: VictoryFx;

  constructor() {
    super("Game");
  }

  init(data: { diffIndex: number; level: number }): void {
    this.diffIndex = data.diffIndex ?? 0;
    this.level = data.level ?? 1;
    // Reset per-restart state (scenes are reused across restarts).
    this.tubes = [];
    this.history = [];
    this.selected = null;
    this.busy = false;
    this.moveCount = 0;
    this.overlay = null;
  }

  create(): void {
    drawRetroBackground(this);
    const diff = DIFFICULTIES[this.diffIndex];

    const gen = generateLevel(diff, this.diffIndex, this.level);
    this.initialBoard = cloneBoard(gen.board);
    this.board = cloneBoard(gen.board);

    this.buildHud();
    this.buildTubes();
    this.victory = new VictoryFx(this);
  }

  // ---- HUD -------------------------------------------------------------

  private buildHud(): void {
    const W = VIRTUAL_WIDTH;
    const diff = DIFFICULTIES[this.diffIndex];

    pixelButton(this, 50, 40, 68, 36, "MENU", () => this.scene.start("LevelSelect", {
      diffIndex: this.diffIndex,
    }), { size: 8 });

    pixelText(this, W / 2, 30, `${diff.label}  •  LV ${this.level}`, 13, THEME.accentHex);
    this.movesText = pixelText(this, W / 2, 58, "MOVES  0", 10, THEME.inkDim);

    // Bottom action bar.
    const by = VIRTUAL_HEIGHT - 48;
    this.undoBtn = pixelButton(this, W / 2 - 128, by, 108, 46, "UNDO", () => this.undo(), {
      size: 11,
    });
    pixelButton(this, W / 2, by, 108, 46, "RESTART", () => this.restart(), { size: 10 });
    pixelButton(this, W / 2 + 128, by, 108, 46, "HINT", () => this.hint(), {
      size: 11,
      fill: 0x2e6d7d,
    });
    this.undoBtn.setEnabled(false);
  }

  private updateHud(): void {
    this.movesText.setText(`MOVES  ${this.moveCount}`);
    this.undoBtn.setEnabled(this.history.length > 0 && !this.busy);
  }

  // ---- Board / tube layout --------------------------------------------

  private buildTubes(): void {
    this.tubes.forEach((t) => t.destroy());
    this.tubes = [];
    const positions = this.layout(this.board.length);
    this.board.forEach((stack, i) => {
      const p = positions[i];
      const tube = new TubeSprite(this, i, p.cx, p.top);
      tube.setStack(stack);
      tube.onTap((idx) => this.onTapTube(idx));
      this.tubes.push(tube);
    });
  }

  private layout(count: number): { cx: number; top: number }[] {
    const rows = Math.ceil(count / 6);
    const perRow = Math.ceil(count / rows);
    const th = tubeHeight(4);
    const tw = tubeWidth();
    const availW = VIRTUAL_WIDTH - 24;
    const spacing = Math.min(tw + 14, availW / perRow);
    const rowGap = rows > 1 ? 26 : 0;
    const totalH = rows * th + (rows - 1) * rowGap;
    const playTop = 92;
    const playBottom = VIRTUAL_HEIGHT - 84;
    const startY = playTop + (playBottom - playTop - totalH) / 2;

    const positions: { cx: number; top: number }[] = [];
    for (let r = 0; r < rows; r++) {
      const inRow = r < rows - 1 ? perRow : count - perRow * (rows - 1);
      const rowW = inRow * spacing;
      const startX = (VIRTUAL_WIDTH - rowW) / 2 + spacing / 2;
      const top = startY + r * (th + rowGap);
      for (let k = 0; k < inRow; k++) {
        positions.push({ cx: startX + k * spacing, top });
      }
    }
    return positions;
  }

  // ---- Input / moves ---------------------------------------------------

  private onTapTube(i: number): void {
    if (this.busy || this.overlay) return;

    if (this.selected === null) {
      if (this.board[i].length === 0) return; // nothing to lift
      this.select(i);
      return;
    }

    const from = this.selected;
    if (i === from) {
      this.deselect();
      return;
    }

    if (movableCount(this.board, from, i) > 0) {
      this.selected = null;
      void this.doMove(from, i);
    } else {
      // Invalid target: drop the current selection, maybe pick up the new tube.
      this.deselect();
      if (this.board[i].length > 0) this.select(i);
    }
  }

  private select(i: number): void {
    this.selected = i;
    const tube = this.tubes[i];
    tube.setSelected(true);
    playPick();
    const run = topRunLength(this.board[i]);
    const size = tube.blocks.length;
    for (let k = 0; k < run; k++) {
      const sprite = tube.blocks[size - run + k];
      sprite.setDepth(20);
      this.tweens.add({
        targets: sprite,
        y: tube.liftedY(k),
        duration: LIFT,
        ease: "Back.easeOut",
      });
    }
  }

  private deselect(): void {
    if (this.selected === null) return;
    const tube = this.tubes[this.selected];
    tube.setSelected(false);
    this.restTube(tube);
    this.selected = null;
  }

  /** Return every block in a tube to its resting slot position. */
  private restTube(tube: TubeSprite): void {
    tube.blocks.forEach((sprite, idx) => {
      sprite.setDepth(5);
      this.tweens.add({
        targets: sprite,
        x: tube.cx,
        y: tube.slotY(idx),
        duration: LIFT,
        ease: "Sine.easeIn",
      });
    });
  }

  private tweenP(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  private async doMove(from: number, to: number): Promise<void> {
    this.busy = true;
    this.updateHud();

    const src = this.tubes[from];
    const dst = this.tubes[to];
    const n = movableCount(this.board, from, to);
    const run = topRunLength(this.board[from]);
    const dstSize = this.board[to].length;

    src.setSelected(false);

    // Any lifted-but-not-moving blocks settle back into the source.
    const staying = run - n;
    const pending: Promise<void>[] = [];
    for (let k = 0; k < staying; k++) {
      const sprite = src.blocks[src.blocks.length - run + k];
      sprite.setDepth(5);
      pending.push(
        this.tweenP({
          targets: sprite,
          y: src.slotY(src.blocks.length - run + k),
          duration: LIFT,
          ease: "Sine.easeIn",
        }),
      );
    }

    // The top n blocks travel across and drop into the destination.
    const moving = src.blocks.slice(src.blocks.length - n);
    moving.forEach((sprite, k) => {
      sprite.setDepth(40);
      const p = this.tweenP({
        targets: sprite,
        x: dst.cx,
        y: dst.liftedY(k),
        duration: TRAVEL,
        ease: "Sine.easeInOut",
      }).then(() =>
        this.tweenP({
          targets: sprite,
          y: dst.slotY(dstSize + k),
          duration: DROP,
          ease: "Quad.easeIn",
        }).then(() => {
          sprite.setDepth(5);
        }),
      );
      pending.push(p);
    });

    await Promise.all(pending);

    // Commit model + sprite ownership.
    this.history.push(cloneBoard(this.board));
    applyMove(this.board, from, to);
    const movedSprites = src.blocks.splice(src.blocks.length - n, n);
    movedSprites.forEach((s) => dst.blocks.push(s));

    this.moveCount++;
    this.busy = false;
    this.updateHud();

    // Landing plop, plus a completion chime if this move finished a tube
    // (skipped on the winning move — the victory fanfare covers it).
    playPour();
    if (isTubeComplete(this.board[to]) && !isSolved(this.board)) {
      this.time.delayedCall(110, () => playComplete());
    }

    this.checkEnd();
  }

  private checkEnd(): void {
    if (isSolved(this.board)) {
      this.time.delayedCall(200, () => this.playVictory());
    } else if (isDeadEnd(this.board)) {
      this.time.delayedCall(220, () => this.showFail());
    }
  }

  private playVictory(): void {
    markCompleted(DIFFICULTIES[this.diffIndex].key, this.level);
    playWin();
    this.victory?.play(this.tubes, this.board);
    // Let the bottom-to-top dissolve cascade and confetti eruption land before
    // the overlay drops in.
    this.time.delayedCall(VictoryFx.cascadeDuration() + 650, () => this.showWin());
  }

  // ---- Controls --------------------------------------------------------

  private undo(): void {
    if (this.busy || this.history.length === 0 || this.overlay) return;
    this.deselect();
    this.board = this.history.pop()!;
    this.moveCount = Math.max(0, this.moveCount - 1);
    this.syncSprites();
    this.updateHud();
  }

  private restart(): void {
    if (this.busy) return;
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
    this.selected = null;
    this.history = [];
    this.moveCount = 0;
    this.board = cloneBoard(this.initialBoard);
    this.syncSprites();
    this.updateHud();
  }

  /** Rebuild all block sprites to match the current board (used by undo/restart). */
  private syncSprites(): void {
    this.tubes.forEach((tube, i) => {
      tube.setSelected(false);
      tube.setStack(this.board[i]);
    });
  }

  private hint(): void {
    if (this.busy || this.overlay) return;
    this.deselect();
    const res = solve(this.board);
    if (!res.solvable || !res.firstMove) {
      this.flashMessage(res.solvable ? "THINKING..." : "NO SOLUTION", THEME.danger);
      return;
    }
    const { from, to } = res.firstMove;
    this.tubes[from].setHint(true);
    this.tubes[to].setHint(true);
    this.time.delayedCall(1400, () => {
      this.tubes[from]?.setHint(false);
      this.tubes[to]?.setHint(false);
    });
  }

  private flashMessage(text: string, color: string): void {
    const t = pixelText(this, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, text, 14, color)
      .setDepth(200)
      .setStroke("#000000", 6);
    this.tweens.add({
      targets: t,
      y: t.y - 40,
      alpha: 0,
      duration: 1100,
      onComplete: () => t.destroy(),
    });
  }

  // ---- End-of-level overlays ------------------------------------------

  private showWin(): void {
    const hasNext = this.level < LEVELS_PER_DIFFICULTY;
    const nextUnlocked =
      hasNext && isUnlocked(DIFFICULTIES[this.diffIndex].key, this.level + 1);

    const buttons: { label: string; fill?: number; cb: () => void }[] = [];
    if (hasNext) {
      buttons.push({
        label: "NEXT",
        fill: 0x2e7d46,
        cb: () =>
          nextUnlocked &&
          this.scene.restart({ diffIndex: this.diffIndex, level: this.level + 1 }),
      });
    }
    buttons.push({ label: "REPLAY", cb: () => this.restart() });
    buttons.push({
      label: "LEVELS",
      cb: () => this.scene.start("LevelSelect", { diffIndex: this.diffIndex }),
    });

    this.buildOverlay("SOLVED!", `CLEARED IN ${this.moveCount} MOVES`, THEME.good, buttons);
  }

  private showFail(): void {
    this.buildOverlay("NO MOVES LEFT", "THE TUBES ARE STUCK", THEME.danger, [
      { label: "UNDO", fill: 0x3d3466, cb: () => this.undo() },
      { label: "RESTART", fill: 0x2e7d46, cb: () => this.restart() },
      {
        label: "LEVELS",
        cb: () => this.scene.start("LevelSelect", { diffIndex: this.diffIndex }),
      },
    ]);
  }

  private buildOverlay(
    title: string,
    subtitle: string,
    titleColor: string,
    buttons: { label: string; fill?: number; cb: () => void }[],
  ): void {
    const W = VIRTUAL_WIDTH;
    const H = VIRTUAL_HEIGHT;
    const layer = this.add.container(0, 0).setDepth(300);
    this.overlay = layer;

    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0).setInteractive();
    const pw = W - 72;
    const ph = 300;
    const px = 36;
    const py = H / 2 - ph / 2;
    const panel = this.add.graphics();
    panel.fillStyle(THEME.panelEdge, 1);
    panel.fillRoundedRect(px - 4, py - 4, pw + 8, ph + 8, 16);
    panel.fillStyle(THEME.panel, 1);
    panel.fillRoundedRect(px, py, pw, ph, 14);

    const tt = pixelText(this, W / 2, py + 60, title, 24, titleColor).setStroke("#000000", 8);
    const st = this.add
      .text(W / 2, py + 108, subtitle, {
        fontFamily: FONT,
        fontSize: "9px",
        color: THEME.inkDim,
      })
      .setOrigin(0.5)
      .setResolution(2);

    layer.add([shade, panel, tt, st]);

    // Lay buttons out in a row.
    const bw = 120;
    const gap = 12;
    const totalW = buttons.length * bw + (buttons.length - 1) * gap;
    let bx = W / 2 - totalW / 2 + bw / 2;
    for (const b of buttons) {
      const btn = pixelButton(this, bx, py + ph - 56, bw, 48, b.label, () => b.cb(), {
        size: 11,
        fill: b.fill,
      });
      layer.add(btn.container);
      bx += bw + gap;
    }

    // Little celebratory pop.
    tt.setScale(0.6);
    this.tweens.add({ targets: tt, scale: 1, duration: 320, ease: "Back.easeOut" });
  }
}
