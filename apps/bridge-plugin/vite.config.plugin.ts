import { writeFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import manifest from "./figma.manifest";

const emitManifest = (): Plugin => ({
  name: "emit-figma-manifest",
  apply: "build",
  closeBundle: async () => {
    await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  },
});

export default defineConfig({
  plugins: [emitManifest()],
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
