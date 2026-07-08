import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built app works both on the web and inside the
  // Capacitor native WebView (which serves from a file/local scheme).
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    target: "es2020",
    assetsInlineLimit: 0,
  },
});
