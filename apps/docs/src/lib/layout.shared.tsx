import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

const BASE = process.env.GITHUB_PAGES === "true" ? "/figma-plugin-template" : "";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src={`${BASE}/Favicon.svg`} alt="" width={20} height={20} />
          <span>Figma Plugin Template</span>
        </>
      ),
    },
    githubUrl: "https://github.com/bromso/figma-plugin-template",
    links: [
      {
        text: "Storybook",
        url: "https://bromso.github.io/figma-plugin-template/storybook",
      },
    ],
  };
}
