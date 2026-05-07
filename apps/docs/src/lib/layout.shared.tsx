import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

const BASE = process.env.GITHUB_PAGES === "true" ? "/bro" : "";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src={`${BASE}/Favicon.svg`} alt="" width={20} height={20} />
          <span>figma-mcp</span>
        </>
      ),
    },
    githubUrl: "https://github.com/bromso/bro",
    links: [
      {
        text: "Storybook",
        url: "https://bromso.github.io/bro/storybook",
      },
    ],
  };
}
