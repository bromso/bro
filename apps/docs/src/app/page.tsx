import type { Metadata } from "next";

const BASE = process.env.GITHUB_PAGES === "true" ? "/bro" : "";
const TARGET = `${BASE}/docs/`;

export const metadata: Metadata = {
  title: "figma-mcp",
  description: "MCP server that lets your AI design in Figma.",
  // Static-export-safe redirect: meta-refresh runs in the browser, not
  // on the server. Next 15's `redirect()` would compile but not actually
  // redirect under `output: "export"` — assets serve, but no 30x.
  other: {
    refresh: `0;url=${TARGET}`,
  },
};

export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>figma-mcp</h1>
      <p>
        Loading docs… If you are not redirected automatically, follow the link to{" "}
        <a href={TARGET}>{TARGET}</a>.
      </p>
    </main>
  );
}
