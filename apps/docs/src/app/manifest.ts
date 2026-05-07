import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "figma-mcp Docs",
    short_name: "figma-mcp",
    description: "Build Figma plugins with React, Vite, TypeScript, and AI skills",
    start_url: "/bro/docs",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#a259ff",
    icons: [
      {
        src: "/bro/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/bro/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
