import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Everything is bundled locally (fonts included); the built app makes no network requests.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "es2021", assetsInlineLimit: 0 },
  test: { environment: "node" },
});
