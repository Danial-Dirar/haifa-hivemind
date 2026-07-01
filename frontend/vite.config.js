import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base is "./" so the built assets work when loaded from file:// inside Electron.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5219 },
  build: { outDir: "dist", emptyOutDir: true },
});
