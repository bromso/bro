# Phase 15: Docs Site Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix the blank-page bug at `bromso.github.io/bro/`, refresh content for v1.4 (8 packs / ~81 tools), introduce 5-section IA (Get Started / Clients / Tools / Recipes / Reference), auto-generate the per-tool reference at build time.

**Architecture:** Existing Fumadocs-on-Next.js site at `apps/docs`. Render bug is 9 files with hardcoded `figma-plugin-template`. Tool reference generator imports every pack's Zod schemas, runs `zodToJsonSchema`, emits one MDX per tool. Pack overviews + recipes hand-written. Default Fumadocs theme + wordmark only.

**Tech Stack:** Next.js 15, Fumadocs 14, Bun 1.3.11, MDX, Zod 3.x, `zod-to-json-schema` (already in `apps/mcp-server`'s dep tree).

**Design doc:** `docs/plans/2026-05-08-docs-site-redesign-design.md` (committed as `23adb5c`).

---

## Task 1: Fix render bug (basePath + redirect + wordmark)

**Goal:** Site renders at `bromso.github.io/bro/`. The blank page is caused by 9 source files hardcoding `figma-plugin-template` (the original template name). Replace with `bro` everywhere; replace the server-only `redirect("/docs")` in the root page with a static meta-refresh that works under Next's `output: "export"`.

**Files:**

- Modify: `apps/docs/next.config.mjs` — basePath
- Modify: `apps/docs/src/app/layout.tsx` — SITE_URL + BASE + organization URL + siteName
- Modify: `apps/docs/src/app/manifest.ts` — start_url + 2 icon paths
- Modify: `apps/docs/src/app/robots.ts` — sitemap URL
- Modify: `apps/docs/src/app/sitemap.ts` — BASE_URL
- Modify: `apps/docs/src/app/docs/[[...slug]]/page.tsx` — SITE_URL + REPO_URL + GitHub edit-link config + asset path typo (`figma-plugi-template.webp` → `bro.webp` if asset exists, otherwise drop the meta image references)
- Modify: `apps/docs/src/lib/layout.shared.tsx` — BASE + githubUrl + Storybook URL + nav title wordmark
- Replace: `apps/docs/src/app/page.tsx` — remove `redirect("/docs")`, render a static meta-refresh
- Verify: `apps/docs/public/` — list assets that may need rename (Favicon.svg, etc.)

**Step 1: Audit current asset folder**

Run: `ls apps/docs/public/`

Note any files referenced in the source files above (e.g. `Favicon.svg`, `figma-plugi-template.webp`). Files that exist stay; files referenced in source but missing on disk get their references removed.

**Step 2: Search-and-replace `figma-plugin-template` → `bro`**

Use a single pass:

```bash
cd apps/docs
rg -l "figma-plugin-template" src next.config.mjs | xargs sed -i '' 's|figma-plugin-template|bro|g'
```

(macOS `sed -i ''`; Linux is `sed -i`. The agent should handle whichever runs locally.)

Verify nothing remains:

```bash
rg "figma-plugin-template" src next.config.mjs
```

Expected: zero hits.

**Step 3: Replace `apps/docs/src/app/page.tsx`**

```tsx
// apps/docs/src/app/page.tsx
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
```

**Step 4: Update wordmark in `layout.shared.tsx`**

After the `s/figma-plugin-template/bro/` pass, the `<span>Figma Plugin Template</span>` wordmark in `apps/docs/src/lib/layout.shared.tsx` still says the template name. Update:

```tsx
// apps/docs/src/lib/layout.shared.tsx (after the rename)
<span>figma-mcp</span>
```

Same for `siteName` in any metadata blocks (`layout.tsx`, `[[...slug]]/page.tsx`).

Update the org name too:
- `Organization` JSON-LD `name`: `"Figma Plugin Template"` → `"figma-mcp"`
- `WebSite` JSON-LD `name`: `"Figma Plugin Template Docs"` → `"figma-mcp Docs"`

**Step 5: Fix the `figma-plugi-template.webp` typo**

`[[...slug]]/page.tsx` references `figma-plugi-template.webp` (missing `n`). After step 2, this becomes `figma-plugi-bro.webp` — still wrong. If `apps/docs/public/figma-plugi-template.webp` doesn't exist (it almost certainly doesn't), remove the OG-image references:

In `[[...slug]]/page.tsx`, delete the `image` field from the JSON-LD payload AND the `images` arrays inside `openGraph` and `twitter`.

In `layout.tsx`, do the same if present.

(If you choose to ship an OG image later, that's a separate task; doing it here is scope creep.)

**Step 6: Build and verify**

```bash
cd /Users/jonasbroms/.config/superpowers/worktrees/bro/feat/phase-15-docs-site
bun run --filter @repo/docs build
```

The first build will fail because some content paths from the old IA still exist. That's fine — Task 2 fixes the content tree. For Task 1, we only need:

```bash
cd apps/docs
GITHUB_PAGES=true bun run build
```

…to complete static export without runtime crashes from the rename. Existing content stays in place; broken links inside MDX are tolerated for now.

If it succeeds, smoke-test locally:

```bash
bunx serve apps/docs/out
# In another terminal:
curl -s http://localhost:3000/bro/ | head -20
```

Expected: HTML containing `figma-mcp` heading and a `meta http-equiv="refresh"` pointing at `/bro/docs/`.

**Step 7: Commit**

```bash
git add apps/docs
git commit -m "fix(docs): rename basePath figma-plugin-template -> bro + static-export-safe redirect"
```

---

## Task 2: Restructure content tree to new IA

**Goal:** Move existing files into the new five-section structure; add empty `meta.json` files and stub MDX files for new sections so Tasks 7-13 can land content into a coherent tree without breaking the build.

**Files (this task creates and moves a lot — track via git):**

Renames:
- `apps/docs/content/docs/getting-started/index.mdx` → `apps/docs/content/docs/get-started/index.mdx`
- `apps/docs/content/docs/architecture.mdx` → `apps/docs/content/docs/reference/architecture.mdx`
- `apps/docs/content/docs/troubleshooting.mdx` → `apps/docs/content/docs/reference/troubleshooting.mdx`

Creates (empty stubs for Task 13 to fill):
- `apps/docs/content/docs/get-started/meta.json`
- `apps/docs/content/docs/get-started/cloud.mdx`

Creates (empty stubs for Task 12 to fill):
- `apps/docs/content/docs/reference/meta.json`
- `apps/docs/content/docs/reference/error-codes.mdx`

Creates (empty stubs for Tasks 7-8):
- `apps/docs/content/docs/tools/meta.json`
- `apps/docs/content/docs/tools/index.mdx`
- `apps/docs/content/docs/tools/{extract,variables,console,design,figjam,slides,a11y,rest}.mdx` (8 files)

Creates (Tasks 9-10):
- `apps/docs/content/docs/recipes/meta.json`
- `apps/docs/content/docs/recipes/index.mdx`
- `apps/docs/content/docs/recipes/{extract-design-tokens,audit-accessibility,slides-from-outline,ui-from-description,audit-via-cloud,debug-plugin-console,document-components}.mdx` (7 files)

Creates (Tasks 4-5):
- `apps/docs/content/docs/tools-reference/` directory with placeholder `meta.json`. Generated MDX comes in Task 5.

Modifies:
- `apps/docs/content/docs/meta.json` — top-level navigation, replaces existing
- `apps/docs/content/docs/index.mdx` — leave existing for now (Task 13 refreshes the prose)

**Step 1: Move existing files**

```bash
cd /Users/jonasbroms/.config/superpowers/worktrees/bro/feat/phase-15-docs-site
mkdir -p apps/docs/content/docs/get-started
git mv apps/docs/content/docs/getting-started/index.mdx apps/docs/content/docs/get-started/index.mdx
rmdir apps/docs/content/docs/getting-started 2>/dev/null || true

mkdir -p apps/docs/content/docs/reference
git mv apps/docs/content/docs/architecture.mdx apps/docs/content/docs/reference/architecture.mdx
git mv apps/docs/content/docs/troubleshooting.mdx apps/docs/content/docs/reference/troubleshooting.mdx
```

**Step 2: Create meta.json files**

`apps/docs/content/docs/meta.json` (replaces existing):

```json
{
  "title": "Documentation",
  "pages": [
    "---Get Started---",
    "index",
    "get-started",
    "clients",
    "---Tools---",
    "tools",
    "tools-reference",
    "recipes",
    "---Reference---",
    "reference"
  ]
}
```

`apps/docs/content/docs/get-started/meta.json`:

```json
{
  "title": "Get Started",
  "pages": ["index", "cloud"]
}
```

`apps/docs/content/docs/reference/meta.json`:

```json
{
  "title": "Reference",
  "pages": ["architecture", "troubleshooting", "error-codes"]
}
```

`apps/docs/content/docs/tools/meta.json`:

```json
{
  "title": "Tools",
  "pages": [
    "index",
    "---Universal---",
    "extract",
    "variables",
    "a11y",
    "rest",
    "---Figma Design---",
    "design",
    "console",
    "---FigJam---",
    "figjam",
    "---Slides---",
    "slides"
  ]
}
```

`apps/docs/content/docs/tools-reference/meta.json`:

```json
{
  "title": "Tool reference",
  "pages": []
}
```

(Generator overwrites this in Task 5 with the actual tool list.)

`apps/docs/content/docs/recipes/meta.json`:

```json
{
  "title": "Recipes",
  "pages": [
    "index",
    "extract-design-tokens",
    "audit-accessibility",
    "slides-from-outline",
    "ui-from-description",
    "audit-via-cloud",
    "debug-plugin-console",
    "document-components"
  ]
}
```

**Step 3: Create empty stub MDX files**

For every MDX file listed under "Creates" above, write a minimal stub with valid frontmatter so Fumadocs's MDX compiler doesn't reject them:

```mdx
---
title: <Title placeholder>
description: <Description placeholder>
---

(Content lands in Task N — see implementation plan.)
```

Use these titles per file:

- `tools/index.mdx` — "Tool packs"
- `tools/extract.mdx` — "extract"
- `tools/variables.mdx` — "variables"
- `tools/console.mdx` — "console"
- `tools/design.mdx` — "design"
- `tools/figjam.mdx` — "figjam"
- `tools/slides.mdx` — "slides"
- `tools/a11y.mdx` — "a11y"
- `tools/rest.mdx` — "rest"
- `recipes/index.mdx` — "Recipes"
- `recipes/extract-design-tokens.mdx` — "Extract design tokens"
- `recipes/audit-accessibility.mdx` — "Audit a frame's accessibility"
- `recipes/slides-from-outline.mdx` — "Generate slides from a markdown outline"
- `recipes/ui-from-description.mdx` — "Build a UI from a description"
- `recipes/audit-via-cloud.mdx` — "Audit a Figma file via cloud mode (no plugin)"
- `recipes/debug-plugin-console.mdx` — "Capture plugin console errors"
- `recipes/document-components.mdx` — "Document components with a11y metadata"
- `get-started/cloud.mdx` — "Cloud mode (relay-based)"
- `reference/error-codes.mdx` — "Error codes reference"

**Step 4: Build and verify**

```bash
cd /Users/jonasbroms/.config/superpowers/worktrees/bro/feat/phase-15-docs-site
GITHUB_PAGES=true bun run --filter @repo/docs build
```

Expected: clean build. Fumadocs walks the new tree, indexes every page (including stubs), produces `apps/docs/out/` with the new sidebar.

If a `meta.json` references a missing page, the build will fail loudly — fix the typo and re-run.

**Step 5: Smoke-test the new IA**

```bash
bunx serve apps/docs/out
```

Visit `http://localhost:3000/bro/docs/`. Click through every nav entry. All pages should render (most are stubs, but they should not 404).

**Step 6: Commit**

```bash
git add apps/docs/content/docs
git commit -m "docs(site): restructure content tree to 5-section IA + stubs"
```

---

## Task 3: Build the `<ToolReference>` component

**Goal:** A React component that renders a Zod-derived JSON schema as a typed table — field name, type, required/optional, constraints, description. Used by every auto-generated tool page.

**Files:**

- Create: `apps/docs/src/components/tool-reference.tsx`
- Create: `apps/docs/src/components/__tests__/tool-reference.test.tsx`
- Modify: `apps/docs/src/components/mdx.tsx` — register the component for MDX
- Modify: `apps/docs/package.json` — add Vitest + happy-dom + React testing library if not present
- Create: `apps/docs/vitest.config.ts` — if not present

**Step 1: Verify Vitest config in apps/docs**

```bash
cat apps/docs/vitest.config.ts 2>/dev/null || echo "MISSING"
cat apps/docs/package.json | jq '.devDependencies'
```

If `vitest.config.ts` is missing, create it:

```ts
// apps/docs/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/components/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.*", "src/**/*.d.ts"],
    },
  },
});
```

If `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom` are missing from `apps/docs/package.json` devDependencies, add them at versions matching the rest of the monorepo (`vitest@4.1.4`, `@vitest/coverage-v8@4.1.4`). Run `bun install` from the worktree root to refresh `bun.lock`.

Add a `test` script to `apps/docs/package.json` if missing:

```json
"test": "vitest run"
```

**Step 2: Write the failing test**

```tsx
// apps/docs/src/components/__tests__/tool-reference.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolReference } from "../tool-reference";

describe("ToolReference", () => {
  it("renders the tool name and pack as a header", () => {
    render(
      <ToolReference
        pack="tools-extract"
        name="extract_styles"
        description="Return all local styles."
        streaming={false}
        input={{ type: "object", properties: {}, additionalProperties: false }}
        output={{
          type: "object",
          properties: {
            paintStyles: { type: "array", description: "Paint styles." },
          },
        }}
      />
    );
    expect(screen.getByText("extract_styles")).toBeInTheDocument();
    expect(screen.getByText(/tools-extract/)).toBeInTheDocument();
  });

  it("renders the input table with required/optional columns", () => {
    render(
      <ToolReference
        pack="tools-design"
        name="create_rectangle"
        description="Create a rectangle."
        streaming={false}
        input={{
          type: "object",
          properties: {
            width: { type: "number", exclusiveMinimum: 0 },
            height: { type: "number", exclusiveMinimum: 0 },
            x: { type: "number" },
            y: { type: "number" },
          },
          required: ["width", "height"],
          additionalProperties: false,
        }}
        output={{ type: "object", properties: {} }}
      />
    );
    // width and height are required; x and y are optional.
    const widthRow = screen.getByText("width").closest("tr");
    expect(widthRow).toHaveTextContent("required");
    const xRow = screen.getByText("x").closest("tr");
    expect(xRow).toHaveTextContent("optional");
  });

  it("renders enum constraints", () => {
    render(
      <ToolReference
        pack="tools-figjam"
        name="create_shape_with_text"
        description="Shape."
        streaming={false}
        input={{
          type: "object",
          properties: {
            shape: { type: "string", enum: ["square", "ellipse", "diamond"] },
          },
          required: ["shape"],
        }}
        output={{ type: "object" }}
      />
    );
    expect(screen.getByText(/square/)).toBeInTheDocument();
    expect(screen.getByText(/ellipse/)).toBeInTheDocument();
    expect(screen.getByText(/diamond/)).toBeInTheDocument();
  });

  it("renders streaming indicator when streaming=true", () => {
    render(
      <ToolReference
        pack="tools-variables"
        name="import_variables"
        description="Import."
        streaming={true}
        input={{ type: "object" }}
        output={{ type: "object" }}
      />
    );
    expect(screen.getByText(/streaming/i)).toBeInTheDocument();
  });

  it("renders the output schema as a table separate from input", () => {
    render(
      <ToolReference
        pack="tools-rest"
        name="get_user_me"
        description="User."
        streaming={false}
        input={{ type: "object" }}
        output={{
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
          },
        }}
      />
    );
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
  });
});
```

Add `apps/docs/vitest.config.ts` line `setupFiles: ["./src/__tests__/setup.ts"]` if needed for `@testing-library/jest-dom` matchers; create the setup file:

```ts
// apps/docs/src/__tests__/setup.ts
import "@testing-library/jest-dom/vitest";
```

**Step 3: Run failing tests**

```bash
cd /Users/jonasbroms/.config/superpowers/worktrees/bro/feat/phase-15-docs-site
bun run --filter @repo/docs test
```

Expected: all 5 tests fail with `Cannot find module '../tool-reference'`.

**Step 4: Implement the component**

```tsx
// apps/docs/src/components/tool-reference.tsx
import type { JSONSchema7 } from "json-schema";

type Schema = JSONSchema7;

export interface ToolReferenceProps {
  readonly pack: string;
  readonly name: string;
  readonly description: string;
  readonly streaming: boolean;
  readonly input: Schema;
  readonly output: Schema;
}

interface FieldRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly constraints: string;
  readonly description: string;
}

function describeType(s: Schema): string {
  if (typeof s !== "object" || s === null) return "?";
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (Array.isArray(s.type)) return s.type.join(" | ");
  if (typeof s.type === "string") {
    if (s.type === "array") {
      const items = s.items as Schema | undefined;
      return items ? `${describeType(items)}[]` : "any[]";
    }
    return s.type;
  }
  return "object";
}

function describeConstraints(s: Schema): string {
  if (typeof s !== "object" || s === null) return "";
  const parts: string[] = [];
  if (s.minimum !== undefined) parts.push(`>= ${s.minimum}`);
  if (s.maximum !== undefined) parts.push(`<= ${s.maximum}`);
  if (s.exclusiveMinimum !== undefined) parts.push(`> ${s.exclusiveMinimum}`);
  if (s.exclusiveMaximum !== undefined) parts.push(`< ${s.exclusiveMaximum}`);
  if (s.minLength !== undefined) parts.push(`length >= ${s.minLength}`);
  if (s.maxLength !== undefined) parts.push(`length <= ${s.maxLength}`);
  if (s.pattern) parts.push(`/${s.pattern}/`);
  if (s.default !== undefined) parts.push(`default: ${JSON.stringify(s.default)}`);
  return parts.join(", ");
}

function flatten(schema: Schema): FieldRow[] {
  if (typeof schema !== "object" || schema === null) return [];
  if (schema.type !== "object" || !schema.properties) {
    return [
      {
        name: "(value)",
        type: describeType(schema),
        required: true,
        constraints: describeConstraints(schema),
        description: typeof schema.description === "string" ? schema.description : "",
      },
    ];
  }
  const required = new Set(schema.required ?? []);
  const rows: FieldRow[] = [];
  for (const [k, v] of Object.entries(schema.properties)) {
    const sv = v as Schema;
    rows.push({
      name: k,
      type: describeType(sv),
      required: required.has(k),
      constraints: describeConstraints(sv),
      description: (sv as { description?: string }).description ?? "",
    });
  }
  return rows;
}

function FieldTable({ rows }: { rows: readonly FieldRow[] }) {
  if (rows.length === 0) return <p>(no fields)</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Required</th>
          <th>Constraints</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td><code>{row.name}</code></td>
            <td><code>{row.type}</code></td>
            <td>{row.required ? "required" : "optional"}</td>
            <td>{row.constraints || "—"}</td>
            <td>{row.description || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ToolReference(props: ToolReferenceProps) {
  return (
    <div className="tool-reference">
      <header>
        <h2>{props.name}</h2>
        <p>
          <code>{props.pack}</code>
          {props.streaming && <span> · streaming</span>}
        </p>
      </header>
      <p>{props.description}</p>

      <h3>Input</h3>
      <FieldTable rows={flatten(props.input)} />

      <h3>Output</h3>
      <FieldTable rows={flatten(props.output)} />
    </div>
  );
}
```

Add `json-schema` types if not present:

```bash
bun add -D @types/json-schema --cwd apps/docs
```

Or add the dep in `apps/docs/package.json` and run `bun install` from the root.

**Step 5: Register the component for MDX**

Modify `apps/docs/src/components/mdx.tsx`:

```tsx
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { ToolReference } from "./tool-reference";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ToolReference,
    ...components,
  };
}
```

(If `getMDXComponents` already exists with that signature, just add `ToolReference` to the return object.)

**Step 6: Run tests**

```bash
bun run --filter @repo/docs test
```

Expected: 5 tests pass.

**Step 7: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

Expected: clean build.

**Step 8: Commit**

```bash
git add apps/docs
git commit -m "feat(docs): ToolReference component (renders JSON-schema as a typed table)"
```

---

## Task 4: Tool reference generator script

**Goal:** Build-time script that imports every pack's `defineTool` exports, walks the Zod schemas, and emits one MDX per tool plus a `meta.json` per pack at `apps/docs/content/docs/tools-reference/<pack>/`.

**Files:**

- Create: `apps/docs/scripts/generate-tool-reference.mjs`
- Create: `apps/docs/scripts/__tests__/generate-tool-reference.test.mjs`
- Modify: `apps/docs/package.json` — add `zod-to-json-schema` dep (already in mcp-server's dep tree; add to docs explicitly)

**Step 1: Add `zod-to-json-schema` dependency**

```json
// apps/docs/package.json
"dependencies": {
  ...
  "zod-to-json-schema": "^3.23.0",
  ...
}
```

Then `bun install` from the worktree root.

**Step 2: Write the failing test**

```js
// apps/docs/scripts/__tests__/generate-tool-reference.test.mjs
import { describe, expect, it } from "vitest";
import { renderToolMdx, renderPackMetaJson } from "../generate-tool-reference.mjs";

describe("renderToolMdx", () => {
  it("emits frontmatter and a <ToolReference> usage", () => {
    const out = renderToolMdx({
      pack: "tools-extract",
      name: "extract_styles",
      description: "Return all local styles.",
      streaming: false,
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    });
    expect(out).toMatch(/^---\n/);
    expect(out).toMatch(/title: extract_styles/);
    expect(out).toMatch(/description: Return all local styles\./);
    expect(out).toMatch(/<ToolReference/);
    expect(out).toMatch(/pack="tools-extract"/);
    expect(out).toMatch(/name="extract_styles"/);
    expect(out).toMatch(/streaming={false}/);
  });

  it("escapes quotes in description for JSX prop", () => {
    const out = renderToolMdx({
      pack: "tools-extract",
      name: "x",
      description: 'Has "quotes" inside.',
      streaming: false,
      inputSchema: {},
      outputSchema: {},
    });
    // The description prop should escape with backslash or use HTML entity
    expect(out).toContain('description="Has \\"quotes\\" inside."');
  });

  it("multiline description is collapsed for the prop, kept in the body", () => {
    const out = renderToolMdx({
      pack: "tools-extract",
      name: "x",
      description: "First line.\n\nSecond line.",
      streaming: false,
      inputSchema: {},
      outputSchema: {},
    });
    expect(out).toContain('description="First line.');
    expect(out).toContain("Second line.");
  });
});

describe("renderPackMetaJson", () => {
  it("emits a meta.json with tool ids in the input order", () => {
    const out = renderPackMetaJson({
      pack: "tools-extract",
      title: "extract",
      tools: ["extract_styles", "extract_components", "extract_local_variables"],
    });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      title: "extract",
      pages: ["extract_styles", "extract_components", "extract_local_variables"],
    });
  });
});
```

**Step 3: Run failing tests**

```bash
bun run --filter @repo/docs test scripts/
```

Expected: 4 tests fail (module missing).

**Step 4: Implement the generator helpers**

```js
// apps/docs/scripts/generate-tool-reference.mjs
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const OUTPUT_DIR = join(__dirname, "..", "content", "docs", "tools-reference");

// All packs that ship `defineTool`-shaped exports.
const PACKS = [
  { id: "tools-extract", title: "extract", import: "@repo/tools-extract" },
  { id: "tools-variables", title: "variables", import: "@repo/tools-variables" },
  { id: "tools-console", title: "console", import: "@repo/tools-console" },
  { id: "tools-design", title: "design", import: "@repo/tools-design" },
  { id: "tools-figjam", title: "figjam", import: "@repo/tools-figjam" },
  { id: "tools-slides", title: "slides", import: "@repo/tools-slides" },
  { id: "tools-a11y", title: "a11y", import: "@repo/tools-a11y" },
  { id: "tools-rest", title: "rest", import: "@repo/tools-rest" },
];

export function escapeForJsxProp(s) {
  // First newline only — for the prop attribute. Body keeps the full text.
  const firstLine = String(s).split("\n")[0];
  return firstLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function renderToolMdx({ pack, name, description, streaming, inputSchema, outputSchema }) {
  const lines = [];
  lines.push("---");
  lines.push(`title: ${name}`);
  lines.push(`description: ${escapeForJsxProp(description)}`);
  lines.push("---");
  lines.push("");
  lines.push("import { ToolReference } from \"@/components/tool-reference\";");
  lines.push("");
  lines.push("<ToolReference");
  lines.push(`  pack="${pack}"`);
  lines.push(`  name="${name}"`);
  lines.push(`  description="${escapeForJsxProp(description)}"`);
  lines.push(`  streaming={${streaming ? "true" : "false"}}`);
  lines.push(`  input={${JSON.stringify(inputSchema)}}`);
  lines.push(`  output={${JSON.stringify(outputSchema)}}`);
  lines.push("/>");
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push(description);
  lines.push("");
  lines.push("## See also");
  lines.push("");
  lines.push(`- Pack overview: [${pack}](/docs/tools/${pack.replace(/^tools-/, "")})`);
  lines.push("");
  return lines.join("\n");
}

export function renderPackMetaJson({ pack, title, tools }) {
  return JSON.stringify({ title, pages: tools }, null, 2) + "\n";
}

function isToolDef(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    "input" in value &&
    "output" in value
  );
}

async function loadPackTools(packImport) {
  const mod = await import(packImport);
  const tools = [];
  for (const exportName of Object.keys(mod)) {
    const v = mod[exportName];
    if (isToolDef(v)) tools.push(v);
  }
  return tools;
}

async function main() {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Top-level meta.json for the tools-reference section.
  const topMeta = {
    title: "Tool reference",
    pages: PACKS.map((p) => p.id.replace(/^tools-/, "")),
  };
  await writeFile(join(OUTPUT_DIR, "meta.json"), JSON.stringify(topMeta, null, 2) + "\n");

  for (const pack of PACKS) {
    const packDir = join(OUTPUT_DIR, pack.id.replace(/^tools-/, ""));
    await mkdir(packDir, { recursive: true });
    const tools = await loadPackTools(pack.import);
    const toolNames = [];
    for (const tool of tools) {
      toolNames.push(tool.name);
      const inputSchema = zodToJsonSchema(tool.input, { target: "openApi3" });
      const outputSchema = zodToJsonSchema(tool.output, { target: "openApi3" });
      const mdx = renderToolMdx({
        pack: pack.id,
        name: tool.name,
        description: tool.description,
        streaming: Boolean(tool.streaming),
        inputSchema,
        outputSchema,
      });
      await writeFile(join(packDir, `${tool.name}.mdx`), mdx);
    }
    const metaJson = renderPackMetaJson({
      pack: pack.id,
      title: pack.title,
      tools: toolNames,
    });
    await writeFile(join(packDir, "meta.json"), metaJson);
    console.log(`generated ${tools.length} tools for ${pack.id}`);
  }
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

**Step 5: Run tests**

```bash
bun run --filter @repo/docs test scripts/
```

Expected: 4 tests pass.

**Step 6: Commit**

```bash
git add apps/docs/scripts apps/docs/package.json apps/docs/vitest.config.ts apps/docs/src/__tests__/setup.ts bun.lock
git commit -m "feat(docs): tool reference generator script + helpers"
```

(Stage `vitest.config.ts` and `setup.ts` here only if Task 3 didn't already commit them.)

---

## Task 5: Run the generator + commit generated MDX

**Goal:** Run the generator from Task 4 against the actual packs. Commit the ~81 generated MDX files + per-pack `meta.json` so they're version-controlled and preview builds work without re-running the script.

**Files:**

- Create (generated): `apps/docs/content/docs/tools-reference/meta.json`
- Create (generated): `apps/docs/content/docs/tools-reference/{extract,variables,console,design,figjam,slides,a11y,rest}/meta.json`
- Create (generated): `apps/docs/content/docs/tools-reference/<pack>/<tool>.mdx` × ~81

**Step 1: Run the generator**

```bash
cd /Users/jonasbroms/.config/superpowers/worktrees/bro/feat/phase-15-docs-site
bun run apps/docs/scripts/generate-tool-reference.mjs
```

Expected output:

```
generated 4 tools for tools-extract
generated 5 tools for tools-variables
generated 6 tools for tools-console
generated 12 tools for tools-design
generated 10 tools for tools-figjam
generated 15 tools for tools-slides
generated 13 tools for tools-a11y
generated 20 tools for tools-rest
```

Total: ~85 tool MDX files (the actual count depends on each pack's exports).

**Step 2: Verify the output**

```bash
find apps/docs/content/docs/tools-reference -name "*.mdx" | wc -l
ls apps/docs/content/docs/tools-reference/extract/
cat apps/docs/content/docs/tools-reference/extract/extract_styles.mdx
```

Spot-check one MDX for sanity — frontmatter present, `<ToolReference>` invocation present, JSON looks reasonable.

**Step 3: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

Expected: clean build. Fumadocs walks the `tools-reference/` tree, indexes every tool page.

**Step 4: Smoke-test rendering**

```bash
bunx serve apps/docs/out
```

Visit `http://localhost:3000/bro/docs/tools-reference/extract/extract_styles` (or whichever pack/tool). The page should render with the input/output tables.

**Step 5: Commit**

```bash
git add apps/docs/content/docs/tools-reference
git commit -m "docs(site): commit generated tool reference (~85 tools)"
```

---

## Task 6: Wire generator into the build pipeline

**Goal:** `bun run build` regenerates the tool reference before Next builds. Local development (`bun run dev`) can opt in via `bun run regen-tools && bun run dev`. CI runs the generator as part of the build.

**Files:**

- Modify: `apps/docs/package.json` — `build` script + new `regen-tools` script
- Modify: `.github/workflows/docs.yml` — no change needed (already runs `bun run docs:build` which will pick this up)

**Step 1: Update `apps/docs/package.json`**

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "regen-tools": "node scripts/generate-tool-reference.mjs",
    "build": "node scripts/generate-tool-reference.mjs && next build",
    "start": "next start",
    "lint": "biome check .",
    "test": "vitest run"
  }
}
```

(Use `node`, not `bun`, because the script is plain ESM JS that doesn't need bun-specific behavior. Either works; `node` is more portable.)

**Step 2: Verify**

```bash
cd /Users/jonasbroms/.config/superpowers/worktrees/bro/feat/phase-15-docs-site
GITHUB_PAGES=true bun run --filter @repo/docs build
```

Expected: generator runs first, then Next builds. Clean output. The committed MDX from Task 5 should be unchanged after the regen — verify with:

```bash
git status apps/docs/content/docs/tools-reference
```

Expected: clean (the generator is idempotent — running again produces the same files).

If the generator's output drifts from the committed files, the diff is informative — most likely a tool was added or its description changed since Task 5. That's fine; it just means the generator is doing its job.

**Step 3: Commit**

```bash
git add apps/docs/package.json
git commit -m "build(docs): regenerate tool reference before next build"
```

---

## Task 7: Pack pages 1-4 (extract, variables, console, design)

**Goal:** Hand-write four pack overview pages. Same template across all 8 (Tasks 7-8); these four cover the universal/figma-design packs.

**Files:**

- Modify: `apps/docs/content/docs/tools/extract.mdx`
- Modify: `apps/docs/content/docs/tools/variables.mdx`
- Modify: `apps/docs/content/docs/tools/console.mdx`
- Modify: `apps/docs/content/docs/tools/design.mdx`
- Modify: `apps/docs/content/docs/tools/index.mdx` (the 8-pack overview table)

**Step 1: Write `tools/index.mdx`**

```mdx
---
title: Tool packs
description: figma-mcp ships ~85 tools across 8 packs. Browse by pack to see what each one covers.
---

The figma-mcp registry groups tools into eight packs. Each pack targets a specific surface — extracting state, mutating the canvas, capturing logs, hitting the REST API. This page lists every pack with its scope; click into a pack page for the tool list and a short example.

| Pack | Scope | Editor | Tools |
| ---- | ----- | ------ | ----- |
| [extract](/docs/tools/extract) | Read selection, page, components, variables, styles | Universal | 4 |
| [variables](/docs/tools/variables) | Read/write Figma variables; streamed import | Universal | 5 |
| [console](/docs/tools/console) | Capture and query the bridge plugin's console output | Universal (plugin sandbox) | 6 |
| [design](/docs/tools/design) | Mutate the canvas — shapes, text, fills, components | Figma Design only | 12 |
| [figjam](/docs/tools/figjam) | Sticky notes, sections, connectors, code blocks, tables | FigJam only | 10 |
| [slides](/docs/tools/slides) | Slide creation, layout, transitions, presentation grid | Slides only | 15 |
| [a11y](/docs/tools/a11y) | WCAG audits, color-blindness simulation, alt-text and ARIA | Universal | 13 |
| [rest](/docs/tools/rest) | REST-API-backed reads — works without a paired plugin | Universal (cloud-mode) | 20 |

## Editor-type discriminator

Some packs only work in a specific Figma editor — figjam tools require `editorType === "figjam"`, slides tools require `"slides"`. Calling a gated tool from the wrong editor returns `E_FIGMA_EDITOR_TYPE_MISMATCH` from the plugin handler. The remaining packs (extract, variables, console, a11y, rest) are universal.

## Cloud-mode-without-plugin

The `rest` pack is special: its tools call the Figma REST API directly via `FIGMA_API_KEY` in the daemon's environment. They work even when no bridge plugin is paired, which is the entire point of the cloud-mode setup path. See [Cloud mode](/docs/get-started/cloud).

## Tool reference

Every tool also has a generated reference page with its full input/output schema — see [Tool reference](/docs/tools-reference) for the alphabetical index.
```

**Step 2: Write `tools/extract.mdx`**

```mdx
---
title: extract pack
description: Read selection, page, components, variables, and styles from the active Figma file.
---

The `extract` pack surfaces the document state your AI client needs to reason about a design. Every tool is read-only and runs against the bridge plugin's view of the current file.

## When to use

- Your AI is generating code from a Figma component and needs the component's metadata.
- A workflow needs the file's variables (design tokens) or styles to ground its output.
- A diagnostic prompt asks "what's on this page?".

## Editor

Universal — works in Figma, FigJam, and Slides files (limited to the surface each editor exposes).

## Tools

| Tool | What it returns |
| ---- | --------------- |
| [extract_styles](/docs/tools-reference/extract/extract_styles) | All local paint/text/effect styles. |
| [extract_components](/docs/tools-reference/extract/extract_components) | All local components. |
| [extract_local_variables](/docs/tools-reference/extract/extract_local_variables) | All local variables on the file. |
| [bridge_status](/docs/tools-reference/extract/bridge_status) | Daemon liveness + plugin pairing status. |

## Quick example

```text
Using figma-mcp, list every paint style and emit a JSON snapshot.
```

The AI calls `extract_styles`, gets back a list of paint styles with id/name/description, and renders the requested JSON.

## Recipes using this pack

- [Extract design tokens](/docs/recipes/extract-design-tokens)
- [Document components](/docs/recipes/document-components)
```

**Step 3: Write `tools/variables.mdx`**

```mdx
---
title: variables pack
description: Read and write Figma variables; bulk-import via streamed pagination.
---

The `variables` pack handles design-token operations: read collections and individual variables, mutate values across modes, bulk-import from JSON, and stream large imports back as progress events.

## When to use

- Your design system stores tokens as Figma variables and you want them in code.
- You're migrating tokens between files.
- You need to set a variable value across multiple modes in one call.

## Editor

Universal.

## Tools

| Tool | What it does |
| ---- | ------------ |
| [export_variables](/docs/tools-reference/variables/export_variables) | Cursor-paginated read of every variable + collection. |
| [update_variables_batch](/docs/tools-reference/variables/update_variables_batch) | Set value-per-mode across N variables in one call. |
| [import_variables](/docs/tools-reference/variables/import_variables) | Bulk-create variables and collections from a JSON spec; streams progress. |
| [stream_status](/docs/tools-reference/variables/stream_status) | Inspect a streaming import's progress / cancel. |

## Streaming behavior

`import_variables` is a streaming tool — it emits `notifications/progress` envelopes as it processes batches. Tool clients that don't support progress notifications still get the final result; clients that do (Claude Code, Cursor) render a progress bar.

## Quick example

```text
Import these design tokens into the Figma file's variables. Replace existing values where names match.
```

## Recipes using this pack

- [Extract design tokens](/docs/recipes/extract-design-tokens)
```

**Step 4: Write `tools/console.mdx`**

```mdx
---
title: console pack
description: Capture and query the bridge plugin's console output. Useful for debugging during plugin development.
---

The `console` pack exposes a 1000-entry ring buffer of every `console.{log,warn,error,info}` call inside the bridge plugin's sandbox. Tools query the buffer; the bridge plugin patches the global `console` at boot.

## When to use

- A plugin you're developing is throwing errors and you want the AI to surface them.
- You want a digest of recent warnings without scrolling Figma's console.
- You're writing code that depends on plugin runtime state and want a feedback loop.

## Editor

Universal — runs in any editor where the bridge plugin is paired.

## Tools

| Tool | What it returns |
| ---- | --------------- |
| [get_console_logs](/docs/tools-reference/console/get_console_logs) | Recent entries (any level), optional limit. |
| [get_console_errors](/docs/tools-reference/console/get_console_errors) | Recent error-level entries only. |
| [get_console_warnings](/docs/tools-reference/console/get_console_warnings) | Recent warn-level entries only. |
| [query_console](/docs/tools-reference/console/query_console) | Regex filter over message text. |
| [console_status](/docs/tools-reference/console/console_status) | Buffer counts (total, per-level, dropped). |
| [clear_console](/docs/tools-reference/console/clear_console) | Empty the buffer. |

## DoS guard

`query_console` caps the regex pattern at 200 chars and truncates each message to the first 1000 chars before testing. Pathological backtracking patterns finish in ms-scale time even against large messages.

## Recipes using this pack

- [Capture plugin console errors](/docs/recipes/debug-plugin-console)
```

**Step 5: Write `tools/design.mdx`**

```mdx
---
title: design pack
description: Mutate the Figma Design canvas — create shapes, text, components; set fills, strokes, layout.
---

The `design` pack covers canvas mutation: creating primitive nodes, editing their content, setting paints, and packaging into components. All tools require `editorType === "figma"`; calling them in a FigJam or Slides file returns `E_FIGMA_EDITOR_TYPE_MISMATCH` immediately.

## When to use

- The AI is asked to assemble a wireframe from a description.
- You want to bulk-update fills across selected nodes.
- A workflow generates UI from prose.

## Editor

Figma Design only.

## Tools

| Tool | What it does |
| ---- | ------------ |
| [create_rectangle](/docs/tools-reference/design/create_rectangle) | Create a rectangle. |
| [create_frame](/docs/tools-reference/design/create_frame) | Create a frame (auto-layout-capable container). |
| [create_ellipse](/docs/tools-reference/design/create_ellipse) | Create an ellipse. |
| [create_line](/docs/tools-reference/design/create_line) | Create a line between two endpoints. |
| [create_text](/docs/tools-reference/design/create_text) | Create a text node. |
| [set_text_content](/docs/tools-reference/design/set_text_content) | Replace a text node's characters. |
| [set_fill](/docs/tools-reference/design/set_fill) | Set a node's fill (single SOLID paint). |
| [set_stroke](/docs/tools-reference/design/set_stroke) | Set a node's stroke + weight. |
| [resize_node](/docs/tools-reference/design/resize_node) | Resize a node's bounding box. |
| [clone_node](/docs/tools-reference/design/clone_node) | Duplicate a node; returns the clone's id. |
| [delete_node](/docs/tools-reference/design/delete_node) | Remove a node. |
| [create_component](/docs/tools-reference/design/create_component) | Wrap a node into a component definition. |

## Paint shape

`set_fill` and `set_stroke` accept a single SOLID paint:

```json
{ "type": "SOLID", "color": { "r": 1, "g": 0, "b": 0 }, "opacity": 0.5 }
```

Multi-paint variants (gradients, image fills) are not supported in v1.

## Recipes using this pack

- [Build a UI from a description](/docs/recipes/ui-from-description)
- [Document components](/docs/recipes/document-components)
```

**Step 6: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

Expected: clean build, all pack pages render.

**Step 7: Commit**

```bash
git add apps/docs/content/docs/tools/{index,extract,variables,console,design}.mdx
git commit -m "docs(site): pack pages — extract, variables, console, design"
```

---

## Task 8: Pack pages 5-8 (figjam, slides, a11y, rest)

**Goal:** Same template as Task 7; covers FigJam-only, Slides-only, universal-a11y, and REST/cloud packs.

**Files:**

- Modify: `apps/docs/content/docs/tools/figjam.mdx`
- Modify: `apps/docs/content/docs/tools/slides.mdx`
- Modify: `apps/docs/content/docs/tools/a11y.mdx`
- Modify: `apps/docs/content/docs/tools/rest.mdx`

**Step 1: Write `tools/figjam.mdx`**

```mdx
---
title: figjam pack
description: FigJam-specific tools — sticky notes, sections, connectors, code blocks, tables.
---

The `figjam` pack covers the whiteboarding surface: sticky notes, labeled sections, connectors between nodes, code blocks, shape-with-text, and tables. Every tool requires `editorType === "figjam"`; the `requireFigJam(figma, toolName)` guard runs first and returns `E_FIGMA_EDITOR_TYPE_MISMATCH` if the editor is wrong.

## When to use

- The AI is filling a brainstorming board with stickies.
- You want to organize an existing FigJam file (move things into sections).
- A diagram tool generates connectors programmatically.

## Editor

FigJam only.

## Tools

| Tool | What it does |
| ---- | ------------ |
| [create_sticky](/docs/tools-reference/figjam/create_sticky) | Create a sticky note. |
| [create_section](/docs/tools-reference/figjam/create_section) | Create a labeled section. |
| [create_connector](/docs/tools-reference/figjam/create_connector) | Connect two existing nodes. |
| [create_code_block](/docs/tools-reference/figjam/create_code_block) | Embed a code block with a language label. |
| [create_shape_with_text](/docs/tools-reference/figjam/create_shape_with_text) | Shape (square/ellipse/diamond/...) with inline text. |
| [create_table](/docs/tools-reference/figjam/create_table) | Create a table grid. |
| [set_sticky_content](/docs/tools-reference/figjam/set_sticky_content) | Replace a sticky's content. |
| [set_section_name](/docs/tools-reference/figjam/set_section_name) | Rename a section. |
| [move_into_section](/docs/tools-reference/figjam/move_into_section) | Add nodes to a section. |
| [list_section_children](/docs/tools-reference/figjam/list_section_children) | Enumerate node ids in a section. |

## Recipes using this pack

(No specific recipes for figjam in v1; see [Build a UI from a description](/docs/recipes/ui-from-description) for a similar pattern.)
```

**Step 2: Write `tools/slides.mdx`**

```mdx
---
title: slides pack
description: Figma Slides tools — slide creation, layout, transitions, lifecycle, grid queries.
---

The `slides` pack covers the Slides editor: creating slides and rows, editing names and visibility, configuring transitions, and querying the slide grid. Every tool requires `editorType === "slides"`.

## When to use

- The AI is generating a deck from an outline.
- You want to reorder a deck programmatically.
- A workflow tweaks every slide's transition in one pass.

## Editor

Slides only.

## Tools

| Tool | What it does |
| ---- | ------------ |
| [create_slide](/docs/tools-reference/slides/create_slide) | Create a slide; appended by default. |
| [create_slide_row](/docs/tools-reference/slides/create_slide_row) | Create a slide row. |
| [set_slide_name](/docs/tools-reference/slides/set_slide_name) | Set a slide's title (the slide's name is the title surface). |
| [set_slide_skipped](/docs/tools-reference/slides/set_slide_skipped) | Toggle whether a slide is skipped during playback. |
| [set_slide_transition](/docs/tools-reference/slides/set_slide_transition) | Set the slide-to-slide transition. |
| [set_slide_background](/docs/tools-reference/slides/set_slide_background) | Set a slide's background paint. |
| [move_slide](/docs/tools-reference/slides/move_slide) | Move a slide to a (rowIndex, columnIndex). |
| [duplicate_slide](/docs/tools-reference/slides/duplicate_slide) | Clone a slide. |
| [delete_slide](/docs/tools-reference/slides/delete_slide) | Remove a slide. |
| [list_slides](/docs/tools-reference/slides/list_slides) | Enumerate slide ids. |
| [list_slide_rows](/docs/tools-reference/slides/list_slide_rows) | Enumerate slide row ids. |
| [set_active_slide](/docs/tools-reference/slides/set_active_slide) | Focus a slide. |
| [get_slide](/docs/tools-reference/slides/get_slide) | Get a slide's name + skipped + transition. |
| [set_slides_view](/docs/tools-reference/slides/set_slides_view) | Toggle viewport between grid and single-slide. |
| [get_slide_grid](/docs/tools-reference/slides/get_slide_grid) | Get the 2D grid of slide ids. |

## Limitations

The plugin API doesn't expose presentation-mode automation, audience-side cursor chat, or speaker notes. Those surfaces are out of scope for the pack.

## Recipes using this pack

- [Generate slides from a markdown outline](/docs/recipes/slides-from-outline)
```

**Step 3: Write `tools/a11y.mdx`**

```mdx
---
title: a11y pack
description: Accessibility audits and annotations — WCAG 2.2 contrast and target-size, color-blindness simulation, alt-text and ARIA labels.
---

The `a11y` pack runs accessibility audits and writes a11y metadata into the file. Unlike figjam/slides packs, a11y is **not editor-type-gated** — accessibility concerns apply to Figma Design AND FigJam files. Tools work on either editor.

## When to use

- A pre-handoff QA prompt: "audit this frame for a11y issues."
- The AI is generating components and should annotate them with alt-text + ARIA labels.
- A designer wants to validate a brand color against color-vision deficiencies.

## Editor

Universal (Figma Design + FigJam).

## Tools

| Tool | What it does |
| ---- | ------------ |
| [audit_contrast](/docs/tools-reference/a11y/audit_contrast) | WCAG 2.x contrast ratio for a node's text fill against its resolved background. |
| [audit_target_size](/docs/tools-reference/a11y/audit_target_size) | WCAG 2.5.5 target-size check (24×24 minimum, 44×44 preferred). |
| [audit_a11y_summary](/docs/tools-reference/a11y/audit_a11y_summary) | Composite recursive audit; aggregates contrast/target-size/alt-text/aria-label. |
| [simulate_color_blindness](/docs/tools-reference/a11y/simulate_color_blindness) | Pure utility: simulate how a hex appears under protanopia/deuteranopia/tritanopia/achromatopsia. |
| [set_alt_text](/docs/tools-reference/a11y/set_alt_text) | Write alt text (pluginData + annotation). |
| [get_alt_text](/docs/tools-reference/a11y/get_alt_text) | Read alt text. |
| [set_aria_label](/docs/tools-reference/a11y/set_aria_label) | Write an ARIA label (pluginData only). |
| [get_aria_label](/docs/tools-reference/a11y/get_aria_label) | Read the ARIA label. |
| [set_landmark_role](/docs/tools-reference/a11y/set_landmark_role) | Tag a node with a WAI-ARIA landmark role. |
| [get_landmark_role](/docs/tools-reference/a11y/get_landmark_role) | Read the landmark role tag. |
| [list_annotations](/docs/tools-reference/a11y/list_annotations) | List a node's annotations. |
| [add_annotation](/docs/tools-reference/a11y/add_annotation) | Append an annotation. |
| [remove_annotation](/docs/tools-reference/a11y/remove_annotation) | Remove an annotation by index. |

## WCAG version

Phase 13 ships against WCAG 2.2:

- AA contrast: 4.5:1 normal text, 3:1 large text.
- AAA contrast: 7:1 normal text, 4.5:1 large text.
- Target size: 24×24 CSS px minimum, 44×44 preferred (SC 2.5.5).

APCA / WCAG 3.0 are not yet in scope.

## Recipes using this pack

- [Audit a frame's accessibility](/docs/recipes/audit-accessibility)
- [Document components](/docs/recipes/document-components)
```

**Step 4: Write `tools/rest.mdx`**

```mdx
---
title: rest pack
description: Cloud-mode-without-plugin reads — 20 tools backed by the Figma REST API. Three are write-gated.
---

The `rest` pack is architecturally different from every other pack: tools call the Figma REST API directly via `FIGMA_API_KEY` in the daemon's environment. They work whenever the env var is set — even if the bridge plugin is not paired and Figma Desktop is not running. This is the entire point of "cloud mode without plugin."

## When to use

- You want to audit a Figma file from CI / a remote workflow.
- You don't have Figma Desktop running but you have a token.
- A bulk read across many files (the REST API is rate-limited but scales better than plugin invocations).

## Editor

Universal — REST endpoints don't care about editor type.

## Auth

Requires `FIGMA_API_KEY` in the daemon's env. With the env unset, every REST tool returns `E_FIGMA_API_KEY_MISSING` per call. The doctor's `figma-api-key` check warns when the env is missing — see [troubleshooting](/docs/reference/troubleshooting).

## Write tools are gated

Three tools mutate files (`post_file_comment`, `delete_file_comment`, `post_dev_resources`). They're gated behind a `--enable-write-tools` daemon flag (default off). With the flag off, they return `E_WRITE_TOOLS_DISABLED` immediately. Default-off prevents prompt-driven mass commenting / spam dev resources.

## Tools

### File metadata

| Tool | What it returns |
| ---- | --------------- |
| [get_file_metadata](/docs/tools-reference/rest/get_file_metadata) | Name, lastModified, version, role, editorType. |
| [get_file_pages](/docs/tools-reference/rest/get_file_pages) | Top-level pages (CANVAS children). |
| [get_node_by_id](/docs/tools-reference/rest/get_node_by_id) | Type/name of a specific node. |
| [get_file_versions](/docs/tools-reference/rest/get_file_versions) | Version history. |

### File catalog

| Tool | What it returns |
| ---- | --------------- |
| [get_file_styles](/docs/tools-reference/rest/get_file_styles) | Local styles bucketed by type. |
| [get_file_components](/docs/tools-reference/rest/get_file_components) | Published components. |
| [get_file_component_sets](/docs/tools-reference/rest/get_file_component_sets) | Published component sets (variants). |
| [get_file_branches](/docs/tools-reference/rest/get_file_branches) | Branches. |

### Assets + identity

| Tool | What it returns |
| ---- | --------------- |
| [get_image_renders](/docs/tools-reference/rest/get_image_renders) | Rendered PNG/SVG/PDF/JPG of node ids — presigned URLs. |
| [get_image_fills](/docs/tools-reference/rest/get_image_fills) | Image fill asset URLs. |
| [get_user_me](/docs/tools-reference/rest/get_user_me) | Authenticated user's profile. |

### Comments (2 write-gated)

| Tool | What it does |
| ---- | ------------ |
| [get_file_comments](/docs/tools-reference/rest/get_file_comments) | Read all comments. |
| [post_file_comment](/docs/tools-reference/rest/post_file_comment) | **Write-gated** — post a new comment. |
| [delete_file_comment](/docs/tools-reference/rest/delete_file_comment) | **Write-gated** — delete a comment. |

### Team / project

| Tool | What it returns |
| ---- | --------------- |
| [get_team_projects](/docs/tools-reference/rest/get_team_projects) | All projects in a team. |
| [get_project_files](/docs/tools-reference/rest/get_project_files) | All files in a project. |
| [get_team_components](/docs/tools-reference/rest/get_team_components) | Cursor-paginated team components. |

### Team catalog + dev resources (1 write-gated)

| Tool | What it does |
| ---- | ------------ |
| [get_team_styles](/docs/tools-reference/rest/get_team_styles) | Cursor-paginated team styles. |
| [get_dev_resources](/docs/tools-reference/rest/get_dev_resources) | Read Dev Mode resources. |
| [post_dev_resources](/docs/tools-reference/rest/post_dev_resources) | **Write-gated** — add Dev Mode resources. |

## Recipes using this pack

- [Audit a Figma file via cloud mode](/docs/recipes/audit-via-cloud)
```

**Step 5: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

**Step 6: Commit**

```bash
git add apps/docs/content/docs/tools/{figjam,slides,a11y,rest}.mdx
git commit -m "docs(site): pack pages — figjam, slides, a11y, rest"
```

---

## Task 9: Recipe pages 1-4

**Goal:** First four recipes — extract design tokens, audit a11y, slides from outline, UI from description. Same template across all 7 recipes.

**Files:**

- Modify: `apps/docs/content/docs/recipes/index.mdx` (recipe overview)
- Modify: `apps/docs/content/docs/recipes/extract-design-tokens.mdx`
- Modify: `apps/docs/content/docs/recipes/audit-accessibility.mdx`
- Modify: `apps/docs/content/docs/recipes/slides-from-outline.mdx`
- Modify: `apps/docs/content/docs/recipes/ui-from-description.mdx`

**Step 1: Write `recipes/index.mdx`**

```mdx
---
title: Recipes
description: Copy-paste prompts that turn figma-mcp's tools into common workflows.
---

Recipes are concrete prompts that the AI client parses, dispatches across the right tools, and returns useful output. Each recipe documents the literal text you can paste in, what tool flow it triggers, and how to adapt it.

| Recipe | What it produces |
| ------ | ---------------- |
| [Extract design tokens](/docs/recipes/extract-design-tokens) | A JSON snapshot of every variable + style. |
| [Audit a frame's accessibility](/docs/recipes/audit-accessibility) | A structured a11y report (contrast / target-size / alt-text). |
| [Generate slides from a markdown outline](/docs/recipes/slides-from-outline) | A populated Slides deck. |
| [Build a UI from a description](/docs/recipes/ui-from-description) | A wireframe assembled from primitives. |
| [Audit a Figma file via cloud mode](/docs/recipes/audit-via-cloud) | A read-only audit using just `FIGMA_API_KEY`. |
| [Capture plugin console errors](/docs/recipes/debug-plugin-console) | Recent errors / warnings for a plugin in development. |
| [Document components](/docs/recipes/document-components) | Components annotated with alt-text + ARIA + landmark roles. |

Recipes are deliberately short — most are copy-paste and tweak. For a deeper view of any tool, click into [Tool reference](/docs/tools-reference).
```

**Step 2: Write `recipes/extract-design-tokens.mdx`**

```mdx
---
title: Extract design tokens
description: Snapshot every variable and style as JSON for handoff or migration.
---

## The prompt

```text
Using figma-mcp, list every variable and every paint/text/effect style on the current Figma file. Format the result as JSON with two keys: "variables" (one entry per variable with id, name, type, valuesByMode) and "styles" (bucketed by paint/text/effect).
```

## What happens

The AI invokes `extract_local_variables` and `extract_styles` in parallel, merges the responses, and emits the JSON. On a typical design-system file this produces a few KB of output — small enough to drop into a handoff doc or a migration script.

## Tools used

- [extract_local_variables](/docs/tools-reference/extract/extract_local_variables)
- [extract_styles](/docs/tools-reference/extract/extract_styles)

## Variations

- "…limit variables to the `Color` collection only." Adds a filter to the prompt; the AI post-filters the response.
- "…also include component metadata." Adds [extract_components](/docs/tools-reference/extract/extract_components) to the flow.
- "…format as TypeScript const exports instead of JSON." The AI just transforms its output.

## Troubleshooting

- "The variables list is empty." Ensure you have local variables on the file (not just team-library references). [Pair the bridge plugin](/docs/get-started) before running the prompt.
```

**Step 3: Write `recipes/audit-accessibility.mdx`**

```mdx
---
title: Audit a frame's accessibility
description: Walk a frame and report contrast / target-size / alt-text gaps.
---

## The prompt

```text
Using figma-mcp, run audit_a11y_summary on the currently selected frame (recursive). Summarize the results: how many checks passed/warned/errored, which nodes are the worst offenders, and three concrete fixes I can apply.
```

## What happens

The AI calls `audit_a11y_summary` with `recursive: true` on the selected node. The composite audit walks the frame, runs `audit_contrast` + `audit_target_size` + alt-text / aria-label / landmark-role checks per descendant, and returns a structured report. The AI then summarizes.

## Tools used

- [audit_a11y_summary](/docs/tools-reference/a11y/audit_a11y_summary)
- (Internally: [audit_contrast](/docs/tools-reference/a11y/audit_contrast), [audit_target_size](/docs/tools-reference/a11y/audit_target_size), and the get-alt-text / get-aria-label / get-landmark-role primitives.)

## Variations

- "…non-recursive — only audit the frame itself." Pass `recursive: false`.
- "…also simulate the frame's primary brand color under deuteranopia." Adds [simulate_color_blindness](/docs/tools-reference/a11y/simulate_color_blindness) for one extra call.
- "…fix the alt-text issues by writing the missing alt strings yourself." The AI loops [set_alt_text](/docs/tools-reference/a11y/set_alt_text) per gap.

## Troubleshooting

- The contrast check returns null with "no resolvable background fill on ancestors." Add a SOLID fill to the frame's parent, or move the node into a parent that has one. Gradients and translucent fills are intentionally not auto-evaluated.
```

**Step 4: Write `recipes/slides-from-outline.mdx`**

```mdx
---
title: Generate slides from a markdown outline
description: Turn a flat outline into a populated Slides deck.
---

## The prompt

````text
Using figma-mcp on the currently open Figma Slides file, create one slide per top-level heading in this outline. Set each slide's name to the heading text. Skip any slide whose heading starts with "(skip)".

```
# Welcome
## Agenda
## Demo
# Outcomes
## Q & A
# (skip) Notes for the speaker
```
````

## What happens

The AI parses the outline, then loops:

1. `create_slide` — produces a SLIDE node, returns its id.
2. `set_slide_name` — sets the title.
3. `set_slide_skipped` — when the heading is `(skip)`, marks the slide hidden during playback.

After every iteration the AI updates a running list of `(rowIndex, columnIndex, slideId)` so the deck order matches the outline.

## Tools used

- [create_slide](/docs/tools-reference/slides/create_slide)
- [set_slide_name](/docs/tools-reference/slides/set_slide_name)
- [set_slide_skipped](/docs/tools-reference/slides/set_slide_skipped)

## Variations

- "…also set every slide's transition to `DISSOLVE` with a 300ms duration." Add [set_slide_transition](/docs/tools-reference/slides/set_slide_transition) per iteration.
- "…tint each slide's background with this hex." Add [set_slide_background](/docs/tools-reference/slides/set_slide_background) per iteration.
- "…delete every existing slide first." Run `list_slides` + `delete_slide` in a clean-up phase.

## Troubleshooting

- `E_FIGMA_EDITOR_TYPE_MISMATCH`. The current Figma file is not a Slides file. Open a Slides file and re-run.
```

**Step 5: Write `recipes/ui-from-description.mdx`**

```mdx
---
title: Build a UI from a description
description: Assemble a wireframe from a prose description using primitive shape and text tools.
---

## The prompt

```text
Using figma-mcp, build a wireframe of a sign-in form on the current Figma Design page:

- 360 × 480 frame, white background, centered.
- "Sign in" heading at the top, 24pt.
- Email input (rectangle, 320 × 44, 8px from heading), placeholder text "you@example.com".
- Password input below it, same shape.
- Primary button (320 × 48, blue #0066FF) with "Sign in" text.
- Forgot password link below the button, 14pt.
```

## What happens

The AI plans the layout (positions the frame, then computes child x/y), then issues a sequence of:

- `create_frame` — outer container.
- `create_text` × 4 — heading, two placeholders, button label, link.
- `create_rectangle` × 3 — two input backgrounds + button background.
- `set_fill` × 3 — input + button colors.

Roughly 10-15 tool calls. The AI returns the frame id; you nudge the result in Figma to taste.

## Tools used

- [create_frame](/docs/tools-reference/design/create_frame)
- [create_rectangle](/docs/tools-reference/design/create_rectangle)
- [create_text](/docs/tools-reference/design/create_text)
- [set_fill](/docs/tools-reference/design/set_fill)

## Variations

- "…also wrap the result into a component when done." Adds [create_component](/docs/tools-reference/design/create_component).
- "…stroke the inputs with a 1px gray border." Adds [set_stroke](/docs/tools-reference/design/set_stroke).
- "…annotate every input with an ARIA label matching its placeholder." Adds [set_aria_label](/docs/tools-reference/a11y/set_aria_label).

## Troubleshooting

- The AI gets the geometry wrong. Adjust by adding explicit pixel constraints to the prompt; the AI is better at exact numbers than relative layout.
- `E_FIGMA_EDITOR_TYPE_MISMATCH`. The current file isn't Figma Design — open a design file and re-run.
```

**Step 6: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

**Step 7: Commit**

```bash
git add apps/docs/content/docs/recipes/{index,extract-design-tokens,audit-accessibility,slides-from-outline,ui-from-description}.mdx
git commit -m "docs(site): recipes 1-4 (extract tokens, audit a11y, slides, UI)"
```

---

## Task 10: Recipe pages 5-7

**Goal:** Last three recipes — cloud-mode audit, plugin console debugging, component documentation.

**Files:**

- Modify: `apps/docs/content/docs/recipes/audit-via-cloud.mdx`
- Modify: `apps/docs/content/docs/recipes/debug-plugin-console.mdx`
- Modify: `apps/docs/content/docs/recipes/document-components.mdx`

**Step 1: Write `recipes/audit-via-cloud.mdx`**

```mdx
---
title: Audit a Figma file via cloud mode
description: Read-only audit of a remote Figma file with no Figma Desktop and no paired plugin.
---

## The prompt

```text
Using figma-mcp, audit the Figma file at https://www.figma.com/file/ABC123XYZ via the REST API. Return a summary of: page count, top-level frame count, total component count, and any styles whose name doesn't match our convention "[component]/[token]".
```

## What happens

The AI extracts the file key from the URL (`ABC123XYZ`), then runs:

1. `get_file_metadata` — name, lastModified, role.
2. `get_file_pages` — page list.
3. `get_file_components` — published components.
4. `get_file_styles` — bucketed paint/text/effect.

All four are REST calls — no bridge plugin involved. Total round-trip: 4-5 seconds.

## Prerequisites

- `FIGMA_API_KEY` in the daemon's environment. See [Cloud mode](/docs/get-started/cloud).
- The token's user has read access to the file.
- The figma-mcp daemon is running. Check with `figma-mcp doctor`.

## Tools used

- [get_file_metadata](/docs/tools-reference/rest/get_file_metadata)
- [get_file_pages](/docs/tools-reference/rest/get_file_pages)
- [get_file_components](/docs/tools-reference/rest/get_file_components)
- [get_file_styles](/docs/tools-reference/rest/get_file_styles)

## Variations

- "…also list every variable." There's no REST endpoint for variables (yet); fall back to opening the file in Figma + the [extract pack](/docs/tools/extract) for that.
- "…audit every file in this team's project." Loop with [get_team_projects](/docs/tools-reference/rest/get_team_projects) and [get_project_files](/docs/tools-reference/rest/get_project_files).
- "…also fetch a thumbnail of the cover frame." Add [get_image_renders](/docs/tools-reference/rest/get_image_renders).

## Troubleshooting

- `E_FIGMA_API_KEY_MISSING`. Set the env var and restart the daemon: `FIGMA_API_KEY=figd_… && figma-mcp doctor`.
- `E_FIGMA_REST_404`. The file key is wrong, or the token's user doesn't have access.
- `E_FIGMA_REST_AUTH`. The token is invalid or revoked.
- `E_FIGMA_REST_429`. You've hit Figma's rate limit. Wait, or add a delay between calls.
```

**Step 2: Write `recipes/debug-plugin-console.mdx`**

```mdx
---
title: Capture plugin console errors
description: Surface errors and warnings from the bridge plugin's sandbox.
---

## The prompt

```text
Using figma-mcp, fetch the most recent 20 console errors from the bridge plugin. If any of them mention "is not a function" or "undefined", suggest a likely fix.
```

## What happens

The AI calls `get_console_errors` with `limit: 20`, scans the messages, and returns a summary with suggested fixes. If you want a regex query, the AI may instead call `query_console`.

## Tools used

- [get_console_errors](/docs/tools-reference/console/get_console_errors)
- [query_console](/docs/tools-reference/console/query_console)
- [console_status](/docs/tools-reference/console/console_status) — for buffer-level diagnostics.

## Variations

- "…clear the buffer first, then run my plugin code, then fetch errors." Adds [clear_console](/docs/tools-reference/console/clear_console) at the start.
- "…tail the buffer over the next 60 seconds." The AI calls `console_status` periodically, or you can rerun the prompt.
- "…surface only error AND warn levels." Use [query_console](/docs/tools-reference/console/query_console) with a level-filter regex, or chain [get_console_errors](/docs/tools-reference/console/get_console_errors) and [get_console_warnings](/docs/tools-reference/console/get_console_warnings).

## Troubleshooting

- The buffer says `droppedCount > 0`. Your plugin is logging more than 1000 entries; older messages have rolled off. Increase the buffer's capacity (compile-time setting in the bridge plugin) or reduce the volume of `console.log` calls.
- The console store is empty. Either nothing has been logged yet, or the bridge plugin isn't paired. Run `figma-mcp doctor`.
```

**Step 3: Write `recipes/document-components.mdx`**

```mdx
---
title: Document components with a11y metadata
description: List components, then annotate each with alt-text, ARIA label, and landmark role.
---

## The prompt

```text
Using figma-mcp, list every component in the current Figma file. For each one, write an alt-text and an ARIA label based on the component's name and inferred purpose. Use the landmark role "navigation" for components named "Nav…" or "Sidebar…", "main" for components named "Page…", and skip the rest.
```

## What happens

1. `extract_components` — lists components.
2. For each: AI infers names → calls `set_alt_text`, `set_aria_label`, optionally `set_landmark_role`.

Roughly 1-3 tool calls per component. The result: every component carries pluginData under the `a11y/*` namespace + (for alt-text) a visible annotation in Figma's annotation panel.

## Tools used

- [extract_components](/docs/tools-reference/extract/extract_components)
- [set_alt_text](/docs/tools-reference/a11y/set_alt_text)
- [set_aria_label](/docs/tools-reference/a11y/set_aria_label)
- [set_landmark_role](/docs/tools-reference/a11y/set_landmark_role)

## Variations

- "…also run audit_a11y_summary against each component to flag remaining gaps." Adds [audit_a11y_summary](/docs/tools-reference/a11y/audit_a11y_summary).
- "…use landmark role 'banner' for components named 'Header…'." Adjust the inference rule in the prompt.
- "…overwrite even if alt-text is already set." The default behaviour overwrites; mention "preserve existing" in the prompt to skip when present.

## Troubleshooting

- "The component list is empty." You're looking at a file with no published components. Use [tools-rest's get_file_components](/docs/tools-reference/rest/get_file_components) for team-library components.
- An ARIA label "doesn't show up in Figma's annotation panel." That's intentional — only alt-text writes a visible annotation; ARIA labels are pluginData-only.
```

**Step 4: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

**Step 5: Commit**

```bash
git add apps/docs/content/docs/recipes/{audit-via-cloud,debug-plugin-console,document-components}.mdx
git commit -m "docs(site): recipes 5-7 (cloud audit, console debug, components)"
```

---

## Task 11: Refresh client install pages

**Goal:** The 5 per-client install pages (`clients/{claude-code,claude-desktop,cursor,windsurf,copilot}.mdx`) need a small refresh: add a "Verify with `figma-mcp doctor`" closing step where it's missing, ensure the install command uses `npx @bromso/figma-mcp@latest`, and add a link to [Cloud mode](/docs/get-started/cloud) in each page's intro.

**Files:**

- Modify: `apps/docs/content/docs/clients/claude-code.mdx`
- Modify: `apps/docs/content/docs/clients/claude-desktop.mdx`
- Modify: `apps/docs/content/docs/clients/cursor.mdx`
- Modify: `apps/docs/content/docs/clients/windsurf.mdx`
- Modify: `apps/docs/content/docs/clients/copilot.mdx`

**Step 1: Read existing content**

Each existing client page has the same five sections: Config path / What `setup` writes / Reload behavior / Verify / Troubleshooting. Phase 9's content is solid — the refresh is small.

**Step 2: Apply the same refresh to each page**

For each of the 5 pages:

a. **Add a one-line cloud-mode hint** below the existing intro paragraph:

```mdx
> Looking for a setup that doesn't require Figma Desktop? See [Cloud mode](/docs/get-started/cloud).
```

b. **Verify the install command uses `@latest`**:

```bash
rg "@bromso/figma-mcp" apps/docs/content/docs/clients
```

If any page's `args` block uses just `"@bromso/figma-mcp"` without a version, leave it (npm defaults to `@latest`). If a page pins `@1.0.0` or similar, change to `@latest`. (Most likely: no edits needed — Phase 9 wrote them as `["-y", "@bromso/figma-mcp"]` already.)

c. **Update the troubleshooting links** to use the new path: `/docs/troubleshooting#…` → `/docs/reference/troubleshooting#…`. Run:

```bash
sed -i '' 's|/docs/troubleshooting|/docs/reference/troubleshooting|g' apps/docs/content/docs/clients/*.mdx
```

(macOS `sed -i ''`; Linux is `sed -i`. The agent should pick whichever runs locally.)

**Step 3: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

**Step 4: Commit**

```bash
git add apps/docs/content/docs/clients
git commit -m "docs(site): refresh client install pages (cloud-mode hint + reference path)"
```

---

## Task 12: Refresh + add reference pages

**Goal:** Three reference pages — refresh the existing architecture and troubleshooting (to reflect 8 packs / 6 doctor checks), and add a brand-new error-codes page.

**Files:**

- Modify: `apps/docs/content/docs/reference/architecture.mdx`
- Modify: `apps/docs/content/docs/reference/troubleshooting.mdx`
- Modify: `apps/docs/content/docs/reference/error-codes.mdx` (was a stub from Task 2)

**Step 1: Refresh `reference/architecture.mdx`**

Read the existing file (moved here in Task 2). Update three things:

a. Replace the tool-pack table with the 8-pack version from `tools/index.mdx` (Task 7).

b. Add a "Cloud-mode-without-plugin" section between "Local-mode wiring" and "The MCP protocol surface":

```mdx
## Cloud-mode-without-plugin

The `tools-rest` pack (Phase 11) introduces a third mode: tools whose handlers run server-side via the daemon, calling the Figma REST API directly with a `FIGMA_API_KEY`. No bridge plugin is required. The flow:

```
+------------------+      stdio MCP       +-------------------+
|   AI client      | <------------------> |   Stdio shim      |
+------------------+                      +---------+---------+
                                                    |
                                                    v
                                          +-------------------+      HTTPS       +---------------+
                                          |   Daemon          | ───────────────► | Figma REST API |
                                          | (FigmaApiClient)  |                  +---------------+
                                          +-------------------+
```

Three of the 20 REST tools mutate (`post_file_comment`, `delete_file_comment`, `post_dev_resources`); they're gated behind the `--enable-write-tools` flag. With the flag off, write tools return `E_WRITE_TOOLS_DISABLED` immediately.
```

c. Update the "Tool packs" mini-table to the new 8-pack list (with link to `/docs/tools/<pack>` per row).

**Step 2: Refresh `reference/troubleshooting.mdx`**

Update the doctor-check enumeration: the existing page lists 5 checks (daemon-liveness, plugin-pairing, ai-client-configs, recent-errors, socket-conflict). Phase 14 added a sixth:

```mdx
### `figma-api-key` (REST tools won't work)

**Symptom.** Doctor reports `figma-api-key: warn — FIGMA_API_KEY not set`.

**Cause.** The daemon was started without `FIGMA_API_KEY` in its environment. The 20 tools in the [rest pack](/docs/tools/rest) won't function — they return `E_FIGMA_API_KEY_MISSING` per call.

**Fix.** Set the env var before starting the daemon:

```bash
export FIGMA_API_KEY=figd_…
figma-mcp doctor   # re-check
```

The check is a `warn`, not an `error` — the daemon boots fine without the key; only the REST pack is gated.
```

Insert this between `recent-errors` and `socket-conflict` (or at the end of the doctor-checks list, alphabetical-ish).

Also: link from the troubleshooting page to the new `error-codes.mdx` reference: at the top, add a one-liner "For a flat reference of every E_* code, see [Error codes](/docs/reference/error-codes)."

**Step 3: Write the new `reference/error-codes.mdx`**

```mdx
---
title: Error codes
description: Alphabetical reference of every E_* code surfaced by the daemon, the relay, and tool packs. Symptom → cause → fix per entry.
---

This is the canonical list of error codes the figma-mcp surface emits. Every code below either appears in a tool-call error result (`isError: true` with the code in the text payload) or is logged at `level=error` by the daemon. Where applicable, the [troubleshooting page](/docs/reference/troubleshooting) has the corresponding doctor check.

## E_DAEMON_PORT_BOUND

**Symptom:** Daemon fails to start: "address already in use".

**Cause:** Another process is bound to the daemon's IPC socket.

**Fix:** Identify the process (`lsof -nP /tmp/figma-mcp.sock` on macOS/Linux), kill it, and re-run.

## E_FIGMA_API_KEY_MISSING

**Symptom:** A `tools-rest` tool fails with this code.

**Cause:** The daemon was started without `FIGMA_API_KEY` in its environment.

**Fix:** Set the env var and restart the daemon. See [troubleshooting → figma-api-key](/docs/reference/troubleshooting#figma-api-key-rest-tools-wont-work).

## E_FIGMA_EDITOR_TYPE_MISMATCH

**Symptom:** A figjam, slides, or design tool fails with this code.

**Cause:** The current Figma file's `editorType` doesn't match the tool's required editor (e.g. calling `create_sticky` while a Figma Design file is open).

**Fix:** Open a file of the right editor type and re-invoke. Each pack page lists the required editor type — see [tools/figjam](/docs/tools/figjam), [tools/slides](/docs/tools/slides), [tools/design](/docs/tools/design).

## E_FIGMA_REST_404

**Symptom:** A `tools-rest` tool fails with this code.

**Cause:** The Figma REST API returned 404 — the file/team/project key is wrong, or the authenticated user doesn't have access.

**Fix:** Verify the key, verify the token's user has read access. Pass the right key.

## E_FIGMA_REST_429

**Symptom:** A `tools-rest` tool fails with this code.

**Cause:** Figma REST API rate limit. Default is 60 requests/minute per token.

**Fix:** Wait ~1 minute and retry. For bulk operations, add a delay between calls.

## E_FIGMA_REST_AUTH

**Symptom:** A `tools-rest` tool fails with this code.

**Cause:** The Figma REST API returned 401 or 403 — the token is invalid, revoked, or lacks the scope for the operation.

**Fix:** Generate a new personal access token at <https://www.figma.com/settings>, update `FIGMA_API_KEY`, restart the daemon.

## E_FIGMA_REST_UNKNOWN

**Symptom:** A `tools-rest` tool fails with this code.

**Cause:** Catch-all for unexpected REST API responses (5xx, network errors).

**Fix:** Retry. If persistent, file a bug — the upstream behaviour may have changed.

## E_PORT_CONFLICT

**Symptom:** Doctor reports `socket-conflict: error`.

**Cause:** A process other than the daemon is bound to the IPC socket path.

**Fix:** Identify the offender, kill it, delete the socket file, re-run. See [troubleshooting → socket-conflict](/docs/reference/troubleshooting#socket-conflict-portsocket-already-taken).

## E_RELAY_PAIR_FAILED

**Symptom:** `setup --cloud` fails to obtain a pairing code.

**Cause:** The relay (Cloudflare Worker) returned a non-2xx response.

**Fix:** Check the relay's status. Try `figma-mcp setup --cloud --relay-url <override>` with a different relay base URL.

## E_VERSION_DRIFT

**Symptom:** Daemon logs this on tool dispatch.

**Cause:** The shim's protocol version doesn't match the daemon's. Usually means a long-running daemon predates the shim's last `npx` cache update.

**Fix:** Stop the daemon (`pkill -f figma-mcp`); the next shim invocation respawns at the new version.

## E_WRITE_TOOLS_DISABLED

**Symptom:** `post_file_comment`, `delete_file_comment`, or `post_dev_resources` fails with this code.

**Cause:** The daemon was started without the `--enable-write-tools` flag (default off).

**Fix:** If the use case is legitimate, restart with `figma-mcp --enable-write-tools`. The flag exists to prevent prompt-driven mass mutations; only enable it when you trust the AI's calls.
```

**Step 4: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

**Step 5: Commit**

```bash
git add apps/docs/content/docs/reference
git commit -m "docs(site): refresh architecture + troubleshooting; add error-codes reference"
```

---

## Task 13: Refresh landing + Get Started + add cloud page

**Goal:** Three pages — the docs site landing (`index.mdx`), the local-mode quickstart (`get-started/index.mdx`, moved from `getting-started/`), and the new cloud-mode page (`get-started/cloud.mdx`, was a stub from Task 2).

**Files:**

- Modify: `apps/docs/content/docs/index.mdx`
- Modify: `apps/docs/content/docs/get-started/index.mdx`
- Modify: `apps/docs/content/docs/get-started/cloud.mdx`

**Step 1: Refresh `index.mdx`**

```mdx
---
title: figma-mcp
description: MCP server that lets your AI design in Figma.
---

`figma-mcp` is a Model Context Protocol server that bridges any MCP-aware AI client — Claude Code, Claude Desktop, Cursor, Windsurf, VS Code Copilot — to a running Figma instance. Through a bundled Figma plugin, it exposes ~85 tools across 8 packs: extracting state, mutating the canvas, capturing logs, hitting the REST API.

## Install

```bash
npx @bromso/figma-mcp setup
```

`setup` auto-detects installed AI clients, writes their MCP config entries, and prints a verification command. See [Quickstart](/docs/get-started) for the full walkthrough.

## Verify

```bash
figma-mcp doctor
```

Reports daemon liveness, plugin pairing, AI-client config drift, recent errors, socket conflicts, and FIGMA_API_KEY presence (six parallel checks).

## What's in the box

- 8 tool packs, ~85 tools total — see [Tools](/docs/tools).
- A bundled bridge plugin you drag-import once.
- An optional cloud relay for environments without local IPC — see [Cloud mode](/docs/get-started/cloud).
- A diagnostic CLI (`figma-mcp doctor`) and a per-client setup writer.

## Quick links

- [Quickstart](/docs/get-started) — full first-run flow, ~3 minutes.
- [Per-client install](/docs/clients) — config paths and verification per AI client.
- [Tools](/docs/tools) — browse the 8 packs.
- [Tool reference](/docs/tools-reference) — every tool's input / output schema.
- [Recipes](/docs/recipes) — copy-paste prompts for common workflows.
- [Architecture](/docs/reference/architecture) — how it works.
- [Troubleshooting](/docs/reference/troubleshooting) — what doctor catches and how to fix.
- [Error codes](/docs/reference/error-codes) — alphabetical E_* reference.
```

**Step 2: Refresh `get-started/index.mdx`**

Read the existing file (moved from `getting-started/index.mdx` in Task 2). The Phase 9 content is mostly accurate — three things to update:

a. Add a one-line cloud-mode hint after step 1 ("Install figma-mcp"):

```mdx
> If your AI client is on a different machine than Figma Desktop, see [Cloud mode](/docs/get-started/cloud) instead.
```

b. Update the doctor verification step's expected output to mention 6 checks (was 5 in Phase 9):

```mdx
A clean run prints all six checks as `ok`. The sixth check (`figma-api-key`) is a `warn` if you haven't set `FIGMA_API_KEY` — that's fine for local-mode. See [troubleshooting](/docs/reference/troubleshooting) for any non-`ok` checks.
```

c. Verify the "Step 5: Issue your first tool call" mentions one of the now-shipping tools — a concrete example like `bridge_status` works (universal, doesn't require any specific editor).

**Step 3: Write `get-started/cloud.mdx`**

```mdx
---
title: Cloud mode
description: Pair figma-mcp with the relay or run REST-only with a Figma personal access token. Works without local Figma Desktop.
---

Cloud mode is for setups where the AI client and Figma Desktop aren't on the same machine. Two flavors:

- **Relay-based pairing** — the bridge plugin connects to a Cloudflare Worker relay; the AI client speaks Streamable HTTP to the relay. Useful for sandboxed dev containers and corp laptops where local IPC is locked down.
- **REST-only** — set `FIGMA_API_KEY`, run the daemon. The 20 tools in the [rest pack](/docs/tools/rest) work; the rest of the packs are gated behind a paired bridge plugin.

You can use either or both — they're independent.

## REST-only setup

This is the simplest cloud path. No relay, no plugin, just the daemon + an API token.

### 1. Generate a Figma personal access token

Go to <https://www.figma.com/settings> → "Personal access tokens" → "Create new token". Give it the scopes your tools need (most REST tools just need `file_content:read`).

### 2. Export the token

```bash
export FIGMA_API_KEY=figd_…
```

Add the line to your shell profile so the env var sticks across sessions.

### 3. Verify

```bash
figma-mcp doctor
```

The `figma-api-key` check should report `ok`. You're done — the [rest pack's 20 tools](/docs/tools/rest) are now callable from your AI client.

## Relay-based setup (full pairing)

The relay is for when you also want bridge-plugin-based tools (everything except the REST pack) to work without local IPC. This setup involves a 6-digit pairing code, similar to Cast/AirPlay.

```bash
figma-mcp setup --cloud
```

The CLI:

1. POSTs to the relay's `/pair` endpoint, gets a `{code, sessionId, expiresAt}` response.
2. Prints a banner with the 6-digit code and a 5-minute expiry timer.
3. Writes the AI client config with a Streamable HTTP entry pointing at `https://relay/mcp/{sessionId}`.

You then enter the code in the bridge plugin's "Pair via cloud" prompt; the plugin opens a WebSocket to the relay; the AI's Streamable HTTP request arrives at the relay, gets forwarded to the plugin, and the response streams back as SSE.

### Variations

- `--relay-url <url>` overrides the relay base URL (useful for self-hosted relays).
- `--client <id>` writes only the named client's config (`claude-code`, `cursor`, etc.).

## Troubleshooting

- `E_FIGMA_API_KEY_MISSING` from a REST tool — the env var isn't visible to the daemon. Restart the daemon after exporting it.
- `E_RELAY_PAIR_FAILED` from `setup --cloud` — the relay returned a non-2xx. Check the relay's status, or override the URL.
- "Pairing code expired" in the bridge plugin — codes have a 5-minute TTL. Rerun `setup --cloud`.

See also: [error-codes reference](/docs/reference/error-codes).
```

**Step 4: Build and verify**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

**Step 5: Commit**

```bash
git add apps/docs/content/docs/index.mdx apps/docs/content/docs/get-started
git commit -m "docs(site): refresh landing + quickstart; add cloud-mode page"
```

---

## Task 14: Final acceptance + changeset

**Goal:** Verify everything works end-to-end, write a changeset for the docs touch, run the full repo's lint/types/test gates, do the manual smoke test the design doc calls for.

**Files:**

- Create: `.changeset/phase-15-docs-site.md`

**Step 1: Full repo acceptance**

```bash
cd /Users/jonasbroms/.config/superpowers/worktrees/bro/feat/phase-15-docs-site
bun run lint
bun run types
bun run test
```

All 18+ packages must pass. The docs touch should not affect any other package; if it does, debug.

**Step 2: Static-export build**

```bash
GITHUB_PAGES=true bun run --filter @repo/docs build
```

Verify `apps/docs/out/` exists and contains pages for every section. Spot-check:

```bash
ls apps/docs/out/bro/docs/
ls apps/docs/out/bro/docs/tools/
ls apps/docs/out/bro/docs/tools-reference/
ls apps/docs/out/bro/docs/recipes/
```

**Step 3: Manual smoke test**

```bash
bunx serve apps/docs/out
```

In a browser, navigate to `http://localhost:3000/bro/`. Expected:

- Root URL shows the meta-refresh "loading docs…" page and redirects to `/bro/docs/` within ~1 second.
- `/bro/docs/` lands on the figma-mcp landing page with the new prose.
- The sidebar shows: Get Started → Clients → Tools → Tool reference → Recipes → Reference.
- Clicking into "Tools → extract" shows the pack page with the tool table.
- Clicking a tool name (e.g., `extract_styles`) lands on the auto-generated reference page with input/output tables.
- Search (Cmd-K or whatever Fumadocs binds) finds tool names — search "create_slide" should hit the slides pack page + the auto-generated tool page.

If anything is broken, fix and re-verify.

**Step 4: Write the changeset**

```markdown
<!-- .changeset/phase-15-docs-site.md -->
---
"@repo/docs": patch
---

Phase 15: docs site redesign.

`apps/docs` (the Fumadocs site at <https://bromso.github.io/bro/>) is rewritten to reflect v1.4 — 8 tool packs, ~85 tools, cloud-mode-without-plugin, the editor-type discriminator, the figma-api-key doctor check.

Render fix: 9 source files hardcoded `figma-plugin-template` (the original template name) for the basePath / repo URL — the deployed site at `bromso.github.io/bro/` rendered blank because every asset 404'd. Renamed everywhere; the root `/` now meta-refreshes to `/bro/docs/` (works under Next's `output: "export"`, where server-side `redirect()` doesn't).

New IA: five top-level sections (Get Started / Clients / Tools / Recipes / Reference) plus an auto-generated `tools-reference` tree. Generator at `apps/docs/scripts/generate-tool-reference.mjs` imports every pack's `defineTool` exports, walks the Zod schemas via `zod-to-json-schema`, and emits one MDX per tool. Output is committed to git so preview-builds work without re-running.

Hand-written content:

- 8 pack overview pages (`tools/{extract,variables,console,design,figjam,slides,a11y,rest}.mdx`).
- 7 recipe pages (`recipes/*.mdx`) — extract design tokens, audit a11y, slides from outline, UI from description, audit via cloud, debug plugin console, document components.
- 3 reference pages (`reference/architecture.mdx` refresh, `reference/troubleshooting.mdx` refresh with 6 doctor checks, new `reference/error-codes.mdx`).
- Refreshed landing (`index.mdx`), refreshed quickstart (renamed `getting-started/` → `get-started/`), new cloud-mode page (`get-started/cloud.mdx`).
- Refreshed 5 client install pages with cloud-mode hint and reference-path fix.

Out of scope: PR preview workflow, auto-PR for generator drift, multi-version docs trees, custom logo / Figma palette, real-Figma golden tests for docs links.
```

**Step 5: Commit the changeset**

```bash
git add .changeset/phase-15-docs-site.md
git commit -m "chore(changeset): record Phase 15 docs site redesign"
```

**Step 6: Final summary**

```bash
git log master..HEAD --oneline
```

Expected: 14 commits.

**Phase 15 done.** When this PR merges, `.github/workflows/docs.yml` triggers, builds with `GITHUB_PAGES=true`, regenerates the tool reference, deploys to GitHub Pages. The first deploy fixes the blank page.

---

## Notes on Execution

**Worktree:** all work happens in `/Users/jonasbroms/.config/superpowers/worktrees/bro/feat/phase-15-docs-site`. Branch: `feat/phase-15-docs-site`. Created from master at `1745c30`.

**No new dependencies on the runtime path.** `zod-to-json-schema` is dev-time only (the docs site is build-only; not shipped to npm). The generator script is plain ESM JS that runs under `node` or `bun`.

**Generator idempotence.** Running the generator twice produces identical output. Task 5 commits the generated MDX so preview builds work without re-running. CI re-runs the generator before `next build` (Task 6 wires this); the diff at that point is informative — if the committed MDX is stale, CI's `git status` would show drift. For v1 we accept that drift is caught manually; an auto-PR for drift is a follow-up.

**Test-driven where it matters.** Tasks 3 and 4 follow TDD strictly (component tests for `<ToolReference>`, generator helper tests). Tasks 1, 2, 7-13 are content-shaped — there's no meaningful unit test for "did you write the right prose"; the test is "the build succeeds" + manual smoke.

**No Storybook coupling.** The docs deploy workflow also builds Storybook into `out/storybook/`. We don't touch that; if it's broken before this PR, it's still broken after.

**Search.** Fumadocs's built-in `apps/docs/src/app/api/search/route.ts` walks `content/docs/**` automatically. New pages get indexed for free. Verified manually in Task 14 step 3.

**OG image deferred.** Task 1 step 5 drops the broken `figma-plugi-template.webp` reference. A proper OG image is a Phase 16+ concern.

**Path note (basePath under Next 15 + static export).** Next emits assets prefixed with `basePath`. In dev (`bun run dev`), `basePath` is empty (the env var is only set in CI), so links work at `http://localhost:3000/docs/` without the `/bro` prefix. In static export, `basePath` is `/bro`, so links work at `https://bromso.github.io/bro/docs/`. The root `page.tsx`'s meta-refresh URL respects this via the same `BASE` constant.

**Phase plan history is immutable.** When future phases write content, they reference this Phase 15 plan by its date-stamped filename. Don't rewrite phase docs after the fact.

---

## Out of Scope

- **PR preview workflow** — separate Pages or Cloudflare deployment per PR.
- **Auto-PR for generator drift** — CI step that opens a PR when the regenerated MDX differs from the committed version.
- **Multi-version docs** — separate v1.4 / v1.5 trees.
- **Search analytics, page-view tracking, telemetry.**
- **Custom logo or Figma palette.**
- **Real-Figma golden tests for docs links** — broken external links are caught manually.
- **Recipe walkthroughs with screenshots** — adds visual polish but ~10x the maintenance cost.
- **Per-tool examples beyond the reference table.**

---

## References

- Design doc: `docs/plans/2026-05-08-docs-site-redesign-design.md`
- Phase 9 plan (original docs scaffold): `docs/plans/2026-05-06-figma-mcp-phase-9.md`
- Existing docs deploy workflow: `.github/workflows/docs.yml`
- Fumadocs docs: <https://fumadocs.dev>
- `defineTool` schema source: `packages/protocol/src/tools.ts`
- All 8 pack sources: `packages/tools-{extract,variables,console,design,figjam,slides,a11y,rest}/src/`
- `zod-to-json-schema` docs: <https://github.com/StefanTerdell/zod-to-json-schema>
- Next.js static export: <https://nextjs.org/docs/app/building-your-application/deploying/static-exports>
