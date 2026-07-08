/** Difficulty + level picker with lock/complete states persisted to storage. */
import Phaser from "phaser";
import { DIFFICULTIES, THEME, VIRTUAL_WIDTH } from "../config";
import { drawRetroBackground } from "../ui/background";
import { FONT, pixelButton, pixelText } from "../ui/widgets";
import {
  LEVELS_PER_DIFFICULTY,
  highestCompleted,
  isUnlocked,
} from "../game/progress";

export class LevelSelectScene extends Phaser.Scene {
  private diffIndex = 0;
  private gridLayer!: Phaser.GameObjects.Container;
  private tabRefs: { g: Phaser.GameObjects.Graphics; i: number }[] = [];

  constructor() {
    super("LevelSelect");
  }

  init(data: { diffIndex?: number }): void {
    this.diffIndex = data.diffIndex ?? this.diffIndex ?? 0;
  }

  create(): void {
    const W = VIRTUAL_WIDTH;
    drawRetroBackground(this);

    pixelButton(this, 54, 44, 76, 40, "BACK", () => this.scene.start("Menu"), {
      size: 9,
    });
    pixelText(this, W / 2 + 20, 44, "SELECT LEVEL", 15, THEME.accentHex);

    // Difficulty tabs.
    this.tabRefs = [];
    const startX = 56;
    DIFFICULTIES.forEach((d, i) => {
      const x = startX + i * 92;
      const y = 118;
      const g = this.add.graphics();
      this.tabRefs.push({ g, i });
      const label = pixelText(this, x, y, d.label, 8);
      const zone = this.add
        .zone(x, y, 86, 44)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => {
        this.diffIndex = i;
        this.paintTabs();
        this.renderGrid();
      });
      label.setDepth(1);
    });
    this.paintTabs();

    this.gridLayer = this.add.container(0, 0);
    this.renderGrid();
  }

  private paintTabs(): void {
    this.tabRefs.forEach(({ g, i }) => {
      const x = 56 + i * 92;
      const y = 118;
      const active = i === this.diffIndex;
      g.clear();
      g.fillStyle(active ? THEME.accent : THEME.panel, 1);
      g.fillRect(x - 43, y - 22, 86, 44);
      g.fillStyle(0x000000, active ? 0.0 : 0.25);
      g.fillRect(x - 43, y - 22, 86, 44);
      g.lineStyle(2, active ? 0xffffff : THEME.panelEdge, active ? 0.8 : 0.6);
      g.strokeRect(x - 43, y - 22, 86, 44);
    });
    // Re-tint labels for contrast.
    this.children.list
      .filter((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text)
      .forEach((t) => {
        const idx = DIFFICULTIES.findIndex((d) => d.label === t.text);
        if (idx >= 0) t.setColor(idx === this.diffIndex ? "#1a1730" : THEME.ink);
      });
  }

  private renderGrid(): void {
    this.gridLayer.removeAll(true);
    const W = VIRTUAL_WIDTH;
    const diff = DIFFICULTIES[this.diffIndex];
    const done = highestCompleted(diff.key);

    const info = pixelText(
      this,
      W / 2,
      178,
      `${diff.colors} COLOURS  •  ${done}/${LEVELS_PER_DIFFICULTY} DONE`,
      9,
      THEME.inkDim,
    );
    this.gridLayer.add(info);

    const cols = 3;
    const cellW = 108;
    const cellH = 92;
    const gridTop = 240;
    const startX = W / 2 - cellW;

    for (let n = 0; n < LEVELS_PER_DIFFICULTY; n++) {
      const level = n + 1;
      const col = n % cols;
      const row = Math.floor(n / cols);
      const x = startX + col * cellW;
      const y = gridTop + row * cellH;
      this.gridLayer.add(this.makeLevelButton(x, y, diff.key, level, done));
    }
  }

  private makeLevelButton(
    x: number,
    y: number,
    diffKey: string,
    level: number,
    done: number,
  ): Phaser.GameObjects.Container {
    const unlocked = isUnlocked(diffKey, level);
    const completed = level <= done;
    const w = 84;
    const h = 72;
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
      const num = pixelText(this, 0, completed ? -6 : 0, `${level}`, 20);
      c.add(num);
      if (completed) {
        const star = pixelText(this, 0, 20, "CLEAR", 7, THEME.accentHex);
        c.add(star);
      }
      c.setSize(w, h);
      // Hit area uses top-left-origin local coords (see note in widgets.ts).
      c.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, w, h),
        Phaser.Geom.Rectangle.Contains,
      );
      c.on("pointerdown", () => {
        this.scene.start("Game", { diffIndex: this.diffIndex, level });
      });
    } else {
      // Padlock glyph.
      const lock = this.add.graphics();
      lock.fillStyle(0x6a6390, 1);
      lock.fillRect(-10, 2, 20, 14);
      lock.lineStyle(4, 0x6a6390, 1);
      lock.beginPath();
      lock.arc(0, 2, 8, Math.PI, 0, false);
      lock.strokePath();
      lock.fillStyle(0x232037, 1);
      lock.fillRect(-2, 6, 4, 6);
      c.add(lock);
      const label = this.add
        .text(0, -18, `LV ${level}`, {
          fontFamily: FONT,
          fontSize: "7px",
          color: "#6a6390",
        })
        .setOrigin(0.5)
        .setResolution(2);
      c.add(label);
    }

    return c;
  }
}
