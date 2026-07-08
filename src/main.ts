import Phaser from "phaser";
import "@fontsource/press-start-2p";
import { THEME, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "./config";
import { unlockAudio } from "./audio/sfx";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { LevelSelectScene } from "./scenes/LevelSelectScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: THEME.bgBottom,
  width: VIRTUAL_WIDTH,
  height: VIRTUAL_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
  },
  input: {
    activePointers: 1,
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene],
};

const game = new Phaser.Game(config);

// Keep Phaser's cached canvas bounds in sync with the DOM. If the canvas moves
// (layout shift, tab restore, address-bar collapse on mobile) without a refresh,
// Phaser maps clicks to stale coordinates and buttons stop responding to taps.
const refresh = () => game.scale.refresh();
window.addEventListener("resize", refresh);
window.addEventListener("orientationchange", refresh);
window.addEventListener("focus", refresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});
// One refresh after first paint settles any post-load layout (fonts, scrollbars).
game.events.once(Phaser.Core.Events.READY, () => setTimeout(refresh, 0));

// Audio contexts start suspended until a user gesture — unlock on first input
// so the win cue is ready to play by the time anyone reaches a victory.
const unlock = () => {
  unlockAudio();
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

// Dev-only handle so the browser preview harness can inspect/drive the game.
if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
  void import("./game/solver").then((m) => {
    (window as unknown as { __solve: typeof m.solve }).__solve = m.solve;
  });
  void import("./game/levelGenerator").then((m) => {
    (window as unknown as { __gen: typeof m.generateLevel }).__gen = m.generateLevel;
  });
  void import("./config").then((m) => {
    (window as unknown as { __DIFFS: typeof m.DIFFICULTIES }).__DIFFS = m.DIFFICULTIES;
  });
}
