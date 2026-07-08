/** Reusable retro pixel-art UI widgets: bitmap-style text and bevelled buttons. */
import Phaser from "phaser";
import { THEME } from "../config";
import { cssHex } from "../render/colors";

export const FONT = '"Press Start 2P"';

export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color: string = THEME.ink,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      align: "center",
    })
    .setOrigin(0.5)
    .setResolution(2);
}

export interface PixelButton {
  container: Phaser.GameObjects.Container;
  setEnabled(on: boolean): void;
  setLabel(text: string): void;
}

/** A chunky bevelled pixel button with press feedback. */
export function pixelButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: { fill?: number; size?: number } = {},
): PixelButton {
  const fill = opts.fill ?? 0x3d3466;
  const size = opts.size ?? 12;
  const container = scene.add.container(x, y);

  const g = scene.add.graphics();
  const draw = (pressed: boolean, enabled: boolean) => {
    g.clear();
    const oy = pressed ? 3 : 0;
    const base = enabled ? fill : 0x2a2740;
    // Shadow slab.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(-w / 2 + 4, -h / 2 + 6, w, h);
    // Body.
    g.fillStyle(base, 1);
    g.fillRect(-w / 2, -h / 2 + oy, w, h);
    // Top/left highlight bevel.
    g.fillStyle(0xffffff, enabled ? 0.18 : 0.06);
    g.fillRect(-w / 2, -h / 2 + oy, w, 4);
    g.fillRect(-w / 2, -h / 2 + oy, 4, h);
    // Bottom/right shadow bevel.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(-w / 2, h / 2 - 4 + oy, w, 4);
    g.fillRect(w / 2 - 4, -h / 2 + oy, 4, h);
  };
  draw(false, true);

  const txt = pixelText(scene, 0, 0, label, size, enabledColor(true));
  container.add([g, txt]);

  container.setSize(w, h);
  // NOTE: on a Container with a size, Phaser feeds the hit test top-left-origin
  // local coordinates (0..w, 0..h), NOT centre-relative ones. So the hit area
  // must be Rectangle(0, 0, w, h). A centred rect (-w/2, -h/2, w, h) leaves only
  // the top-left quarter clickable — the classic "button doesn't respond" bug.
  const hitArea = new Phaser.Geom.Rectangle(0, 0, w, h);
  container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
  if (container.input) container.input.cursor = "pointer";

  let enabled = true;
  container.on("pointerdown", () => {
    if (!enabled) return;
    draw(true, true);
    txt.setY(3);
  });
  const release = (fire: boolean) => {
    if (!enabled) return;
    draw(false, true);
    txt.setY(0);
    if (fire) onClick();
  };
  container.on("pointerup", () => release(true));
  container.on("pointerout", () => release(false));

  return {
    container,
    setEnabled(on: boolean) {
      enabled = on;
      draw(false, on);
      txt.setColor(enabledColor(on));
      if (on) container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
      else container.disableInteractive();
    },
    setLabel(t: string) {
      txt.setText(t);
    },
  };
}

function enabledColor(on: boolean): string {
  return on ? THEME.ink : cssHex(0x6a6390);
}
