import { createPreset } from "fumadocs-ui/tailwind-plugin";
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}", "./content/**/*.mdx", "./node_modules/fumadocs-ui/dist/**/*.js"],
  presets: [createPreset()],
};

export default config;
