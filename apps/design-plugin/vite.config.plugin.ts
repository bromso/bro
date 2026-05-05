import path from "node:path";
import { defineConfig } from "vite";
import generateFile from "vite-plugin-generate-file";
import { viteSingleFile } from "vite-plugin-singlefile";
import figmaManifest from "./figma.manifest";

export default defineConfig(({ mode }) => ({
  plugins: [
    viteSingleFile(),
    generateFile({
      type: "json",
      output: "./manifest.json",
      data: figmaManifest,
    }),
  ],
  build: {
    minify: mode === "production",
    sourcemap: mode !== "production" ? "inline" : false,
    target: "es2017",
    emptyOutDir: false,
    outDir: path.resolve(__dirname, "dist"),
    rolldownOptions: {
      input: path.resolve(__dirname, "src/plugin/plugin.ts"),
      output: {
        entryFileNames: "plugin.js",
      },
    },
  },
  resolve: {
    alias: {
      "@plugin": path.resolve(__dirname, "src/plugin"),
    },
  },
}));
