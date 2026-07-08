/** Boot: generate textures, wait for the pixel font, then hand off to the menu. */
import Phaser from "phaser";
import { generateTextures } from "../render/textures";
import { drawRetroBackground } from "../ui/background";
import { pixelText } from "../ui/widgets";
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../config";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    generateTextures(this);
    drawRetroBackground(this);
    pixelText(this, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, "LOADING", 16);

    // Ensure the bitmap font is ready before any scene renders text with it,
    // otherwise the first frames fall back to a system font.
    const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
    const go = () => this.scene.start("Menu");
    if (fonts?.load) {
      Promise.all([
        fonts.load('10px "Press Start 2P"'),
        fonts.load('16px "Press Start 2P"'),
      ])
        .then(() => fonts.ready)
        .then(go)
        .catch(go);
    } else {
      go();
    }
  }
}
