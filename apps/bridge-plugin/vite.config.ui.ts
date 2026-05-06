import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "src/ui",
  plugins: [react(), tailwind(), viteSingleFile()],
  build: {
    outDir: "../../dist",
    emptyOutDir: false,
    rollupOptions: { input: "src/ui/index.html" },
  },
});
