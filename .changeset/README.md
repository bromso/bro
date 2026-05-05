# Changesets

This project uses [changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

## For contributors

When you make a change that affects users of this template, run:

```bash
bun changeset
```

This will ask you:
1. Which packages changed (usually the root `figma-plugin-template`)
2. Whether it's a major, minor, or patch change
3. A summary of what changed (write this for humans, not machines)

Commit the generated `.changeset/*.md` file with your PR.

## What counts as a change?

- **Major**: Breaking changes to the template structure or API
- **Minor**: New features, new components, new skills
- **Patch**: Bug fixes, dependency updates, documentation
