# Session Fork

## Goal

Let users create a new session from the current state of an existing session,
optionally with a different provider, model, or effort. The new child session
is seeded with context derived from the parent using one of two strategies:

- **`full`** — the parent transcript is pasted verbatim as the child's first
  user message.
- **`summary`** — the parent transcript is distilled into a structured summary
  (decisions, key facts, open questions, load-bearing artifacts, suggested
  next steps) and that summary is pasted as the child's first user message.

This is the core primitive for "diverge and explore" workflows across
providers and models, and the foundation that Phase 7 multi-agent
orchestration will build on.

## Product intent

- Users can fork any session at its current state.
- A fork is always a new, independent session. It is never a "continuation"
  of the parent — provider sessions are not shared across providers, and even
  same-provider forks start fresh so the user can freely change model/effort.
- The user chooses the fork strategy per fork: `full` or `summary`.
- The child session defaults to the parent's provider/model/effort but the
  user can override any of them (including picking a different provider).
- The child session defaults to the parent's workspace/worktree, so files the
  parent modified are visible to the child. An opt-in toggle lets the user
  fork a fresh workspace/worktree too, when they want true isolation
  (e.g. two agents exploring in parallel without stepping on each other).
- Same project only in V1. Cross-project fork is out of scope.
- The parent session is untouched. Fork is one-way; there is no merge-back.
- Entry points: session header kebab menu and Command Center.

## Non-goals

- No branch-point selection. Fork always takes the parent's full current
  state; there is no "fork from message N" in V1.
- No merge-back, rebase, or sync between parent and child.
- No cross-project fork.
- No sidebar tree visualization of the parent-child graph in V1. `sessions`
  will carry a `parent_session_id` column so Phase 7 can layer tree UI on
  top later without a schema change.
- No reliance on provider-native `/compact`. Providers do not expose
  compaction output in a way we can capture and re-inject. We own
  summarization.
- No transcript-message "Fork from here" action. Only whole-session fork.
- No queueing or batching of forks. One fork at a time per parent session.

## V1 behavior

### Strategy selection

The fork dialog presents two radio options:

- **Full transcript** — no extraction call. Seed is the raw parent
  transcript, serialized to plain text with role prefixes and tool-use
  entries collapsed to short labels.
- **Summarized context** (default for non-trivial sessions) — runs a
  one-shot extraction against the parent's provider using the configured
  extraction model, produces a typed-artifact JSON, renders it as markdown,
  and shows the user a preview before the child session is created.

If the parent transcript has fewer than three turns (first user +
first assistant + nothing else), `summary` adds no value; the dialog
pre-selects `full` and disables `summary` with a tooltip.

### Entry points

- **Session header kebab → "Fork session…"** — opens the fork dialog
  scoped to the current session.
- **Command Center** — new intent `fork-current-session` listed when a
  session is focused. Executes the same dialog.

Deferred: transcript message kebab, sidebar row context menu, cross-project
fork. These can be added later without spec changes since the dialog accepts
`parentSessionId` as its sole required input.

### Fork dialog

Fields (all with sensible defaults from the parent):

| Field                  | Default                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| Strategy               | `summary` (or `full` if parent too short)                           |
| Name                   | `"{parent name} (fork)"` — user-editable                            |
| Provider               | parent's provider                                                   |
| Model                  | parent's model                                                      |
| Effort                 | parent's effort                                                     |
| Workspace behavior     | `"Reuse parent workspace"` (default) or `"Fork workspace/worktree"` |
| Additional instruction | optional free-text appended to seed                                 |

Flow:

1. **`full` strategy** — user clicks **Fork**. Child session is created
   immediately with the serialized transcript as its first user message.
   Preview is inline in the dialog (collapsible) so the user can see what
   will be sent.

2. **`summary` strategy** — user clicks **Fork**. Dialog enters a loading
   state while the extraction one-shot runs (typically 2–8s). On success,
   the extracted JSON is rendered as markdown in the dialog as a preview.
   The user can edit the markdown directly before confirming. On confirm,
   the edited markdown plus any additional instruction becomes the child
   session's first user message.

3. On failure of the `summary` extraction (timeout, invalid JSON after one
   retry, provider error), the dialog surfaces the error and offers two
   buttons: **Retry** and **Fork as full transcript**. No silent fallback.

### Workspace handling

- **Reuse parent workspace (default)** — child session's `workspaceId` and
  `workingDirectory` are copied from the parent verbatim. Changes made by
  either session are visible to the other immediately (same filesystem).
  This is the common case: a user wants to explore an alternative approach
  in the same files.
- **Fork workspace/worktree** — delegates to the existing workspace-create
  flow to produce a fresh worktree of the parent's project root. The child
  session binds to the new workspace. This is the multi-agent parallel
  exploration case.

Workspace forking uses the same `workspace:create` IPC as project-create;
no new workspace primitive is introduced.

### Full strategy serialization

The parent transcript is serialized to plain text by walking
`TranscriptEntry[]` and emitting:

- `user:` followed by `entry.text` for `type: 'user'`
- `assistant:` followed by `entry.text` for `type: 'assistant'`
- `system:` followed by `entry.text` for `type: 'system'`
- `[tool {tool}]` one-liner for `type: 'tool-use'` (input omitted — too noisy)
- `[tool result]` one-liner for `type: 'tool-result'` (result omitted)
- `[approval requested: {description}]` for `type: 'approval-request'`
- `[input requested: {prompt}]` for `type: 'input-request'`

Tool noise is intentionally stripped. The goal is "what the human and
assistant actually said" in a form the child provider can read as
conversational context. If we learn that tool output matters, we can
expose a "include tool output" toggle in a later iteration.

Size cap: the serialized output is measured against the child provider's
advertised context window (via `ProviderDescriptor`). If the serialized
seed exceeds 80% of the target window, the dialog shows a warning with
the exact percentage and a **Switch to summary strategy** shortcut.
The user may still proceed with full strategy; we do not hard-block.

### Summary strategy extraction

The extraction call uses `provider.oneShot({ prompt, modelId, workingDirectory })`
against the parent session's provider. The `modelId` comes from the new
extraction-model app setting (see "Extraction model config" below).

#### Extraction prompt

The prompt sends the serialized transcript (same serialization as `full`
strategy) and asks for strict JSON matching the schema. A single system
instruction and a single user message. The model is asked to:

- Extract only what is actually in the transcript. Do not invent.
- For every decision and key-fact, include a short verbatim `evidence`
  quote from the transcript.
- For artifacts (URLs, file paths, repos, commands, identifiers), copy
  the strings verbatim. No paraphrasing.
- Return ONLY valid JSON. No markdown code fences, no commentary.

#### Output schema

```ts
interface ForkSummary {
  topic: string // one-sentence framing
  decisions: Array<{
    text: string // the decision
    evidence: string // verbatim quote supporting it
  }>
  open_questions: string[] // unresolved threads
  key_facts: Array<{
    text: string // load-bearing fact
    evidence: string // verbatim quote supporting it
  }>
  artifacts: {
    urls: string[] // http(s) URLs mentioned
    file_paths: string[] // paths, including line refs
    repos: string[] // repo slugs / remote URLs
    commands: string[] // shell commands run or discussed
    identifiers: string[] // PR #s, ticket IDs, issue refs
  }
  next_steps: string[] // suggested or stated next actions
}
```

All fields are required. Empty arrays are allowed. Empty strings are not.

#### Output validation

- Parse as JSON. On parse failure, retry once with the same prompt plus a
  short "your previous output was not valid JSON, return JSON only" suffix.
- Validate the parsed value against the schema. On validation failure,
  retry once the same way. On second failure, surface error to UI.
- Belt-and-suspenders: after the LLM extracts `artifacts.urls`, run a regex
  pass over the raw transcript and merge any URLs the LLM missed. Same
  for obvious file paths. This guards against the single biggest
  failure mode — hallucinated or dropped load-bearing references.

#### Seed rendering

The validated JSON is rendered to markdown:

```markdown
This session is a fork of "{parent name}". Prior context:

**Topic:** {topic}

**Decisions made so far:**

- {decision.text} — "{decision.evidence}"

**Key facts established:**

- {fact.text} — "{fact.evidence}"

**Open questions:**

- {question}

**Relevant artifacts:**

- URLs: {urls joined}
- Files: {file_paths joined}
- Repos: {repos joined}
- Commands run: {commands joined}
- Identifiers: {identifiers joined}

**Suggested next steps:**

- {step}

---

{user's additional instruction if any, otherwise "Continue from here."}
```

Empty sections are omitted. The user can edit this markdown directly in
the dialog before confirming.

### Post-fork behavior

- The child session starts normally via `provider.start(config)` with the
  seed markdown as `initialMessage`.
- The child session carries `parent_session_id` referencing the parent
  and `fork_strategy` recording which strategy was used.
- The child session appears in the sidebar under its project, same as any
  other session. No special visual treatment in V1 beyond a subtle
  "forked from: {parent name}" chip in the session header (linkable so
  the user can navigate back to the parent).
- The parent session is unchanged.

## Extraction model config

Extraction is a harder task than auto-naming: it requires JSON-mode
compliance, entity extraction, and grounding. The fast model used by
auto-name is often too weak. Introduce a new per-provider app setting:

- `extractionModelByProvider: Record<string, string>`

This mirrors the existing `namingModelByProvider` field in `AppSettings`
(see `electron/backend/app-settings/app-settings.types.ts`). The app
settings dialog gains a new section, **Summary extraction model**, with a
model selector per provider that lists all models advertised by that
provider's `ProviderDescriptor`.

Default: if unset, extraction uses the provider's full-strength
`defaultModelId`, not its `fastModelId`. The user can switch to the fast
model or any other model via settings.

A new service method `appSettings.resolveExtractionModel(providerId)`
mirrors `resolveNamingModel(providerId)` and returns the configured model
or the provider's default.

## Data model

### Schema migration

Add two nullable columns to the `sessions` table:

```sql
ALTER TABLE sessions ADD COLUMN parent_session_id TEXT NULL
  REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN fork_strategy TEXT NULL;
```

`fork_strategy` stores `'full'` or `'summary'`. No CHECK constraint; the
renderer and IPC layer enforce the enum. `parent_session_id` uses
`ON DELETE SET NULL` so deleting a parent doesn't cascade-delete forks —
they become orphans with history intact.

### Session shape

Extend `Session` in `electron/backend/session/session.types.ts` and its
renderer-entity equivalent in `src/entities/session/session.types.ts`:

```ts
interface Session {
  // existing fields...
  parentSessionId: string | null
  forkStrategy: 'full' | 'summary' | null
}
```

## Backend architecture

Follow the pattern established by `session-naming` (see
`electron/backend/session/naming/`). New sibling folder under
`electron/backend/session/`:

```
electron/backend/session/fork/
├── session-fork.types.ts          # ForkStrategy, ForkInput, ForkSummary, WorkspaceMode
├── session-fork.pure.ts           # prompt building, transcript serialization,
│                                    JSON validation, seed markdown rendering,
│                                    regex-pass artifact extraction
├── session-fork.pure.test.ts
├── session-fork.service.ts        # orchestrates: serialize parent, run oneShot
│                                    (summary only), validate, compose seed,
│                                    create child session via SessionService
└── session-fork.service.test.ts
```

### Service responsibilities

`SessionForkService`:

- `previewSummary(parentId): Promise<ForkSummary>` — runs extraction against
  the parent's provider, validates, returns the structured summary for
  dialog preview. Does not create any session.
- `forkFull(input: ForkFullInput): Promise<Session>` — serializes the parent
  transcript, creates a child session via `SessionService`, starts it with
  the serialized seed as `initialMessage`. Handles workspace branch:
  either reuses parent's workspace or calls `WorkspaceService.create` for
  a fresh worktree.
- `forkSummary(input: ForkSummaryInput): Promise<Session>` — accepts a
  (possibly user-edited) markdown seed, creates a child session, starts
  it with the seed as `initialMessage`. Same workspace branch.

`ForkFullInput` and `ForkSummaryInput` carry: `parentSessionId`, `name`,
`providerId`, `modelId`, `effort`, `workspaceMode: 'reuse' | 'fork'`,
`additionalInstruction`. `ForkSummaryInput` additionally carries the
user-edited `seedMarkdown`.

### IPC

Three new handlers in `electron/backend/session/session.ipc.ts`:

- `session:fork:previewSummary` — `(parentId: string) => ForkSummary`
- `session:fork:full` — `(input: ForkFullInput) => Session`
- `session:fork:summary` — `(input: ForkSummaryInput) => Session`

The existing `session:created` / `session:started` events fire as usual
when the child session is created and started. No new broadcast events.

## Renderer architecture

### Entity layer

`src/entities/session/session-fork.api.ts` — preload-exposed IPC wrappers
for the three new handlers. Re-exported from `src/entities/session/index.ts`.

Extend `Session` type in `src/entities/session/session.types.ts` with the
two new fields (`parentSessionId`, `forkStrategy`).

The session store (`session.model.ts`) gains three actions:

- `previewFork(parentId): Promise<ForkSummary>`
- `forkFull(input): Promise<Session>`
- `forkSummary(input): Promise<Session>`

### Feature layer

New feature slice at `src/features/session-fork/`:

```
src/features/session-fork/
├── session-fork.container.tsx       # dialog orchestration, extraction flow
├── session-fork.presentational.tsx  # dialog UI: strategy radio, pickers,
│                                      preview textarea, confirm/cancel
├── session-fork.styles.ts
├── session-fork.container.test.tsx
└── index.ts
```

Reuses existing dialog store (`src/entities/dialog/`) to open/close.

### Entry points

- **Session header kebab** — add "Fork session…" menu item in whatever
  file currently renders the session header kebab (widget layer,
  probably `src/widgets/session-view/`). Action calls
  `dialogStore.open('session-fork', { parentSessionId })`.
- **Command Center** — new intent in `src/features/command-center/intents.ts`
  titled "Fork current session", visible when a session is focused,
  dispatches the same dialog.

### Fork chip in header

Extend the session header widget to render a small chip when
`session.parentSessionId` is non-null: `"Forked from: {parent.name}"`,
clickable to navigate to the parent session. Uses `globalSessions`
lookup to resolve the parent name.

## Testing strategy

Pure-layer tests (`.pure.test.ts`), all in `electron/backend/session/fork/`:

- Transcript serialization — varied `TranscriptEntry[]` inputs, assert
  output shape; verify tool noise collapsed, roles prefixed, attachments
  referenced by id only.
- JSON validation — valid, invalid, missing-fields, wrong-types inputs.
- Regex artifact extraction — URLs, paths, repo slugs, common ID formats
  (`#1234`, `PROJ-123`). Assert these are found even when absent from
  LLM output, and deduplicated when both present.
- Seed markdown rendering — all sections populated, empty arrays, empty
  strings in evidence. Verify empty sections are omitted.

Service-layer tests, with mocked provider:

- `forkFull` creates a child session with correct seed content and
  correct parent/strategy bookkeeping.
- `forkSummary` passes the (possibly user-edited) seed verbatim to
  `initialMessage`; does not re-extract.
- `previewSummary` returns the parsed summary on first attempt.
- `previewSummary` retries once on invalid JSON and succeeds on second
  attempt.
- `previewSummary` surfaces error after two invalid-JSON attempts.
- Workspace-fork mode creates a new workspace via `WorkspaceService.create`
  and the child session binds to it.
- Workspace-reuse mode copies parent's `workspaceId` and `workingDirectory`
  verbatim.

Renderer unit test:

- Fork dialog container: strategy switch, preview populated after
  extraction, edit buffer retained on confirm, error surfaces retry and
  full-fallback buttons.

Manual QA checklist:

- Fork Claude Code session → Codex child, summary strategy, verify
  seed markdown is readable and child assistant picks up context.
- Fork Pi session with workspace-fork enabled, verify new worktree
  created and isolated from parent.
- Fork a 30-turn transcript with `full` strategy, verify size-warning
  displays accurate percentage.
- Regenerate fork from same parent twice, verify each child is independent.

## Risks and mitigations

- **Hallucinated artifacts in summary** — mitigated by verbatim evidence
  requirement + regex backstop for URLs and paths. Flag any LLM-produced
  artifact that does not appear verbatim in the transcript; drop it on
  validation.
- **Extraction latency** — mitigated by dialog spinner and honest preview
  before commit. User can always pick `full` to skip extraction.
- **Context window overflow in `full` strategy** — mitigated by pre-flight
  size check and warning. Not hard-blocked; user may know what they're
  doing.
- **Orphan children after parent deletion** — schema uses
  `ON DELETE SET NULL`. Forks survive with `parentSessionId = null`. UI
  shows "parent deleted" in the chip.
- **User confusion about "fork" meaning continuation** — mitigated by
  dialog copy: "A fork is a new independent session seeded with context.
  It is not a continuation." Chip in header reinforces parent-child
  relationship without suggesting shared state.

## Deferred / future work

- Transcript-message "Fork from here" — branch-point selection.
- Sidebar tree visualization of parent-child graph.
- Cross-project fork (useful for Phase 8 multi-repo).
- Merge-back / sync between siblings — unclear whether this is a real
  user need or a pattern from version control that doesn't map.
- "Compare forks" UI — place two children side-by-side to see divergence.
- Include-tool-output toggle for `full` strategy.
- Extraction-model cost display in settings (tokens/fork estimate).

These are not in V1 scope. V1 ships the primitive; future work composes
on top.
