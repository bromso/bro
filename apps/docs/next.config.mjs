import withPWAInit from "@ducanh2912/next-pwa";
import { createMDX } from "fumadocs-mdx/next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const isProd = process.env.NODE_ENV === "production";

const withPWA = withPWAInit({
  dest: "public",
  disable: !isProd,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  images: { unoptimized: true },
  ...(isGitHubPages && {
    output: "export",
    basePath: "/figma-plugin-template",
  }),
};

const withMDX = createMDX();

export default withPWA(withMDX(config));
