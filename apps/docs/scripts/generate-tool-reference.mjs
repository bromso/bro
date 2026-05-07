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
