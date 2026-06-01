# HTML Mode for Conversation Sessions

Status: Draft

## Summary

HTML mode adds an optional, session-level companion output for normal
conversation sessions. The main session remains a clean Markdown transcript.
When HTML mode is enabled, Convergence runs a separate post-response generation
step after each completed assistant response. That step uses the same provider
and model family as the session to create or update HTML files in
Convergence-owned per-session storage, then exposes those files through a
preview affordance in the conversation.

The important product boundary is that HTML generation must not be implemented
as repeated instructions inside the primary conversation. The Markdown response
is canonical. HTML is a derived artifact.

## Goals

- Allow HTML mode to be enabled when a session starts or toggled later from the
  composer/session UI.
- Keep the primary provider conversation focused on normal Markdown responses.
- Generate HTML with a secondary same-provider agent after each completed
  assistant response when HTML mode is enabled.
- Store generated HTML under an app-owned, per-session output directory instead
  of writing into the project repository by default.
- Show assistant responses that have HTML output with a preview action similar
  in spirit to attachment previews.
- Support an in-app iframe preview first, with an "open in browser" escape hatch.
- Preserve a path toward a living conversation webpage that accumulates and
  improves across turns.

## Non-Goals

- Do not replace the Markdown transcript with HTML.
- Do not inject "also produce HTML" instructions into every primary agent turn.
- Do not reuse the `convergence-ui-html` fenced-block skill as the core storage
  and generation mechanism. That skill is an inline visual response artifact;
  HTML mode is a durable session output pipeline.
- Do not write generated HTML into the user's repository unless a future export
  or promote action explicitly asks for it.

## Existing Related Systems

`convergence-ui-response-artifact` currently works by parsing a special
`convergence-ui-html` fenced block out of assistant Markdown, stripping that
block from the transcript display, and rendering the HTML in an iframe panel.
That is useful precedent for preview isolation and iframe rendering, but it is
not the right history model for HTML mode because it intentionally places the
artifact inside the primary assistant response.

Attachments already provide precedent for durable app-owned files, transcript
preview affordances, and read-through IPC. HTML mode should follow that shape:
metadata in SQLite, bytes on disk, and renderer previews loaded through explicit
Electron APIs.

Provider `oneShot` already exists for same-provider background work such as
session naming and synthesis. HTML mode should use this path instead of
starting or mutating the main session handle.

## Proposed Architecture

### Session Setting

Add a persisted `htmlModeEnabled` flag to session summaries. This flag controls
whether the secondary HTML generation pipeline runs after future assistant
responses. The flag can be changed at any time and should broadcast the updated
session summary so open UI surfaces stay in sync.

### Output Storage

Add an app-owned output root alongside existing app data roots:

`{userData}/session-outputs/{sessionId}/html/`

Store generated files there, initially:

- `index.html` for the living page.
- `snapshots/turn-{sequence}.html` for optional per-turn snapshots.

Store metadata in SQLite in a future `session_html_outputs` table. Metadata
should include the session id, source assistant conversation item id, output
kind, relative path, status, error, created timestamp, and updated timestamp.

### Generation Pipeline

When a primary assistant response reaches a terminal complete state and the
session has HTML mode enabled:

1. Resolve the session provider, model, effort, and permission settings.
2. Collect bounded context from the completed assistant item and recent
   transcript.
3. Run provider `oneShot` with an HTML-mode system prompt.
4. Write or update HTML in the per-session output directory.
5. Validate that output is HTML and can be previewed safely.
6. Persist output metadata and emit a renderer event.

The HTML generation prompt should ask the secondary agent to create a complete
HTML document that represents the latest answer and, later, to maintain a
coherent living page for the session. The primary session should not see this
prompt or its output.

### Preview UI

Assistant transcript entries with HTML output should show an `HTML preview`
action. Activating it should open an in-app preview first. The preview can reuse
the same iframe safety posture as UI response artifacts: sandboxed iframe,
explicit CSP, no Node/Electron access, and constrained navigation. A secondary
action can open the generated file in the system browser.

### Failure Model

HTML generation is background work. It must not fail or block the primary
assistant response. Failures should be recorded on the HTML output metadata and
shown as retryable, low-noise UI state.

## Phased Plan

### Phase 1: Persist the HTML Mode Setting

Add the session-level `htmlModeEnabled` field to the database, backend session
model, IPC/preload API, renderer API, and session store. Add a mutation API to
toggle the setting and broadcast summary updates.

Acceptance:

- Existing sessions default to `htmlModeEnabled: false`.
- New sessions can be created with the flag set.
- The flag can be toggled after creation.
- Session summary broadcasts include the updated flag.
- Backend unit tests cover defaulting and toggling.

### Phase 2: Add HTML Output Storage

Create the app-owned session output root and a `session_html_outputs` metadata
table. Add a backend service and IPC/read API for listing outputs, reading HTML,
and opening files externally.

Acceptance:

- HTML outputs are stored under `{userData}/session-outputs/{sessionId}/html/`.
- Renderer code can list outputs for a session and read a selected output.
- Paths are stored relative to the session output root and cannot escape it.
- Deleting a session removes or tombstones its HTML output metadata.

### Phase 3: Run the Secondary HTML Agent

Trigger background HTML generation after completed assistant responses when
`htmlModeEnabled` is true. Use provider `oneShot` with the same provider/model
settings as the session. Persist success or failure metadata without changing
the primary conversation.

Acceptance:

- Primary Markdown conversation history is unchanged by HTML mode.
- A completed assistant message in HTML mode creates or updates HTML output.
- Generation failures are captured without failing the primary response.
- The pipeline is skipped when the provider lacks `oneShot`.

### Phase 4: Show HTML Preview in Conversation

Add transcript affordances for assistant items with HTML output and an in-app
iframe preview panel or modal. Add an "open in browser" action for the stored
file.

Acceptance:

- Assistant messages with HTML output show an `HTML preview` action.
- Clicking preview renders the generated HTML in a sandboxed iframe.
- The user can open the HTML file externally.
- Empty, pending, and failed states are visible and not noisy.

### Phase 5: Living Page and Snapshots

Refine generation so the session has a living `index.html` that can evolve over
turns, with optional per-turn snapshots for audit/history.

Acceptance:

- `index.html` updates coherently across multiple turns.
- Per-turn snapshots can be linked back to source assistant items.
- Retry/regenerate actions can target one response or the living page.

### Phase 6: Product Polish and Export

Decide final composer placement, startup defaults, settings, export/promote
flows, and any richer editing workflow for the generated page.

Acceptance:

- HTML mode can be enabled before the first prompt and toggled during a session.
- The UI copy and placement make the mode understandable without polluting the
  transcript.
- Users can export or promote generated HTML intentionally.

## Open Questions

- Should HTML mode start as a per-session setting only, or also have a project
  default?
- Should the living page include only assistant answers, or user prompts and
  intermediate artifacts as well?
- Should failed HTML generations retry automatically, or only on explicit user
  action?
- Should the secondary agent have read access to the project working directory
  by default, or only the transcript context?
