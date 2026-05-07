import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import { source } from "@/lib/source";

const SITE_URL = "https://bromso.github.io/bro";
const REPO_URL = "https://github.com/bromso/bro";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const slug = params.slug?.join("/") || "";
  const url = `${SITE_URL}/docs/${slug}`;

  // JSON-LD structured data — all values are static/trusted (from MDX frontmatter)
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.data.title,
    description: page.data.description,
    url,
    publisher: {
      "@type": "Organization",
      name: "figma-mcp",
      url: REPO_URL,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "figma-mcp Docs",
      url: SITE_URL,
    },
  });

  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD from trusted MDX frontmatter */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <DocsPage
        toc={page.data.toc}
        tableOfContent={{ style: "normal" }}
        editOnGithub={{
          owner: "bromso",
          repo: "bro",
          sha: "master",
          path: `apps/docs/content/docs/${page.file.path}`,
        }}
        breadcrumb={{ enabled: true }}
        footer={{ enabled: true }}
      >
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsBody>
          <MDX components={getMDXComponents()} />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const slug = params.slug?.join("/") || "";
  const url = `${SITE_URL}/docs/${slug}`;

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: url },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      url,
      siteName: "figma-mcp",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: page.data.title,
      description: page.data.description,
    },
  };
}
