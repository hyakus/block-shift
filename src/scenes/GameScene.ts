/**
 * Core gameplay scene: builds the board, renders tubes, handles tap-to-move
 * with animation, undo/restart/hint, and win / dead-end detection.
 */
import Phaser from "phaser";
import {
  levelSpec,
  safeBottom,
  safeTop,
  THEME,
  TOTAL_LEVELS,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from "../config";
import { drawRetroBackground } from "../ui/background";
import { drawStarRow, FONT, pixelButton, pixelText, type PixelButton } from "../ui/widgets";
import { TubeSprite } from "../render/TubeSprite";
import { VictoryFx } from "../render/VictoryFx";
import { tubeHeight, tubeWidth } from "../render/metrics";
import type { Board } from "../game/types";
import {
  applyMove,
  canContinueFor,
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
import { adsAvailable, showRewardedAd } from "../ads";
import { isUnlocked, markCompleted, recordStars } from "../game/progress";

const LIFT = 110;
const TRAVEL = 190;
const DROP = 150;

/** Undos allowed per attempt; the next undo after this is a game over. */
const UNDO_LIMIT = 5;
/**
 * Only warn "stuck" when a hard dead end is this close — i.e. the player can't
 * keep playing for more than this many moves (and can't win in that window).
 */
const STUCK_LOOKAHEAD = 3;

export class GameScene extends Phaser.Scene {
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
  /** Set once we've warned the player the current position is unwinnable. */
  private stuckNotified = false;
  /** Hints taken this attempt — the first is free, the rest cost a rewarded ad. */
  private hintsUsed = 0;
  /** Undos spent this attempt; at UNDO_LIMIT the next undo ends the level. */
  private undosUsed = 0;

  constructor() {
    super("Game");
  }

  init(data: { level: number }): void {
    this.level = data.level ?? 1;
    // Reset per-restart state (scenes are reused across restarts).
    this.tubes = [];
    this.history = [];
    this.selected = null;
    this.busy = false;
    this.moveCount = 0;
    this.overlay = null;
    this.stuckNotified = false;
    this.hintsUsed = 0;
    this.undosUsed = 0;
  }

  create(): void {
    drawRetroBackground(this);

    const gen = generateLevel(this.level);
    this.initialBoard = cloneBoard(gen.board);
    this.board = cloneBoard(gen.board);

    this.buildHud();
    this.buildTubes();
    this.victory = new VictoryFx(this);
  }

  // ---- HUD -------------------------------------------------------------

  private buildHud(): void {
    const W = VIRTUAL_WIDTH;
    const spec = levelSpec(this.level);
    const top = safeTop();

    pixelButton(this, 56, top + 42, 84, 44, "MENU", () =>
      this.scene.start("LevelSelect", { level: this.level }), { size: 10 });

    pixelText(this, W / 2, top + 28, `LEVEL ${this.level}`, 15, THEME.accentHex);
    const subtitle = [
      `${spec.colors} COLOURS`,
      ...(spec.doubledColors > 0 ? [`${spec.doubledColors} DOUBLED`] : []),
      `${spec.emptyTubes} FREE`,
    ].join("  •  ");
    pixelText(this, W / 2, top + 52, subtitle, 8, THEME.inkDim);
    this.movesText = pixelText(this, W / 2, top + 70, "MOVES  0", 9, THEME.inkDim);

    // Bottom action bar.
    const by = VIRTUAL_HEIGHT - 54 - safeBottom();
    this.undoBtn = pixelButton(this, W / 2 - 140, by, 130, 58, "UNDO", () => this.undo(), {
      size: 12,
    });
    pixelButton(this, W / 2, by, 130, 58, "RESTART", () => this.restart(), { size: 11 });
    pixelButton(this, W / 2 + 140, by, 130, 58, "HINT", () => this.hint(), {
      size: 12,
      fill: 0x2e6d7d,
    });
    this.updateHud();
  }

  private updateHud(): void {
    this.movesText.setText(`MOVES  ${this.moveCount}`);
    // Show how many undos remain; at 0 the button still works but ends the level.
    this.undoBtn.setLabel(`UNDO ${Math.max(0, UNDO_LIMIT - this.undosUsed)}`);
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
    const playTop = 92 + safeTop();
    const playBottom = VIRTUAL_HEIGHT - 84 - safeBottom();
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
    } else if (!this.stuckNotified) {
      // Soft-lock check: still have moves, but is the board actually winnable?
      // Deferred so the pour animation settles first, and gated so we run the
      // (potentially heavier) solver at most once per stuck position.
      this.time.delayedCall(260, () => this.checkSoftLock());
    }
  }

  /** Warn only when a hard dead end is imminent (out of moves within a few turns). */
  private checkSoftLock(): void {
    if (this.stuckNotified || this.overlay || this.busy) return;
    if (isSolved(this.board) || isDeadEnd(this.board)) return;
    // Can the player still play past the look-ahead window (or win in it)? If so,
    // stay quiet — only warn when they're about to run out of moves for good.
    if (canContinueFor(this.board, STUCK_LOOKAHEAD + 1)) return;
    this.stuckNotified = true;
    this.buildOverlay("STUCK", "No moves left in a turn or two", THEME.danger, [
      { label: "UNDO", fill: 0x3d3466, cb: () => this.undoFromOverlay() },
      { label: "RESTART", fill: 0x2e7d46, cb: () => this.restart() },
      {
        label: "DISMISS",
        cb: () => {
          this.overlay?.destroy();
          this.overlay = null;
        },
      },
    ]);
  }

  private playVictory(): void {
    markCompleted(this.level);
    playWin();
    this.victory?.play(this.tubes, this.board);
    // Let the bottom-to-top dissolve cascade and confetti eruption land before
    // the overlay drops in.
    this.time.delayedCall(VictoryFx.cascadeDuration() + 650, () => this.showWin());
  }

  // ---- Controls --------------------------------------------------------

  private undo(): void {
    if (this.busy || this.history.length === 0) return;
    // Out of undos: the attempt ends instead of rewinding.
    if (this.undosUsed >= UNDO_LIMIT) {
      this.showOutOfUndos();
      return;
    }
    this.undosUsed++;
    this.deselect();
    this.board = this.history.pop()!;
    this.moveCount = Math.max(0, this.moveCount - 1);
    this.stuckNotified = false; // position changed — re-evaluate winnability
    this.syncSprites();
    this.updateHud();
  }

  /** UNDO from within a win/fail/stuck overlay: dismiss it first, then undo. */
  private undoFromOverlay(): void {
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
    this.undo();
  }

  private restart(): void {
    if (this.busy) return;
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
    // REPLAY reuses this scene, so tear down the victory FX ourselves (clears
    // leftover liquid graphics and resets it so the next win animates).
    this.victory?.destroy();
    this.victory = new VictoryFx(this);

    this.selected = null;
    this.history = [];
    this.moveCount = 0;
    this.stuckNotified = false;
    this.hintsUsed = 0;
    this.undosUsed = 0;
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
    // First hint per attempt is free; after that, a rewarded ad buys one.
    if (this.hintsUsed >= 1) {
      this.showHintAdPrompt();
      return;
    }
    this.hintsUsed++;
    this.doHint();
  }

  private doHint(): void {
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

  private showHintAdPrompt(): void {
    this.buildOverlay("NEED A HINT?", "Watch a short ad for one more", THEME.accentHex, [
      {
        label: "WATCH AD",
        fill: 0x2e7d46,
        cb: () => {
          this.overlay?.destroy();
          this.overlay = null;
          this.playRewardedAd(() => this.doHint());
        },
      },
      {
        label: "CANCEL",
        cb: () => {
          this.overlay?.destroy();
          this.overlay = null;
        },
      },
    ]);
  }

  /** Show a rewarded ad for a hint: real AdMob on device, simulated on web. */
  private playRewardedAd(onReward: () => void): void {
    if (adsAvailable()) {
      void showRewardedAd().then((earned) => {
        if (earned) onReward();
      });
      return;
    }
    this.simulatedAd(onReward);
  }

  /** Timed placeholder ad used on the web build (no native ad SDK there). */
  private simulatedAd(onReward: () => void): void {
    const W = VIRTUAL_WIDTH;
    const H = VIRTUAL_HEIGHT;
    const layer = this.add.container(0, 0).setDepth(400);
    this.overlay = layer;
    const shade = this.add.rectangle(0, 0, W, H, 0x05040a, 0.96).setOrigin(0).setInteractive();
    const title = pixelText(this, W / 2, H * 0.42, "AD", 44, THEME.accentHex).setStroke("#000", 8);
    const tag = pixelText(this, W / 2, H * 0.42 + 46, "(placeholder)", 8, THEME.inkDim);
    const count = pixelText(this, W / 2, H * 0.56, "REWARD IN 3", 12);
    layer.add([shade, title, tag, count]);

    let n = 3;
    const step = (): void => {
      n -= 1;
      if (n >= 1) {
        count.setText(`REWARD IN ${n}`);
        this.time.delayedCall(1000, step);
      } else {
        layer.destroy();
        this.overlay = null;
        onReward();
      }
    };
    this.time.delayedCall(1000, step);
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
    const hasNext = this.level < TOTAL_LEVELS;
    const nextUnlocked = hasNext && isUnlocked(this.level + 1);

    const buttons: { label: string; fill?: number; cb: () => void }[] = [];
    if (hasNext) {
      buttons.push({
        label: "NEXT",
        fill: 0x2e7d46,
        cb: () => nextUnlocked && this.scene.restart({ level: this.level + 1 }),
      });
    }
    buttons.push({ label: "REPLAY", cb: () => this.restart() });
    buttons.push({
      label: "LEVELS",
      cb: () => this.scene.start("LevelSelect", { level: this.level }),
    });

    // Rate the finish against the solver's solution length ("par"): reward
    // near-optimal play. 3 stars ≈ par, dropping off as extra moves pile up.
    const par = Math.max(1, solve(this.initialBoard).moves.length);
    const stars = this.moveCount <= par + 2 ? 3 : this.moveCount <= par + 7 ? 2 : 1;
    recordStars(this.level, stars);

    this.buildOverlay(
      "SOLVED!",
      `${this.moveCount} MOVES  •  PAR ${par}`,
      THEME.good,
      buttons,
    );
    if (this.overlay) {
      const g = this.add.graphics();
      drawStarRow(g, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 - 150 + 172, 17, 46, stars);
      this.overlay.add(g);
    }
  }

  private showFail(): void {
    this.buildOverlay("NO MOVES LEFT", "THE TUBES ARE STUCK", THEME.danger, [
      { label: "UNDO", fill: 0x3d3466, cb: () => this.undoFromOverlay() },
      { label: "RESTART", fill: 0x2e7d46, cb: () => this.restart() },
      {
        label: "LEVELS",
        cb: () => this.scene.start("LevelSelect", { level: this.level }),
      },
    ]);
  }

  /** Game over from exhausting the undo budget — no UNDO button here. */
  private showOutOfUndos(): void {
    this.buildOverlay("GAME OVER", `OUT OF UNDOS (${UNDO_LIMIT} USED)`, THEME.danger, [
      { label: "RESTART", fill: 0x2e7d46, cb: () => this.restart() },
      {
        label: "LEVELS",
        cb: () => this.scene.start("LevelSelect", { level: this.level }),
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
    const bw = 126;
    const gap = 10;
    const totalW = buttons.length * bw + (buttons.length - 1) * gap;
    let bx = W / 2 - totalW / 2 + bw / 2;
    for (const b of buttons) {
      const btn = pixelButton(this, bx, py + ph - 60, bw, 56, b.label, () => b.cb(), {
        size: 12,
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
