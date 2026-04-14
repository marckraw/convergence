# MCP Server Visibility

## Objective

Convergence should expose the MCP servers that are currently available to the
selected project without becoming the source of truth for MCP configuration.

This is a read-only feature for now. Convergence should:

- show which MCP servers are available through Claude Code and Codex
- distinguish project-level servers from global servers
- show enough health/auth/transport detail that the user can trust what is
  available before starting or continuing agent work

Convergence should not yet:

- own MCP server configuration
- add, edit, or remove servers
- proxy or wrap MCP traffic itself
- invent a provider-independent MCP registry

## Product behavior

### Scope model

The feature is project-scoped in the UI, but includes both:

- `Project` servers: available specifically because of the selected project's
  config or local scope
- `Global` servers: available in all projects for that provider

The data should always be shown per provider. Do not merge or deduplicate
servers across Claude Code and Codex.

### Initial UI

Add a project-scoped `MCP Servers` dialog from the sidebar footer near
`What's New`.

The dialog should show:

- title and selected project name
- manual refresh action
- provider sections (`Claude Code`, `Codex`)
- within each provider:
  - `Project` group
  - `Global` group
  - per-server rows with:
    - server name
    - status
    - transport type
    - scope/source label
    - URL or command summary

### Status semantics

Convergence should normalize provider-specific output into these coarse states:

- `ready`
- `needs-auth`
- `failed`
- `disabled`
- `unknown`

Claude Code provides richer health/auth output than Codex. Codex entries should
still be shown even when health is only known as "configured".

## Provider strategy

### Claude Code

Use Claude's own MCP CLI commands as the source of truth.

Commands:

- `claude mcp list`
- `claude mcp get <name>`

Important behavior:

- Claude supports `user`, `project`, and `local` scopes
- `claude mcp get` reports scope, status, type, URL/command, and args
- `claude mcp list` may perform health checks and may spawn project stdio
  servers; do not call it aggressively in the background

Mapping for v1:

- `User config` -> `Global`
- `Project config` -> `Project`
- `Local config` -> `Project`

### Codex

Use Codex's own MCP CLI commands as the source of truth for effective server
listing.

Commands:

- `codex mcp list --json`
- `codex -C <projectRoot> mcp list --json`
- optional detail fetch: `codex mcp get <name> --json`

Important behavior:

- Codex exposes structured MCP JSON
- global config lives in `~/.codex/config.toml`
- project-local config can affect the effective list when run with `-C`

V1 scope classification for Codex:

- `Global` = servers from `codex mcp list --json`
- `Project` = effective project servers from
  `codex -C <projectRoot> mcp list --json` that are not identical to the global
  entry with the same name

This is intentionally a read-only effective-view strategy. It avoids
reimplementing Codex's full config precedence rules in Convergence.

## Architecture

### Backend

Add a new backend feature under:

- `electron/backend/mcp`

Suggested files:

- `mcp.types.ts`
- `command-runner.ts`
- `claude-mcp.service.ts`
- `codex-mcp.service.ts`
- `mcp.service.ts`

`McpService` should:

- resolve the selected project repository path
- inspect only installed providers
- return a provider-grouped visibility snapshot for the renderer

### IPC

Expose a thin IPC boundary:

- `mcp:listByProjectId(projectId)`

### Renderer

Use a feature dialog plus a renderer API wrapper.

Suggested slices:

- `src/entities/mcp-server`
- `src/features/mcp-servers`

The renderer should not call provider CLIs directly.

## Non-goals for v1

- configuration editing
- auth/login flows
- automatic refresh/polling
- inline session transcript MCP configuration state
- MCP server lifecycle management

## Future follow-up

Once visibility is solid, Convergence can add:

- provider-aware add/remove flows
- project-local MCP onboarding
- auth/status actions
- "used by this session" runtime linking between MCP activity and configured
  servers
