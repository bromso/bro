// apps/bridge-plugin/figma.manifest.ts
//
// Source-of-truth for the Figma plugin manifest. The Vite plugin build
// converts this TS export into `dist/manifest.json` at build time.
//
// `allowedDomains` is intentionally narrow:
//   - `ws://127.0.0.1:9223` for the local daemon
//
// Phase 6 will append `wss://*.our-relay-domain.com` for cloud pairing.
// Until then, this is the only allowed network endpoint.

export const manifest = {
  name: "Figma MCP Bridge",
  id: "BRIDGE-PLUGIN-PLACEHOLDER-ID", // replace with the real ID before publishing
  api: "1.0.0",
  main: "plugin.js",
  ui: "index.html",
  editorType: ["figma", "figjam", "slides"] as const,
  networkAccess: {
    allowedDomains: ["ws://127.0.0.1:9223"] as const,
    reasoning: "Connects to the figma-mcp daemon on the user's machine to serve tool requests.",
  },
} as const;

export default manifest;
