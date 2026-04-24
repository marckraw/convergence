# convergence

## 0.22.2

### Patch Changes

- a0fbf98: Fix MCP server discovery for Claude Code when built-in `claude.ai ...` servers
  appear in `claude mcp list` but fail individual `claude mcp get` lookups.
  Convergence now falls back to list-based parsing instead of dropping the whole
  provider section, and the MCP dialog also shows Pi with a note explaining that
  its CLI does not expose inspectable MCP server discovery yet.

## 0.22.1

### Patch Changes

- 8fd0be3: Rename the sidebar project action from "Create Project" / "New Project" to
  "Open a project" for consistency. The button has always opened an existing
  directory via the native picker, so the wording now matches the behavior.

## 0.22.0

### Minor Changes

- 3cf3415: feat(terminal): promote terminal to a first-class session surface. Sessions now carry a `primarySurface` field that chooses between the conversation transcript and the terminal pane tree in the main pane, with the opposite surface as an opt-in bottom dock. A new synthetic `shell` provider lets users create terminal-only sessions (no agent attached) via an intent dialog (Conversation / Terminal) on `+ New session` and a new `new-terminal-session` command in Cmd+K. Pane layout (tree shape, split sizes, tab CWDs and titles) is persisted per session and replayed as fresh PTYs in the saved working directories on app restart — scrollback and live processes are not preserved (future tmux work). Shell-provider sessions skip auto-naming, hide the fork action, and display "Terminal" in the provider chip. `Cmd+J` toggles the conversation dock when terminal is the primary surface. Existing conversation sessions behave identically; the layout change is gated on the new primary surface field so no migration is required for current users.

## 0.21.1

### Patch Changes

- 6b1d745: Fix structured-summary session forks so additional instructions stay visible in the preview and are applied to the final seed when the fork is created.

## 0.21.0

### Minor Changes

- 78ff1a3: feat(activity): surface native provider auto-compaction as a `compacting` activity state in the session header and status bar. Pi maps `compaction_start`/`compaction_end`, Codex maps `contextCompaction` item lifecycle events, and Claude Code maps best-effort stream-json hook/compaction shapes, so users can see when the underlying CLI is auto-compacting instead of guessing during slower turns.

### Patch Changes

- 446254c: chore(markdown): add runtime canary that warns in the console when a rendered assistant message appears to be missing its tail versus the source string. Catches silent truncation bugs from the markdown parser, the conversation-item persistence pipeline, or streaming flush edge cases without needing DevTools inspection.

## 0.20.0

### Minor Changes

- da183b7: Pick the base branch when creating a workspace. The new workspace dialog now shows a searchable "Create from" list of local and origin branches, so a new worktree can branch off any ref on demand instead of always using the project-wide setting. Leaving the selection on "Project default" preserves existing behavior.

## 0.19.0

### Minor Changes

- 673bb96: Group the extended Changed Files panel by agent turn. Each round-trip
  from user message to agent-idle is now recorded as a turn with its own
  per-turn diffs, so reviewers can see what the agent did in each step
  rather than a single cumulative working-tree diff. The compact view is
  unchanged and continues to show the live git-status list. Existing
  sessions show an empty turn list in the extended view — only sessions
  started after this release accumulate turn records.

## 0.18.5

### Patch Changes

- 59af8da: Add a bottom-right feedback button with a dialog for collecting Convergence app feedback. Submissions currently go through a mocked Electron API boundary so the real destination can be wired later.

  Keep the release history pagination visible in the What's New dialog footer so users can move between release pages without scrolling to the bottom of the notes.

## 0.18.4

### Patch Changes

- 44a7f24: Fix Pi provider label in composer dropdown: show "Pi" as the primary label instead of the creator name.

## 0.18.3

### Patch Changes

- a7e5abd: Paginate the Release History list in the About Convergence dialog (5 per page) so the modal stays compact as the changelog grows.

## 0.18.2

### Patch Changes

- 58c9092: Fix agent completion notifications so real session finish and attention
  transitions trigger the same toast, sound, and system notification flow as
  the manual notification test action.

## 0.18.1

### Patch Changes

- 307cd8e: Prevent packaged macOS builds from crashing on launch when the
  `electron-updater` module loads with an unexpected export shape.
  Convergence now disables auto-updates for that build instead of aborting
  startup, so affected users can still open the app and install a follow-up
  release.

## 0.18.0

### Minor Changes

- 6ad9c88: Ship automatic updates for packaged macOS builds. Convergence now checks
  GitHub Releases for new versions on startup (after a 10s delay) and
  every four hours thereafter, then surfaces any available update through
  an actionable toast, a new section in Settings, and a `Check for
updates…` entry in the Command Center.

  The flow never installs silently: users are asked before downloading
  and again before installing. Background checking is opt-out via
  Settings → Updates → "Check for updates automatically".

  Release artifacts now ship both Intel (`x64`) and Apple Silicon
  (`arm64`) variants; electron-updater picks the matching arch at
  runtime from the published `latest-mac.yml`.

  Dev mode (`npm run dev`) disables every update code path — the Settings
  section and the Command Center item stay visible but are clearly marked
  as disabled.

  **One-time note:** users on v0.16.0 or earlier need to download and
  install this release manually (via the DMG on GitHub). Every release
  from this version onward will be picked up by the auto-updater.

## 0.17.1

### Patch Changes

- 9d17975: Fix the app settings dialog so long settings lists scroll correctly, use the
  shared dark scrollbar styling, and present settings in clearer grouped sections
  with better control alignment.

## 0.17.0

### Minor Changes

- b7fc109: Add a hover-to-copy button on every conversation item in the session view.
  Each message, agent response, thinking block, tool call, tool result,
  approval request, input request, and system note now reveals a small copy
  button in its top-right corner on hover or keyboard focus. Clicking copies
  the raw underlying text — original markdown for messages, the raw
  stringified input or output for tool calls — so you can grab a specific
  portion of the conversation without hand-selecting.

## 0.16.0

### Minor Changes

- 07df4e9: Add a full notifications system: toasts, sounds, inline pulses, dock badge
  and bounce, system-level macOS notifications, and a settings panel with a
  test-fire button. Notifications fire on agent attention transitions
  (`finished` / `needs input` / `needs approval` / `errored`), respect a
  suppression matrix tied to window focus and the active session, and
  collapse bursts via a 5-second per-severity coalescer with a 3-per-minute
  rate limit on system-level fires. A first-run onboarding card surfaces the
  new settings; everything is opt-out per channel and per event.

## 0.15.0

### Minor Changes

- 9997130: Normalize sessions around lightweight summaries and first-class conversation
  items instead of embedded transcript blobs. Providers now emit a canonical
  delta stream that the backend persists into `session_conversation_items`, and
  the renderer consumes split summary/detail session data rather than hydrating
  full conversations everywhere.

  This release also updates forking and session surfaces to work from normalized
  conversation items, migrates existing local transcript-backed sessions to the
  new model on startup, and rebuilds legacy databases to drop the old
  `sessions.transcript` storage once the normalized conversation rows are in
  place.

## 0.14.4

### Patch Changes

- 29c09a1: Fix long provider, model, and project pickers by replacing unbounded dropdowns
  with searchable popovers and aligning their scrollbars with the shared app
  scrollbar styling.

## 0.14.3

### Patch Changes

- 5db7ba0: Add agent task progress primitive and wire fork-preview + auto-naming
  to it. Long-running one-shot provider calls now stream `started`,
  `stdout-chunk`, `stderr-chunk`, and `settled` events over a dedicated
  IPC channel. The fork dialog's summary extraction shows a live elapsed
  counter, a "still working" hint past 45s, and a stale warning when the
  provider has produced no output for 30s beyond the extended threshold.
  Session auto-naming uses the same primitive, surfacing its progress
  to the dev-mode console subscriber without any visible UI yet.

## 0.14.2

### Patch Changes

- 02f5791: Fix structured-summary preview in the fork dialog. The session-fork
  service was detaching `provider.oneShot` into a local variable before
  invoking it, which lost the method's `this` binding and caused the
  Claude Code adapter to read `binaryPath` off `undefined`. The preview
  call now invokes `oneShot` directly on the provider, matching the
  pattern used by session auto-naming.

## 0.14.1

### Patch Changes

- 7a4f3e8: fixing threads

## 0.14.0

### Minor Changes

- 3d4df55: Add session fork with full-transcript and structured-summary strategies.
  - A new **Fork session…** action is available from a session's header kebab
    menu and from the Command Center (Cmd+K) when a session is focused. Each
    entry opens a fork dialog pre-populated from the parent session's name,
    provider, model, and effort.
  - **Full transcript** strategy seeds the child session by pasting the
    parent's conversation verbatim. **Structured summary** asks the parent's
    provider to extract decisions, key facts (with verbatim evidence),
    artifacts, open questions, and suggested next steps into a typed artifact
    rendered as an editable markdown seed. The summary strategy is disabled
    for parent sessions with very short transcripts.
  - The dialog also lets you pick a different provider/model/effort for the
    child and choose whether to reuse the parent's workspace or create a new
    worktree on its own branch.
  - Forked sessions display a **Forked from: &lt;parent&gt;** chip in their
    header that navigates back to the parent with a click. Session fork
    tracking is persisted in the sessions store alongside existing session
    metadata.

## 0.13.0

### Minor Changes

- ba57c96: Add a global Cmd+K command palette for cross-project navigation.
  - `Cmd+K` (macOS) / `Ctrl+K` (other platforms) opens a global palette from
    anywhere in the app. An empty query shows curated sections — **Waiting on
    You**, **Needs Review**, **Recent Sessions**, **Projects**, **Workspaces**,
    **Dialogs** — in that order. Typing ranks projects, workspaces, sessions,
    dialogs, and "New session in <branch>" / "New workspace in <project>"
    affordances via Fuse.js weighted over session name, project name, branch
    name, provider, and dialog title.
  - Selecting a session in another project performs a single cross-project hop
    (`switchToSession`) that preserves the existing sidebar **Waiting on You**
    click behaviour. Selecting a workspace activates its owning project;
    selecting a dialog routes through the shared `useDialogStore`.
  - **Behaviour change:** the terminal `Cmd+K` (clear) shortcut is now scoped
    to terminal-dock focus. When your focus is outside the dock, `Cmd+K` opens
    the palette; click into a terminal pane first to clear it. All other
    terminal shortcuts (`Cmd+T`, splits, focus-adjacent, toggle-dock) are
    unchanged and still fire from anywhere.

## 0.12.1

### Patch Changes

- 3f26025: Fix the composer scrollbar so it uses the shared themed scrollbar styling in
  both dark and light modes. The composer input now goes through a shared
  textarea primitive, which keeps future multiline inputs aligned with the app's
  common scrollbar treatment.

## 0.12.0

### Minor Changes

- fe4daa2: `Cmd-T` (Ctrl-T on other platforms) now doubles as an "open terminal" shortcut: when the dock is hidden it becomes visible, and when the active session has no pane tree yet it opens the first pane in the session's working directory. When the dock is already visible with an existing tree, the shortcut keeps its original `new-tab` behavior.

## 0.11.1

### Patch Changes

- d070e33: Fix terminal dock single-leaf width collapse: when the dock held a single pane, the leaf took intrinsic width inside the dock's flex-row container instead of filling it. Split layouts were unaffected because `Group` already stretched. Leaf root now carries `w-full min-w-0`, matching the `Group` path.

## 0.11.0

### Minor Changes

- 6c5ba58: Embedded terminal surface: PTY-backed dock with recursive splits, tabs, keyboard shortcuts (Cmd-T/D/W/K/`/arrows), close-confirm on running foreground process, and user-resizable dock height. Panes open in the active session's working directory; PTYs clean up on window/app close.

## 0.10.2

### Patch Changes

- c6fceae: Fix intermittent attachment failures caused by legacy attachment foreign keys.

  Draft attachments created before a session exists now recover from stale
  `attachments.session_id -> sessions.id` schemas by repairing the table and
  retrying the insert. The database migration also detects that legacy foreign
  key using SQLite metadata instead of brittle SQL text matching.

## 0.10.1

### Patch Changes

- 807b6f7: Fix two composer/sidebar defects.
  - Attachments: fix `FOREIGN KEY constraint failed` when attaching to a session that hasn't been created yet. Drafts ingest under the sentinel `__new__` session id, and the real session id is rebound (files moved + row updated) on the first `session.start`/`sendMessage`. The `attachments` table no longer FK-references `sessions(id)`; cleanup stays correct via the existing explicit `deleteForSession` path and a broader orphan sweep that also prunes DB rows whose session is gone. Existing databases are migrated in place.
  - Sidebar: the "Regenerate name" action now shows a spinner on the session row (and in the dropdown item) while the naming agent runs, so users can see that regeneration is in flight. The menu item is disabled while regenerating to prevent double-invocation.

## 0.10.0

### Minor Changes

- 2369f9a: Add session attachments support for images, PDFs, and UTF-8 text files. Users can attach files via a `+` button, clipboard paste, or drag-and-drop onto the composer; each provider receives attachments in its native format (Claude Code: base64 content blocks + PDFs; Codex: `localImage` entries; Pi: base64 `images[]`). Capability is surfaced per provider — PDFs are Claude-Code-only, and incompatible attachments render a red-outlined chip with a blocked send button. Attachments persist under `{userData}/attachments/{sessionId}/`, are orphan-swept on boot, and are cascaded on session delete.

## 0.9.2

### Patch Changes

- 31608f5: New workspaces now branch from the project's configured base branch by default instead of inheriting whatever commit the source repository currently has checked out. Convergence also adds a project setting that lets you switch workspace creation back to the previous current-HEAD strategy and optionally pin the base branch name explicitly.

## 0.9.1

### Patch Changes

- 8625781: Open external app links in the system browser instead of spawning a new Convergence window.

## 0.9.0

### Minor Changes

- 8e0a1f7: Add a global status bar across the bottom of the app that surfaces agent activity across every project.
  - Aggregate counters for running sessions and sessions that need the user, with a popover grouped by project.
  - Per-project chips for projects with active or attention-needing sessions, clickable to switch project.
  - Recency badge for the most recently completed or failed session.
  - New `activity` signal on sessions (`streaming`, `thinking`, `tool:<name>`, `waiting-approval`, or `null`) derived from provider events for Claude Code, Codex, and Pi, persisted on the session row and shown per-session in the project popover.

## 0.8.0

### Minor Changes

- 6e4d7bc: Automatically name sessions after the first assistant response using each provider's fast model, with inline rename and regenerate-name actions in the sidebar and a per-provider naming model picker in app settings.

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
