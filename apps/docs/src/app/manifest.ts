import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Figma Plugin Template Docs",
    short_name: "FPT Docs",
    description: "Build Figma plugins with React, Vite, TypeScript, and AI skills",
    start_url: "/figma-plugin-template/docs",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#a259ff",
    icons: [
      {
        src: "/figma-plugin-template/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/figma-plugin-template/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
