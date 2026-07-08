import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blockshift.game",
  appName: "Block Shift",
  // Capacitor serves the Vite production build from dist/.
  webDir: "dist",
  backgroundColor: "#12101c",
  android: {
    backgroundColor: "#12101c",
  },
  ios: {
    backgroundColor: "#12101c",
    // Edge-to-edge (viewport-fit=cover) so the retro background fills the whole
    // screen; the game insets its UI via safeTop()/safeBottom() to clear the
    // Dynamic Island / home indicator.
    contentInset: "never",
  },
};

export default config;
