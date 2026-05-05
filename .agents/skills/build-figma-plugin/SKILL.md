---
name: build-figma-plugin
description: Build a complete Figma plugin from a plain English description. Handles all code generation, message wiring, UI, and build validation. Designed for non-programmers.
---

# Build Figma Plugin

You are helping a **non-programmer** build a Figma plugin. They will describe what they want in plain English. You generate all the code, validate it builds, and guide them through installing it in Figma.

## Hard Rules

- **Never ask the user to write code.** You write everything.
- **Never show raw error output.** If something fails, explain what went wrong in plain language and fix it.
- **Always validate your work.** Run `bun run build` after generating code. If it fails, fix it before responding.
- **Always end with installation instructions** when the build succeeds.

## Workflow

### Step 1: Understand the Plugin Idea

Ask **2-3 short clarifying questions** (multiple choice when possible). Focus on:
- What Figma action should the plugin perform? (e.g., rename layers, change colors, export images)
- What should the plugin UI look like? (e.g., a single button, a form with inputs, a settings panel)
- Any edge cases? (e.g., what happens if nothing is selected?)

Do NOT ask about technology, architecture, or implementation. The user doesn't know or care about those.

### Step 2: Generate Code

You MUST modify these files (read the reference docs first):

| File | What to change |
|------|---------------|
| `packages/common/src/networkSides.ts` | Add message types for your plugin's events |
| `apps/design-plugin/src/plugin/plugin.ts` | Set window size, title, and bootstrap logic |
| `apps/design-plugin/src/plugin/plugin.network.ts` | Register Figma API handlers for each message |
| `packages/ui/src/app.tsx` | Build the React UI using `@repo/ui` components |
| `apps/design-plugin/figma.manifest.ts` | Update plugin `name` (keep existing `id` for dev) |

**Before writing code**, read these references:
- `@references/architecture.md` — How the two-process model works
- `@references/figma-api-patterns.md` — Common Figma API operations
- `@references/ui-components.md` — Available UI components from `@repo/ui`
- `@references/message-patterns.md` — How to define and handle messages

### Step 3: Build & Validate

Run these commands and verify they all pass:

```bash
bun run build      # Must succeed — produces dist/index.html + dist/plugin.js
bun run types      # Must succeed — no TypeScript errors
bun run lint       # Must succeed — no Biome errors
```

If any command fails, **fix the issue yourself** and re-run. Do not ask the user to fix anything.

### Step 4: Installation Guide

After a successful build, print this guide (customize the plugin name):

---

**Your plugin is ready!** Here's how to install it in Figma:

1. Open the **Figma desktop app** (plugins can't be loaded in the browser)
2. Open any Figma file
3. Go to **Plugins > Development > Import plugin from manifest...**
4. Navigate to this project folder: `apps/design-plugin/dist/`
5. Select **manifest.json**
6. Your plugin now appears under **Plugins > Development > [Plugin Name]**

To test changes: run `bun run build` again, then re-run the plugin in Figma (no need to re-import).

---

### Step 5: Create a Changeset

After the plugin is built and working, create a changeset to track this change:

Run `bun changeset` and when prompted:
- Select `figma-plugin-template` as the changed package
- Choose `minor` (new plugin feature)
- Write a one-line summary of the plugin (e.g., "Add layer rename plugin")

Commit the changeset file with `git add .changeset/ && git commit -m "chore: add changeset"`.

## When the User Asks to Change Something

Follow the same flow: understand what they want to change, modify the relevant files, rebuild, and confirm it works. Always run `bun run build` after changes.

## When the User Reports a Bug

1. Ask them to describe what happened vs. what they expected
2. Check the relevant code (plugin side for Figma API issues, UI side for display issues)
3. Fix it, rebuild, and confirm

## Important Architecture Constraints

- **Plugin code** (`plugin.ts`, `plugin.network.ts`) runs in Figma's sandbox. It can access `figma.*` API but has NO DOM, NO `fetch`, NO `window`.
- **UI code** (`app.tsx`) runs in an iframe. It can use React and DOM but has NO access to `figma.*`. It communicates with the plugin via messages.
- **The build output is a single HTML file** (`dist/index.html`) with all JS/CSS inlined. No external files or network requests at runtime.
- **UI components** come from `@repo/ui`. Always import from there — never install new UI libraries.
