# real-figma fixtures

This directory holds golden fixtures for the `real-figma.golden` Vitest suite
(`apps/mcp-server/src/__tests__/real-figma.golden.test.ts`). The suite is
**skipped by default**; it only runs when `FIGMA_API_KEY` is set.

`file-structure.json` is a placeholder until someone with a Figma API key
records a real fixture. The placeholder lets the path exist in the repo so
the suite can read it without `ENOENT` once a real `TEST_FILE_KEY` is wired
in.

## Recording a fixture

1. Open `apps/mcp-server/src/__tests__/real-figma.golden.test.ts` and replace
   `TEST_FILE_KEY = "REPLACE_ME_WITH_PUBLIC_TEST_FILE_KEY"` with the fileKey
   of a public, stable Figma file you own.
2. Run, with a Figma personal-access token:

   ```bash
   FIGMA_API_KEY=fpat_... RECORD=1 \
     bun run --filter @bromso/figma-mcp test real-figma.golden
   ```

3. Inspect `file-structure.json`. Redact any sensitive node names if the test
   file is not fully public-friendly.
4. Commit the updated `file-structure.json` plus the `TEST_FILE_KEY` change.

## Replaying

Without `RECORD`, with the key set:

```bash
FIGMA_API_KEY=fpat_... \
  bun run --filter @bromso/figma-mcp test real-figma.golden
```

Expected: 1 passed.

## CI

`.github/workflows/real-figma.yml` runs this suite on `workflow_dispatch`
only. The repo secret `FIGMA_API_KEY` must be configured under
Settings -> Secrets and variables -> Actions before the workflow can
succeed.
