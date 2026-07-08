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
    contentInset: "always",
  },
};

export default config;
