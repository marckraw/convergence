# convergence

## 0.7.0

### Minor Changes

- a89a84f: Add archive and unarchive session lifecycle support, split the attention surface into waiting-on-you and needs-review sections, and surface archived sessions separately from the active working set.

## 0.6.0

### Minor Changes

- fad2f4d: Add Pi Agent (by Mario Zechner) as a third first-class provider alongside Claude Code and Codex. Convergence detects the `pi` binary on PATH, registers a `PiProvider` that drives `pi --mode rpc` via its custom JSONL protocol, and maps pi's streaming events (message_update text/tool-call deltas, tool_execution_end, turn_end stats, agent_end stop reasons, compaction/auto-retry) onto the existing transcript model. Auth is delegated to the CLI — when `pi` is installed but `~/.pi/agent/auth.json` is empty or missing, the provider status dialog shows "Needs login" with guidance to run `pi /login` in a terminal. Effort levels map to pi's thinking ladder (off/minimal/low/medium/high/xhigh). The default model descriptor is a single "Pi default" entry; dynamic model enumeration is deferred to a follow-up.
- 42f8a87: Enumerate Pi Agent models dynamically from the installed `pi` binary. When the provider descriptor is requested, Convergence now spawns a short-lived `pi --mode rpc --no-session` subprocess, sends `get_available_models`, and maps every returned Model to a `ProviderModelOption` with id `"provider/modelId"` and label `"Vendor · Name"`. Models flagged `reasoning: true` receive the full effort ladder (`none → high`), plus `xhigh` for OpenAI-provider models; non-reasoning models receive no effort options. If the probe times out, the binary fails to spawn, or pi returns an empty list (no credentials configured), Convergence falls back to the static `Pi default` descriptor so the picker stays usable. Session spawn now passes `--model <provider/id>` and `--thinking <level>` when the user picks something other than the fallback.

## 0.5.0

### Minor Changes

- f7b1a46: Add global app settings for default provider, model, and reasoning effort. Opens from a cog icon in the sidebar topbar, persists through the backend `app_settings` key, broadcasts updates across renderer surfaces, and seeds session-start and composer with the stored defaults when starting new sessions.

## 0.4.1

### Patch Changes

- 646589e: Surface Codex turn-start failures and main-process startup failures to the user. Previously a rejected `turn/start` JSON-RPC call in the Codex provider was silently swallowed, leaving the session stuck in `running` with no feedback; it now emits a system transcript entry and transitions the session to `failed`. Unhandled rejections during Electron main-process init (database open, provider detection, IPC registration) would leave the app running with no window; they now show a native error dialog and quit cleanly.

## 0.4.0

### Minor Changes

- 5dc70cb: Show CLI version in the provider status dialog. Convergence now runs `--version` on detected provider binaries (Claude Code, Codex) and displays the result alongside the binary path.

## 0.3.1

### Patch Changes

- 6039e51: Add Claude Opus 4.7 to the hardcoded Claude Code provider model list, matching the latest model released by Anthropic (API ID: claude-opus-4-7).

## 0.3.0

### Minor Changes

- 1cfc295: Add proper macOS app icon assets generated from the Convergence logo and show Claude Code/Codex runtime availability in a new provider status dialog inside the app.

## 0.2.3

### Patch Changes

- ed9efd4: Fix packaged macOS app startup so provider detection and MCP discovery can find installed `claude` and `codex` binaries outside of `npm run dev`.

## 0.2.2

### Patch Changes

- 8b63b41: Fix macOS notarization workflow credentials by using the app-specific password secret explicitly during release publishing.

## 0.2.1

### Patch Changes

- edf6ae3: Enable signed and notarized macOS release builds in GitHub Actions while keeping separate unsigned local packaging commands for owner-only development builds.

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
