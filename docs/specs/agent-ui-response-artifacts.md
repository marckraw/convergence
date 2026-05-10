# Agent UI Response Artifacts

## Goal

Add an experimental response mode where an assistant turn can include a
standalone HTML UI artifact alongside its normal Markdown answer.

Markdown remains the canonical transcript representation. The UI artifact is a
companion rendering surface that gives agents a richer way to explain,
summarize, inspect, or demonstrate something when text is not enough.

The first implementation is deliberately renderer-only and memory-only. It
must not introduce a database migration or change the persisted conversation
schema.

## Product Intent

Agents are good at writing code. Sometimes a final answer would be clearer as
an interface: a small inspector, chart, decision matrix, review dashboard,
architecture map, form, simulator, or custom visual explanation.

The app should support that without making the transcript less useful.

The target user experience:

- the left sidebar stays unchanged
- the main session area normally behaves exactly as it does today
- when the selected or latest assistant turn has a UI response artifact, the
  main session area splits into two columns
- the left column shows the normal Markdown transcript
- the right column renders the generated UI artifact in a sandboxed iframe
- Markdown remains visible, copyable, searchable, and sufficient without the
  artifact

## Current Architecture Summary

This spec builds on the current normalized conversation surface:

- Provider adapters emit `SessionDelta` values.
- Assistant text streams into a single `ConversationItem` through add/patch
  events.
- The renderer stores active conversation items in `useSessionStore`.
- `SessionConversationSurface` is the shared transcript/composer surface used
  by both project sessions and global chat.
- `SessionTranscript` virtualizes transcript rows with `@tanstack/react-virtual`.
- Markdown rendering is centralized in `src/shared/ui/markdown.*` and uses
  Streamdown with code and Mermaid plugins.

Important implication: UI artifacts should not be rendered inside every
virtualized transcript row. A single companion panel is the correct V1 shape.

## Locked V1 Decisions

- Markdown is required for every assistant response.
- HTML UI artifacts are optional.
- No database schema changes.
- No persisted artifact table.
- No backend artifact service.
- No direct DOM injection into Convergence.
- No Electron, Node, filesystem, preload, or app API access from artifacts.
- No React/TSX compilation in V1.
- V1 artifact kind is standalone HTML only.
- The experiment is allowed to lose artifact runtime state on app reload.

## Non-Goals

- Replacing Markdown responses.
- Persisting artifacts durably.
- Building a general app/plugin runtime.
- Letting artifacts call Convergence APIs.
- Letting artifacts inspect local files directly.
- Supporting external network access by default.
- Supporting arbitrary multi-file Vite/React projects in V1.
- Adding provider-specific conversation schema fields in V1.

## Artifact Authoring Contract

The first parser should detect an explicit fenced block in assistant Markdown:

````md
Normal Markdown answer here.

```convergence-ui-html
---
title: Dependency graph
---
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        font-family: system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <main>...</main>
    <script>
      // artifact-local JavaScript
    </script>
  </body>
</html>
```
````

Rules:

- everything outside the fenced artifact block is normal Markdown
- the Markdown answer must stand on its own
- the artifact block is removed from transcript Markdown rendering
- the artifact block is extracted into renderer memory
- malformed artifact blocks should not break transcript rendering
- if metadata parsing fails, use a default title such as `UI response`

The exact metadata syntax can change before implementation if a pure parser
test shows a simpler format is safer. The important contract is a fenced block
with a unique language tag and standalone HTML content.

## Renderer Model

Introduce a renderer-only entity slice:

```ts
export interface UiResponseArtifact {
  id: string
  sessionId: string
  conversationItemId: string
  title: string
  kind: 'html'
  html: string
  createdAt: string
}
```

Suggested ownership:

```text
src/entities/ui-response-artifact/
  index.ts
  ui-response-artifact.types.ts
  ui-response-artifact.pure.ts
  ui-response-artifact.pure.test.ts
  ui-response-artifact.model.ts
```

The pure layer should expose:

```ts
export interface ParsedUiResponseArtifact {
  title: string
  html: string
}

export interface ParsedAssistantResponse {
  markdown: string
  artifact: ParsedUiResponseArtifact | null
}

export function parseAssistantUiResponse(text: string): ParsedAssistantResponse
```

The store can keep a map keyed by `conversationItemId`:

```ts
Record<string, UiResponseArtifact>
```

V1 can either:

- derive artifacts from `ConversationItem.text` every render, or
- ingest conversation patches into an in-memory store

Prefer the simpler implementation first. If the derived parser is fast and
stable, it avoids synchronizing another store. If parsing every render is noisy,
the store can ingest assistant items when conversation patches arrive.

## Transcript Rendering

Assistant message rendering should use the cleaned Markdown when an artifact is
present:

- user messages: unchanged
- assistant messages without artifact: unchanged
- assistant messages with artifact:
  - left transcript renders `parsed.markdown`
  - copy text should use the Markdown answer, not the raw artifact HTML
  - row header may show a small `UI response` affordance
  - selecting or focusing that turn may update the right panel

The parser must not affect thinking blocks, notes, approval requests, input
requests, tool calls, or tool results in V1.

## Split Layout

`SessionConversationSurface` is the natural integration point because it is
shared by project sessions and global chat.

Default layout:

```text
Session header
┌──────────────────────────────────────┐
│ transcript                            │
│ composer                              │
└──────────────────────────────────────┘
```

Artifact layout:

```text
Session header
┌──────────────────────┬──────────────────────┐
│ Markdown transcript  │ sandboxed UI response │
│ composer             │                      │
└──────────────────────┴──────────────────────┘
```

Rules:

- use the split only when a UI artifact is available
- keep transcript and composer together in the left pane
- right pane owns its own scroll/iframe area
- left and right panes start at roughly 50/50 width
- do not use nested card-in-card styling
- if the viewport is too narrow, collapse the right pane into a drawer or tab
  in a later phase; V1 can hide the panel below a conservative breakpoint

Project-session side panels already exist outside `SessionConversationSurface`
in `SessionView`:

- changed files
- pull request panel
- Initiative context panel
- terminal dock through `WorkspaceLayout`

V1 should avoid complex panel negotiation. If changed files or PR panels are
open, the artifact split can still occupy the remaining main session area.

## Artifact Selection

V1 should use a predictable selection rule:

1. If the user selects an assistant turn with an artifact, render that artifact.
2. Otherwise, render the latest assistant artifact in the active conversation.
3. If no artifact exists, render the normal single-column session surface.

If explicit row selection is too much for the first slice, start with rule 2
only and add row selection in a later phase.

## Sandbox Contract

Render artifacts using an iframe:

```tsx
<iframe sandbox="allow-scripts" srcDoc={htmlDocument} />
```

The app must not inject the artifact into the Convergence DOM.

The generated iframe document should include a restrictive CSP meta tag. V1
target:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'"
/>
```

Security expectations:

- no same-origin access
- no top navigation
- no popups
- no forms
- no network fetches
- no Electron or preload access
- no filesystem access

This is still generated code. Treat the runtime as untrusted UI.

## Skill Contract

A dedicated skill can come after the renderer MVP.

Purpose:

- tell the agent when and how to produce a UI response
- require complete Markdown fallback
- require standalone HTML
- discourage external dependencies
- keep the UI focused on the answer, not on decorative output

Example instruction:

```text
When asked to respond with UI, provide a normal Markdown answer and append one
`convergence-ui-html` fenced block containing a complete standalone HTML
document. The Markdown answer must remain understandable without the artifact.
```

The skill is an authoring aid only. Convergence owns parsing, validation,
storage policy, and sandboxing.

V1 skill identity:

- skill name: `convergence-ui-response-artifact`
- Codex global root:
  `~/.codex/skills/convergence-ui-response-artifact/SKILL.md`
- Claude Code global root:
  `~/.claude/skills/convergence-ui-response-artifact/SKILL.md`
- Pi global root:
  `~/.pi/agent/skills/convergence-ui-response-artifact/SKILL.md`
- generic agents global root:
  `~/.agents/skills/convergence-ui-response-artifact/SKILL.md`

The `convergence-` prefix is intentional because Claude Code and Pi invoke
skills by name. A product-scoped name avoids collisions with generic
third-party skills such as `ui-response` or `artifact`.

The skill is global, not project-local. It is an app/provider capability that
should be available across Convergence sessions without requiring every
repository to carry `.codex`, `.claude`, `.pi`, or `.agents` skill files.

## Implementation Plan

### Phase A0 - Spec and Parser

Goal: define the response contract and prove extraction is deterministic.

- [ ] Add this spec.
- [ ] Add `src/entities/ui-response-artifact/ui-response-artifact.types.ts`.
- [ ] Add `src/entities/ui-response-artifact/ui-response-artifact.pure.ts`.
- [ ] Parse one artifact block from assistant Markdown.
- [ ] Return cleaned Markdown plus parsed artifact.
- [ ] Ignore malformed blocks safely.
- [ ] Add pure tests for:
  - no artifact
  - one valid artifact
  - metadata title
  - artifact block removed from Markdown
  - malformed artifact fallback

### Phase A1 - Clean Transcript Markdown

Goal: artifact source does not clutter the transcript.

- [ ] Extend assistant message view-model building to expose cleaned Markdown.
- [ ] Keep user messages and non-message items unchanged.
- [ ] Keep copy behavior Markdown-first.
- [ ] Add tests around assistant transcript rendering.

### Phase A2 - Sandboxed Artifact Panel

Goal: render a standalone artifact beside the transcript.

- [ ] Add `ui-response-panel.presentational.tsx`.
- [ ] Wrap artifact HTML with the CSP document helper.
- [ ] Render iframe with `sandbox="allow-scripts"`.
- [ ] Add empty/error states.
- [ ] Add tests for iframe sandbox attributes and `srcDoc`.

### Phase A3 - Split Session Surface

Goal: make the product behavior visible.

- [ ] Update `SessionConversationSurface` to detect the latest assistant
      artifact.
- [ ] Switch from single-column to split layout when an artifact exists.
- [ ] Keep composer in the Markdown/left pane.
- [ ] Keep no-artifact sessions visually unchanged.
- [ ] Add tests for single-column and split-column behavior.

### Phase A4 - Turn Affordance and Selection

Goal: make artifact ownership obvious.

- [ ] Add a small `UI response` indicator on assistant turns with artifacts.
- [ ] Allow selecting an artifact-bearing turn.
- [ ] Render selected artifact in the right pane.
- [ ] Fallback to latest artifact when no selection exists.

### Phase A5 - Skill Authoring

Goal: make agents able to reliably produce this format on request.

- [ ] Create a skill that describes the response contract.
- [ ] Use the product-scoped skill name `convergence-ui-response-artifact`.
- [ ] Install the same skill contract globally for Codex, Claude Code, Pi, and
      generic agents.
- [ ] Do not add project-local skill files for this feature.
- [ ] Include examples of good and bad artifacts.
- [ ] Prefer small standalone HTML.
- [ ] Require Markdown fallback.
- [ ] Prohibit external network dependencies by default.

## Testing Strategy

Pure tests:

- parser behavior
- CSP wrapper behavior
- latest-artifact selection helper

Unit tests:

- assistant transcript renders cleaned Markdown
- no-artifact sessions retain current layout
- artifact sessions render split layout
- iframe has strict sandbox attributes
- malformed artifact does not crash rendering

Manual UI verification:

- paste or generate a response with Markdown plus artifact block
- confirm transcript remains readable
- confirm UI renders in right pane
- confirm Mermaid and code Markdown still render in left pane
- confirm app reload loses any memory-only artifact state if the
  implementation chooses strict in-memory ingestion

## Future Durable Version

If the experiment proves useful, the durable version should add:

- database persistence for artifact metadata
- artifact source/file storage
- multiple artifacts per assistant turn
- source viewer
- rebuild/retry controls
- React/TSX compilation into standalone HTML
- capability declarations for sanitized session data
- export/copy behavior for Markdown plus artifacts

Do not add these until V1 proves the split response experience is worth
keeping.
