import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/plugin-bootstrap.ts",
      formats: ["iife"],
      name: "BridgePlugin",
      fileName: () => "plugin.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      output: { extend: true },
    },
  },
});
