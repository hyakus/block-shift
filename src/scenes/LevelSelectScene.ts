/** Paged, numbered level picker with lock/complete + star state from storage. */
import Phaser from "phaser";
import { levelSpec, safeTop, THEME, TOTAL_LEVELS, VIRTUAL_WIDTH } from "../config";
import { drawRetroBackground } from "../ui/background";
import { drawStarRow, FONT, pixelButton, pixelText } from "../ui/widgets";
import { bestStars, highestCompleted, isUnlocked } from "../game/progress";

const PER_PAGE = 20; // 4 columns x 5 rows
const COLS = 4;
const PAGES = Math.ceil(TOTAL_LEVELS / PER_PAGE);

// Swipe tuning.
const DRAG_DEADZONE = 8; // px of travel before a press becomes a drag
const COMMIT_RATIO = 0.22; // fraction of the width to flick past to turn the page
const EDGE_RESIST = 0.32; // rubber-band factor when dragging past the first/last page

export class LevelSelectScene extends Phaser.Scene {
  private page = 0;
  private pageLayer!: Phaser.GameObjects.Container;
  private pageLabel!: Phaser.GameObjects.Text;
  private turning = false;

  // Drag/swipe state.
  private dragActive = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private incoming?: Phaser.GameObjects.Container;
  private incomingDelta = 0; // -1 (prev) / +1 (next) / 0 (none) currently peeking in

  constructor() {
    super("LevelSelect");
  }

  init(data: { level?: number; page?: number }): void {
    if (typeof data.page === "number") this.page = data.page;
    else if (typeof data.level === "number") this.page = Math.floor((data.level - 1) / PER_PAGE);
    else this.page = Math.floor(highestCompleted() / PER_PAGE); // page of next-to-play
    this.page = Phaser.Math.Clamp(this.page, 0, PAGES - 1);

    // Reset transient state (scenes are reused across restarts).
    this.turning = false;
    this.dragActive = false;
    this.dragMoved = false;
    this.incoming = undefined;
    this.incomingDelta = 0;
  }

  create(): void {
    const W = VIRTUAL_WIDTH;
    const top = safeTop();
    drawRetroBackground(this);

    pixelButton(this, 60, top + 46, 92, 48, "BACK", () => this.scene.start("Menu"), {
      size: 11,
    });
    pixelText(this, W / 2 + 24, top + 46, "SELECT LEVEL", 15, THEME.accentHex);

    // Page navigation.
    const navY = top + 116;
    pixelButton(this, 60, navY, 72, 54, "<", () => this.turn(-1), { size: 18 });
    pixelButton(this, W - 60, navY, 72, 54, ">", () => this.turn(1), { size: 18 });
    this.pageLabel = pixelText(this, W / 2, navY, "", 11, THEME.ink);

    this.pageLayer = this.buildPage(this.page);
    this.setPageLabel(this.page);

    // Swipe to page, on touch and mouse alike. Handled at the scene level so a
    // drag can start anywhere on the grid (or empty space); level tiles only
    // launch on release when the gesture wasn't a drag (see makeLevelTile).
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("pointerupoutside", this.onPointerUp, this);
  }

  // ---- Paging ----------------------------------------------------------

  /** Turn a page via the arrow buttons (ignored mid-swipe / mid-animation). */
  private turn(dir: number): void {
    if (this.turning || this.dragMoved) return;
    const next = Phaser.Math.Clamp(this.page + dir, 0, PAGES - 1);
    if (next === this.page) return;
    const incoming = this.buildPage(next);
    incoming.x = dir * VIRTUAL_WIDTH;
    this.commitTurn(next, dir, incoming);
  }

  /** Slide `incoming` in and the current page out, adopting the new page. */
  private commitTurn(
    nextPage: number,
    dir: number,
    incoming: Phaser.GameObjects.Container,
  ): void {
    this.turning = true;
    const old = this.pageLayer;
    this.tweens.add({
      targets: old,
      x: -dir * VIRTUAL_WIDTH,
      duration: 240,
      ease: "Cubic.easeInOut",
      onComplete: () => old.destroy(),
    });
    this.tweens.add({
      targets: incoming,
      x: 0,
      duration: 240,
      ease: "Cubic.easeInOut",
      onComplete: () => {
        this.turning = false;
      },
    });
    this.pageLayer = incoming;
    this.page = nextPage;
    this.setPageLabel(nextPage);
  }

  /** Abort an in-progress drag: settle the current page back and drop the peek. */
  private snapBack(): void {
    const incoming = this.incoming;
    const delta = this.incomingDelta;
    this.incoming = undefined;
    this.incomingDelta = 0;
    this.turning = true;
    this.tweens.add({
      targets: this.pageLayer,
      x: 0,
      duration: 180,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.turning = false;
      },
    });
    if (incoming) {
      this.tweens.add({
        targets: incoming,
        x: delta * VIRTUAL_WIDTH,
        duration: 180,
        ease: "Cubic.easeOut",
        onComplete: () => incoming.destroy(),
      });
    }
  }

  /** Ensure the neighbour page for `delta` (or none, at a boundary) is prepared. */
  private setIncoming(delta: number): void {
    if (delta === this.incomingDelta) return;
    this.incoming?.destroy();
    this.incoming = undefined;
    this.incomingDelta = 0;
    if (delta === 0) return;
    const target = this.page + delta;
    if (target < 0 || target > PAGES - 1) return; // boundary — no page to peek
    this.incoming = this.buildPage(target);
    this.incoming.x = delta * VIRTUAL_WIDTH;
    this.incomingDelta = delta;
  }

  // ---- Pointer / swipe -------------------------------------------------

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.turning) return;
    this.dragActive = true;
    this.dragMoved = false;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragActive || this.turning) return;
    const dx = pointer.x - this.dragStartX;
    const dy = pointer.y - this.dragStartY;

    if (!this.dragMoved) {
      if (Math.abs(dx) < DRAG_DEADZONE) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        // Predominantly vertical — not a page swipe; bow out.
        this.dragActive = false;
        return;
      }
      this.dragMoved = true;
    }

    const delta = Math.abs(dx) < 4 ? 0 : dx < 0 ? 1 : -1;
    this.setIncoming(delta);
    // Rubber-band when there's no page to bring in (first/last page).
    const x = this.incoming ? dx : dx * EDGE_RESIST;
    this.pageLayer.x = x;
    if (this.incoming) this.incoming.x = x + this.incomingDelta * VIRTUAL_WIDTH;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragActive) return;
    this.dragActive = false;
    if (!this.dragMoved) return; // a tap — the tile handles launching

    const dx = pointer.x - this.dragStartX;
    const flickedEnough = Math.abs(dx) > VIRTUAL_WIDTH * COMMIT_RATIO;
    if (this.incoming && flickedEnough) {
      const delta = this.incomingDelta;
      const incoming = this.incoming;
      this.incoming = undefined;
      this.incomingDelta = 0;
      this.commitTurn(this.page + delta, delta, incoming);
    } else {
      this.snapBack();
    }
  }

  // ---- Rendering -------------------------------------------------------

  private setPageLabel(pageIndex: number): void {
    const first = pageIndex * PER_PAGE + 1;
    const last = Math.min(TOTAL_LEVELS, first + PER_PAGE - 1);
    this.pageLabel.setText(`LEVELS ${first}-${last}   (${pageIndex + 1}/${PAGES})`);
  }

  /** Build a page's grid of tiles as a container positioned at x = 0. */
  private buildPage(pageIndex: number): Phaser.GameObjects.Container {
    const W = VIRTUAL_WIDTH;
    const layer = this.add.container(0, 0);
    const first = pageIndex * PER_PAGE + 1;
    const cellW = 108;
    const cellH = 100;
    const gridTop = safeTop() + 220;
    const startX = W / 2 - ((COLS - 1) / 2) * cellW;

    for (let i = 0; i < PER_PAGE; i++) {
      const level = first + i;
      if (level > TOTAL_LEVELS) break;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      layer.add(this.makeLevelTile(startX + col * cellW, gridTop + row * cellH, level));
    }
    return layer;
  }

  private makeLevelTile(x: number, y: number, level: number): Phaser.GameObjects.Container {
    const done = highestCompleted();
    const unlocked = isUnlocked(level);
    const completed = level <= done;
    const stars = bestStars(level);
    const w = 94;
    const h = 88;
    const c = this.add.container(x, y);

    const g = this.add.graphics();
    const bg = completed ? 0x2e7d46 : unlocked ? THEME.panelEdge : 0x232037;
    g.fillStyle(0x000000, 0.35);
    g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    g.fillStyle(bg, 1);
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(0xffffff, unlocked ? 0.16 : 0.05);
    g.fillRect(-w / 2, -h / 2, w, 3);
    g.fillRect(-w / 2, -h / 2, 3, h);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(-w / 2, h / 2 - 3, w, 3);
    g.fillRect(w / 2 - 3, -h / 2, 3, h);
    c.add(g);

    if (unlocked) {
      c.add(pixelText(this, 0, completed ? -15 : 0, `${level}`, 24));
      if (completed) {
        const sg = this.add.graphics();
        drawStarRow(sg, 0, 24, 9, 20, stars);
        c.add(sg);
      }
      c.setSize(w, h);
      c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
      // Launch on release, and only if the press wasn't a swipe (dragMoved). This
      // lets a swipe that begins on a tile turn the page instead of starting it.
      c.on("pointerup", () => {
        if (!this.dragMoved) this.scene.start("Game", { level });
      });
    } else {
      const lock = this.add.graphics();
      lock.fillStyle(0x6a6390, 1);
      lock.fillRect(-9, 2, 18, 13);
      lock.lineStyle(4, 0x6a6390, 1);
      lock.beginPath();
      lock.arc(0, 2, 7, Math.PI, 0, false);
      lock.strokePath();
      c.add(lock);
      const s = levelSpec(level);
      c.add(
        this.add
          .text(0, -20, `${s.colors}c`, {
            fontFamily: FONT,
            fontSize: "8px",
            color: "#6a6390",
          })
          .setOrigin(0.5)
          .setResolution(2),
      );
    }
    return c;
  }
}
