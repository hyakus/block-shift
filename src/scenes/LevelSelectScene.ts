/** Paged, numbered level picker with lock/complete + star state from storage. */
import Phaser from "phaser";
import { levelSpec, safeTop, THEME, TOTAL_LEVELS, VIRTUAL_WIDTH } from "../config";
import { drawRetroBackground } from "../ui/background";
import { drawStarRow, FONT, pixelButton, pixelText } from "../ui/widgets";
import { bestStars, highestCompleted, isUnlocked } from "../game/progress";

const PER_PAGE = 20; // 4 columns x 5 rows
const COLS = 4;
const PAGES = Math.ceil(TOTAL_LEVELS / PER_PAGE);

export class LevelSelectScene extends Phaser.Scene {
  private page = 0;
  private pageLayer!: Phaser.GameObjects.Container;
  private pageLabel!: Phaser.GameObjects.Text;
  private turning = false;

  constructor() {
    super("LevelSelect");
  }

  init(data: { level?: number; page?: number }): void {
    if (typeof data.page === "number") this.page = data.page;
    else if (typeof data.level === "number") this.page = Math.floor((data.level - 1) / PER_PAGE);
    else this.page = Math.floor(highestCompleted() / PER_PAGE); // page of next-to-play
    this.page = Phaser.Math.Clamp(this.page, 0, PAGES - 1);
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

    this.renderPage();
  }

  private turn(dir: number): void {
    if (this.turning) return;
    const next = Phaser.Math.Clamp(this.page + dir, 0, PAGES - 1);
    if (next === this.page) return;
    this.page = next;
    this.renderPage(dir);
  }

  /** Build the current page; when `dir` is set, slide it in from that side. */
  private renderPage(dir = 0): void {
    const W = VIRTUAL_WIDTH;
    const first = this.page * PER_PAGE + 1;
    const last = Math.min(TOTAL_LEVELS, first + PER_PAGE - 1);
    this.pageLabel.setText(`LEVELS ${first}-${last}   (${this.page + 1}/${PAGES})`);

    const layer = this.add.container(dir === 0 ? 0 : dir * W, 0);
    const cellW = 108;
    const cellH = 100;
    const gridTop = safeTop() + 186;
    const startX = W / 2 - ((COLS - 1) / 2) * cellW;

    for (let i = 0; i < PER_PAGE; i++) {
      const level = first + i;
      if (level > TOTAL_LEVELS) break;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      layer.add(this.makeLevelTile(startX + col * cellW, gridTop + row * cellH, level));
    }

    const old = this.pageLayer as Phaser.GameObjects.Container | undefined;
    if (dir === 0 || !old) {
      old?.destroy();
      this.pageLayer = layer;
      return;
    }
    // Slide the old page out and the new page in.
    this.turning = true;
    this.tweens.add({
      targets: old,
      x: -dir * W,
      duration: 260,
      ease: "Cubic.easeInOut",
      onComplete: () => old.destroy(),
    });
    this.tweens.add({
      targets: layer,
      x: 0,
      duration: 260,
      ease: "Cubic.easeInOut",
      onComplete: () => {
        this.turning = false;
      },
    });
    this.pageLayer = layer;
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
      c.on("pointerdown", () => this.scene.start("Game", { level }));
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
