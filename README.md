# Block Shift

A cross-platform **pixel-art block-sort puzzle** — one TypeScript codebase that
runs in the browser and packages natively for **Android** and **iOS**.

Pour blocks between tubes until every tube holds a single colour. Classic
"water/ball sort" gameplay with a retro menu and a modern pixel-art look.

## Tech

- **[Phaser 3](https://phaser.io/)** — 2D game engine (scenes, input, crisp pixel scaling)
- **Vite + TypeScript** — dev server, bundling, typed game logic
- **[Capacitor](https://capacitorjs.com/)** — wraps the web build into Android/iOS apps
- **Zero image assets** — every block and tube is procedurally drawn pixel art

## Run it in a browser

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173). It also serves on your LAN
IP, so you can open it directly on a phone browser.

## Build

```bash
npm run build     # type-checks then bundles to dist/
npm run preview   # serve the production build locally
```

## Package for Android / iOS

The web build in `dist/` is wrapped by Capacitor.

```bash
npm run build
npx cap add android      # one-time: creates the /android native project
npx cap add ios          # one-time: creates the /ios native project (macOS + Xcode)
npm run sync             # copy the latest web build into the native shells
npx cap open android     # open in Android Studio  ->  run on device/emulator
npx cap open ios         # open in Xcode           ->  run on device/simulator
```

> Android needs Android Studio + SDK; iOS needs Xcode. The `/android` and `/ios`
> folders are generated and git-ignored.

## How to play

- **Tap a tube** to lift its top block (matching blocks lift together).
- **Tap another tube** to pour — only onto an empty tube or a matching top colour.
- Each tube holds **4 blocks**. Clear a tube by filling it with one colour.
- **UNDO / RESTART / HINT** are always available. If no legal move remains, the
  level is failed.
- Difficulty ramps up: more colours, fewer spare empty tubes.

## Project layout

```
src/
  config.ts               palette, difficulties, virtual resolution
  main.ts                 Phaser bootstrap
  game/
    types.ts              Board / Tube / Move types
    logic.ts              pure rules: moves, win, dead-end (dependency-free)
    solver.ts             DFS solver — guarantees solvable levels + hints
    levelGenerator.ts     seeded, reproducible, verified-solvable deals
    progress.ts           localStorage: unlocked / completed levels
  render/
    metrics.ts            layout constants
    colors.ts             shading helpers
    textures.ts           procedural pixel-art block textures
    TubeSprite.ts         glass tube + block stack + animations
  ui/
    background.ts         retro gradient / scanlines
    widgets.ts            pixel text + bevelled buttons
  scenes/
    BootScene.ts          texture + font preload
    MenuScene.ts          retro title screen
    LevelSelectScene.ts   difficulty + level picker
    GameScene.ts          gameplay
```

## Design notes

Every generated level is **verified solvable** by a DFS solver before it is
dealt (the generator reshuffles until the solver confirms a win line exists), so
players never hit an impossible board by chance. The same solver powers the
**HINT** button. Levels are produced from a seeded PRNG keyed on
`(difficulty, level number)`, so a given level is identical every time.
