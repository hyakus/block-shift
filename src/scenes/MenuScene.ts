/** Retro title screen: animated pixel logo, play / how-to, progress readout. */
import Phaser from "phaser";
import { safeBottom, safeTop, THEME, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../config";
import { drawRetroBackground } from "../ui/background";
import { FONT, pixelButton, pixelText } from "../ui/widgets";
import { blockTextureKey } from "../render/textures";
import { totalProgress } from "../game/progress";
import { isMuted, playBlip, setMuted, unlockAudio } from "../audio/sfx";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create(): void {
    const W = VIRTUAL_WIDTH;
    const H = VIRTUAL_HEIGHT;
    drawRetroBackground(this);

    // Layout anchored to fractions of the (device-derived) height so the screen
    // fills nicely from tall phones down to 16:9.
    const blocksY = Math.round(H * 0.17);
    const titleY = Math.round(H * 0.3);
    const playY = Math.round(H * 0.55);

    // Decorative bobbing blocks above the title.
    const demoColors = [0, 1, 2, 3, 4, 5];
    demoColors.forEach((c, i) => {
      const bx = W / 2 - (demoColors.length - 1) * 26 + i * 52;
      const img = this.add.image(bx, blocksY, blockTextureKey(c)).setScale(1.15);
      this.tweens.add({
        targets: img,
        y: blocksY - 12,
        duration: 700 + i * 90,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    });

    // Title.
    const title1 = pixelText(this, W / 2, titleY, "BLOCK", 44, THEME.accentHex);
    const title2 = pixelText(this, W / 2, titleY + 56, "SHIFT", 44, THEME.inkDim);
    title1.setStroke("#000000", 8);
    title2.setStroke("#000000", 8);
    this.tweens.add({
      targets: [title1, title2],
      scale: 1.04,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    pixelText(this, W / 2, titleY + 110, "- PIXEL SORT PUZZLE -", 10, THEME.inkDim);

    // Buttons.
    pixelButton(this, W / 2, playY, 240, 56, "PLAY", () => this.scene.start("LevelSelect"), {
      fill: 0x2e7d46,
      size: 18,
    });
    pixelButton(this, W / 2, playY + 74, 240, 48, "HOW TO PLAY", () => this.showHelp(), {
      size: 11,
    });

    // Progress.
    const pct = Math.round(totalProgress() * 100);
    pixelText(this, W / 2, Math.round(H * 0.72), `PROGRESS  ${pct}%`, 10, THEME.inkDim);

    // Blinking prompt + footer.
    const blink = pixelText(
      this,
      W / 2,
      Math.round(H * 0.8),
      "TAP PLAY TO BEGIN",
      9,
      THEME.accentHex,
    );
    this.tweens.add({
      targets: blink,
      alpha: 0.15,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });
    pixelText(this, W / 2, H - 30 - safeBottom(), "v0.1  •  MADE WITH PHASER", 7, THEME.inkDim);

    this.buildSoundToggle();
  }

  /** Top-right speaker button that toggles (and persists) sound on/off. */
  private buildSoundToggle(): void {
    const ix = VIRTUAL_WIDTH - 42;
    const iy = Math.max(52, safeTop() + 32);
    const g = this.add.graphics();

    const draw = () => {
      g.clear();
      const on = !isMuted();
      const col = on ? THEME.accent : 0x6a6390;

      // Rounded panel background.
      g.fillStyle(THEME.panel, 0.85);
      g.fillRoundedRect(ix - 24, iy - 22, 48, 44, 9);
      g.lineStyle(2, THEME.panelEdge, 1);
      g.strokeRoundedRect(ix - 24, iy - 22, 48, 44, 9);

      // Speaker: box + cone opening to the right.
      const sx = ix - 5;
      g.fillStyle(col, 1);
      g.fillRect(sx - 11, iy - 5, 7, 10);
      g.fillTriangle(sx + 4, iy - 10, sx + 4, iy + 10, sx - 4, iy);

      if (on) {
        // Sound waves.
        g.lineStyle(2.5, col, 1);
        g.beginPath();
        g.arc(sx + 4, iy, 8, -0.7, 0.7, false);
        g.strokePath();
        g.beginPath();
        g.arc(sx + 4, iy, 13, -0.7, 0.7, false);
        g.strokePath();
      } else {
        // Muted slash.
        g.lineStyle(3, 0xff4d5b, 1);
        g.lineBetween(sx - 11, iy - 12, sx + 15, iy + 12);
      }
    };
    draw();

    const label = this.add
      .text(ix, iy + 26, "SOUND", {
        fontFamily: FONT,
        fontSize: "6px",
        color: THEME.inkDim,
      })
      .setOrigin(0.5)
      .setResolution(2);
    label.setDepth(1);

    const zone = this.add
      .zone(ix, iy, 52, 48)
      .setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => {
      const nowMuted = !isMuted();
      setMuted(nowMuted);
      draw();
      if (!nowMuted) {
        unlockAudio();
        playBlip();
      }
    });
  }

  private showHelp(): void {
    const W = VIRTUAL_WIDTH;
    const H = VIRTUAL_HEIGHT;
    const layer = this.add.container(0, 0).setDepth(100);

    const shade = this.add
      .rectangle(0, 0, W, H, 0x000000, 0.7)
      .setOrigin(0)
      .setInteractive();
    const panel = this.add.graphics();
    const px = 34;
    const pw = W - px * 2;
    const py = 150;
    const ph = 520;
    panel.fillStyle(THEME.panelEdge, 1);
    panel.fillRoundedRect(px - 4, py - 4, pw + 8, ph + 8, 14);
    panel.fillStyle(THEME.panel, 1);
    panel.fillRoundedRect(px, py, pw, ph, 12);

    const lines = [
      "GOAL",
      "Sort blocks so each tube",
      "holds ONE colour (or is empty).",
      "",
      "MOVES",
      "Tap a tube to lift its top",
      "block, then tap another to drop.",
      "Same-colour blocks move as a",
      "group - only if they ALL fit.",
      "",
      "RULES",
      "A tube holds 4 blocks. Pour only",
      "onto an empty tube or a matching",
      "colour with room for the group.",
      "",
      "No moves left = level failed.",
      "Use UNDO or RESTART anytime!",
    ];
    const title = pixelText(this, W / 2, py + 34, "HOW TO PLAY", 16, THEME.accentHex);

    const body = this.add
      .text(W / 2, py + 70, lines.join("\n"), {
        fontFamily: FONT,
        fontSize: "9px",
        color: THEME.ink,
        align: "center",
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)
      .setResolution(2);

    const close = pixelButton(this, W / 2, py + ph - 40, 150, 44, "GOT IT", () =>
      layer.destroy(),
    );

    layer.add([shade, panel, title, body, close.container]);
    shade.on("pointerdown", () => layer.destroy());
  }
}
