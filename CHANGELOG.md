# convergence

## 0.2.0

### Minor Changes

- 6a9e26a: Add read-only MCP server visibility for active projects and provider-aware context window telemetry in sessions.
  - show available global and project MCP servers for Claude Code and Codex
  - add Codex exact context window telemetry in the session header
  - add Claude estimated context window fallback with clearer hover details
  - improve shared dialog and tooltip polish for the new surfaces

## 0.1.1

### Patch Changes

- ffa53c7: Automate release tag creation after version bumps land on `master`, and
  slightly reduce the session header title size for a cleaner main-area header.

## 0.1.0

### Minor Changes

- 38e2cec: Add the first release foundation for Convergence with Changesets, macOS packaging,
  GitHub Actions release workflows, and a bundled in-app "What's New" surface.

  Also polish core desktop ergonomics with tooltip-driven sidebar truncation fixes,
  better resize handles, and improved session/project scanning in the sidebar.
