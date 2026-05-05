import { RootProvider } from "fumadocs-ui/provider";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./global.css";

const SITE_URL = "https://bromso.github.io/figma-plugin-template";
const BASE = process.env.GITHUB_PAGES === "true" ? "/figma-plugin-template" : "";

export const metadata: Metadata = {
  title: {
    default: "Figma Plugin Template",
    template: "%s | Figma Plugin Template",
  },
  description: "Build Figma plugins with React, Vite, TypeScript, and AI skills",
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: [
      { url: `${BASE}/Favicon.svg`, type: "image/svg+xml" },
      { url: `${BASE}/favicon-32x32.png`, sizes: "32x32", type: "image/png" },
      { url: `${BASE}/favicon-16x16.png`, sizes: "16x16", type: "image/png" },
    ],
    shortcut: `${BASE}/favicon.ico`,
    apple: `${BASE}/apple-touch-icon.png`,
  },
  openGraph: {
    type: "website",
    siteName: "Figma Plugin Template",
    title: "Figma Plugin Template",
    description: "Build Figma plugins with React, Vite, TypeScript, and AI skills",
    url: SITE_URL,
    images: [
      {
        url: "/figma-plugi-template.webp",
        width: 1200,
        height: 630,
        alt: "Figma Plugin Template",
        type: "image/webp",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Figma Plugin Template",
    description: "Build Figma plugins with React, Vite, TypeScript, and AI skills",
    images: ["/figma-plugi-template.webp"],
  },
};

// Static constant — no user input, safe for inline injection
const websiteJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Figma Plugin Template Docs",
  description: "Build Figma plugins with React, Vite, TypeScript, and AI skills",
  url: SITE_URL,
  image: `${SITE_URL}/figma-plugi-template.webp`,
  publisher: {
    "@type": "Organization",
    name: "Figma Plugin Template",
    url: "https://github.com/bromso/figma-plugin-template",
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/android-chrome-512x512.png`,
    },
  },
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD from static constant */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: websiteJsonLd }} />
        <RootProvider
          search={{
            options: {
              type: "static",
            },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
