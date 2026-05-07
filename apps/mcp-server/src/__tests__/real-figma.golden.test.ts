// apps/mcp-server/src/__tests__/real-figma.golden.test.ts

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "real-figma");

const FIGMA_API_KEY = process.env.FIGMA_API_KEY;
const RECORD = process.env.RECORD === "1";

// A public, stable test file owned by the project.
// Replace with the actual fileKey on first record.
const TEST_FILE_KEY = "REPLACE_ME_WITH_PUBLIC_TEST_FILE_KEY";

describe.skipIf(!FIGMA_API_KEY)("real-figma golden", () => {
  it("file structure round-trips against the recorded fixture", async () => {
    const response = await fetch(`https://api.figma.com/v1/files/${TEST_FILE_KEY}?depth=1`, {
      headers: { "X-Figma-Token": FIGMA_API_KEY! },
    });
    expect(response.ok).toBe(true);
    const body = await response.json();

    // Reduce the response to the stable shape we care about — the document name,
    // the top-level page IDs, and their types. Drop volatile fields (lastModified,
    // thumbnailUrl, version) so the fixture is meaningful.
    const reduced = {
      name: body.name,
      pages: (body.document?.children ?? []).map((p: any) => ({
        id: p.id,
        type: p.type,
        name: p.name,
      })),
    };

    const fixturePath = join(FIXTURE_DIR, "file-structure.json");

    if (RECORD) {
      await writeFile(fixturePath, `${JSON.stringify(reduced, null, 2)}\n`);
      // Recording mode is intentionally non-asserting — the fixture is the new truth.
      return;
    }

    const fixture = JSON.parse(await readFile(fixturePath, "utf-8"));
    expect(reduced).toEqual(fixture);
  }, 15_000);
});
