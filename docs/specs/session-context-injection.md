# Session Context Injection

> **Implementing agent**: companion plan lives at
> `docs/specs/session-context-injection-plan.md`. Re-read both files in full
> at the start of every phase. Conversation context is compacted between
> phases; treat each phase as a cold start. The plan's "Agent process rules"
> section is non-negotiable.

## Objective

Today, when a user wants the agent to be aware of context outside the active
project — a sibling repo path, a "always run lint before committing" reminder,
a shared API contract location — they paste it into the first message every
time. There is no place in the model to declare "this snippet of context
belongs to this project; let me decide per session whether to give it to the
agent."

This spec adds **project-level context items** that can be:

- defined and edited per project, independent of any one session,
- attached to a session at create time (multi-select), and
- injected into the conversation at three explicit moments:
  1. **Boot** — concatenated into the first message that starts the provider
     handle.
  2. **Every-turn** — re-injected on every user turn (per-item opt-in flag,
     defaults off, with a UI warning about token cost and provider-memory
     conflict).
  3. **Mention** — composer-side `::name` autocomplete that expands the item
     body inline into the user message, one shot only.

All three injection paths produce **plain text on the wire**. Expansion
happens renderer-side before the IPC call to `sessionApi.start` /
`sessionApi.sendMessage`. Backend / provider adapters stay neutral; no
provider sees a Convergence-specific marker.

The feature is **provider-neutral by construction**. Claude Code, Codex, PI,
and any future conversation provider receive the same plain-text input.
Shell provider continues to reject conversation messages.

## Product behavior

### Scope (v1)

Project context items have a single shape:

```ts
interface ProjectContextItem {
  id: string
  projectId: string
  label: string | null // optional short name shown in pickers, e.g. "monorepo-api"
  body: string // the actual text injected
  reinjectMode: 'boot' | 'every-turn'
  createdAt: string
  updatedAt: string
}
```

No typed kinds (no `repo` / `file` / `url`). v1 is free-text only. Typed
variants can be introduced later if patterns emerge.

`reinjectMode` is per item:

- `boot` — included only in the first message that starts the session.
- `every-turn` — included in **every** user message sent to the provider.

### Project settings UI

Add a `Context` section to project settings
(`src/features/project-settings/`). Contains:

- list of project context items (label, body preview, reinject badge)
- create / edit / delete actions
- create / edit form: label (optional), body (textarea, multi-line),
  `reinjectMode` toggle with explicit warning text when `every-turn` is
  selected: _"Every-turn items are re-sent on every message. They cost tokens
  and can conflict with the provider's own session memory. Use sparingly."_

No drag-reordering, no folders, no rich text. Plain.

### Session create — context attachment

Extend session create surfaces (`src/features/session-start/`,
`src/features/session-create-inline/`) with a multi-select picker showing the
project's context items. Selection state:

- empty (no items attached) is valid and is the default
- per-item checkbox picks which items boot-inject for this session
- `every-turn` items selected here will also be re-injected each turn

The set of attached context items is persisted with the session and is fixed
at session create time for v1. (Mutating attached items mid-session is out of
scope; see Future work.)

### Composer mention picker (`::name`)

Reuse the existing skill-picker pattern:

- detect the trigger `::` followed by zero or more word chars in the textarea
- open a shadcn `Popover` anchored to the textarea, listing project context
  items filtered by the trailing query
- arrow keys + Enter to accept; Escape to dismiss
- on accept: replace the `::query` substring with the item `body` inline at
  the cursor; close the popover
- the user sees the expanded body immediately in the textarea and can edit
  before sending

`::` mention is **one-shot**. It does not modify the session's attached
context items. It does not persist a mention token in the conversation; what
goes to the provider is the expanded body verbatim.

Open detection edge cases — handle in v1:

- `::` inside an existing word (e.g. `foo::bar`) does **not** trigger the
  picker. Trigger requires `::` at start of input or after whitespace.
- `:::` triple-colon does not trigger.
- Closing the popover via Escape leaves typed text intact.

### Boot injection contract

When a session starts with one or more attached context items
(`reinjectMode === 'boot'`), prepend a single normalized block to the user's
initial message text **before** calling `sessionApi.start`:

```
<convergence:context>
[label or untitled]
<body>

[label or untitled]
<body>
</convergence:context>

<original user initial message>
```

The block is rendered in the transcript as a separate `note`
ConversationItem (`level: 'info'`) at sequence 0, **before** the user's
first message. This satisfies the transcript-stability rule: every byte the
provider received is visible in the transcript.

`every-turn` items also boot-inject in the same block on first send. Their
re-injection on subsequent turns happens via the every-turn path below.

### Every-turn injection contract

For each subsequent user message in a session that has attached context items
with `reinjectMode === 'every-turn'`:

- read the **current** body of each every-turn item (latest from disk; not
  the value at session create time)
- prepend the same `<convergence:context>` block to the user's message text
- send the resulting text via `handle.sendMessage`
- the prepended block is rendered as part of the user's `message`
  ConversationItem in the transcript — visible, stable, replayable

If no every-turn items exist on the session, behaviour is unchanged from
today.

### Mention injection contract

Mention expansion is purely a composer-side text manipulation. By the time
the renderer calls `sessionApi.sendMessage`, the textarea value is already
plain text with bodies inlined. No backend or provider awareness needed.

### Mutability rules

- Editing a project context item changes future injections only. Past sends
  in transcripts are never rewritten.
- Editing an item with `reinjectMode === 'every-turn'` while a session is
  running: the **next** user message will see the new body. Already-sent
  turns are unchanged.
- Deleting an item: detach from any sessions that referenced it; future sends
  in those sessions stop including the item. Past transcript entries that
  expanded it stay intact.

### Provider neutrality

All four conversation providers (Claude Code, Codex, PI, future) receive
identical text. No provider adapter is modified. The Shell provider is
explicitly out of scope (it already rejects conversation messages).

### Out of scope (v1)

- Typed context kinds (`repo`, `file`, `url`).
- Auto-fetching content from a referenced repo (e.g. running `git log` on a
  linked path).
- Mutating the set of attached items mid-session (only at create time for v1).
- TipTap / rich editor in the composer. Existing plain `<Textarea>` stands.
- Per-mention persistence (no `::name` token survives in transcript; bodies
  are inlined).
- Reordering, grouping, or folder structure for context items.
- Importing context items from a file or another project.
- Initiative integration. Initiative remains a separate, independent axis.

## Tech stack and architecture

### Storage

New table `project_context_items` in the existing better-sqlite3 database:

```
id TEXT PRIMARY KEY
project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
label TEXT NULL
body TEXT NOT NULL
reinject_mode TEXT NOT NULL CHECK (reinject_mode IN ('boot', 'every-turn'))
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
```

New junction table `session_context_attachments`:

```
session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
context_item_id TEXT NOT NULL REFERENCES project_context_items(id) ON DELETE CASCADE
PRIMARY KEY (session_id, context_item_id)
```

Migration adds both tables. Existing sessions migrate trivially (no
attachments by default).

### Backend modules

- `electron/backend/project-context/`
  - `project-context.types.ts` — `ProjectContextItem`, IPC payload types
  - `project-context.service.ts` — CRUD over the table, attach / detach / list
    by project / list by session
  - `project-context.ipc.ts` — preload-exposed channels:
    - `projectContext.list(projectId)`
    - `projectContext.create(input)`
    - `projectContext.update(id, patch)`
    - `projectContext.delete(id)`
    - `projectContext.attachToSession(sessionId, itemIds)`
    - `projectContext.listForSession(sessionId)`

- `electron/backend/session/session.service.ts`
  - on `start(id, input)`: read attached context items for the session,
    serialize boot block, prepend to `input.text`. Build a sequence-0 `note`
    `ConversationItem` capturing the same block text so the transcript
    matches what the provider received.
  - on `sendMessage(id, input)`: if attached items include any
    `every-turn` items, read latest bodies, prepend the every-turn block to
    the user's outgoing message text. The user `message` ConversationItem
    persisted to the transcript carries the prepended block in its `text`.

The serialization helper is **pure** and lives at
`electron/backend/project-context/project-context-serializer.pure.ts`. It
takes the project slug as an argument so it stays IO-free; the session
service computes the slug from the project name and passes it in. The same
pure helper is used renderer-side to compute the preview that the user can
see before sending (see "UI affordances" below) — exporting via the FSD-lite
shared layer if needed. The `project-slug.pure.ts` helper sits next to it
and is also dual-consumed.

### Renderer modules

- `src/entities/project-context/`
  - `project-context.types.ts` — re-export of the IPC types
  - `project-context.api.ts` — preload-bridge calls
  - `project-context.model.ts` — Zustand store: items by projectId,
    attachments by sessionId, CRUD actions
  - `project-context-mention.pure.ts` — pure helpers:
    - `detectMentionTrigger(text, cursor)` → `{ open, query, range } | null`
    - `applyMentionExpansion(text, range, body)` → `{ text, cursor }`
    - `filterContextMentions(items, query)`

- `src/features/project-context-settings/` (new) — context CRUD UI.
  - `project-context-list.container.tsx`
  - `project-context-form.presentational.tsx`
  - `project-context-list.presentational.tsx`

- `src/features/project-settings/` — add the `Context` tab/section that
  renders the new feature. Existing project settings shell hosts it.

- `src/features/session-start/` and `src/features/session-create-inline/` —
  add a multi-select control bound to the project's context items. Pass the
  selected ids through to `createAndStartSession` / equivalent flows.

- `src/features/composer/` — extend the existing composer:
  - on textarea key/input events: run `detectMentionTrigger` on the current
    value + selection.
  - if a trigger is open, render a new `ContextMentionPicker` (shadcn Popover
    anchored to the textarea) listing filtered project context items.
  - on item select: replace the trigger range with the item `body`, restore
    focus and updated cursor.
  - the existing skill picker is unchanged. Both pickers can be open
    independently because their triggers (`/` for skills, `::` for context)
    are disjoint.

### IPC and preload

Extend `electron/preload/index.ts` to expose a `projectContext` namespace
mirroring the IPC channels. No security implications beyond standard
Convergence preload boundaries — context items are user-authored text on the
local DB.

### UI affordances

- Boot preview: when one or more items are attached at session create, the
  session-start form shows a small "Context will be injected" hint with a
  collapsible preview of the serialized block.
- Every-turn pill in composer: if the active session has every-turn items,
  show a small badge in the composer ("Every-turn context active · 2 items")
  that links to the project context settings.

### Token cost guardrails (v1)

- Every-turn warning copy in the form is the only guardrail in v1.
- A per-item character count is shown next to the body field for awareness.
- No automatic truncation.

## Commands

No new top-level npm scripts. All verification runs through existing gates.

```bash
npm install
npm run typecheck
npm run test:pure
npm run test:unit
chaperone check --fix
```

## Project structure

New / modified paths:

```
electron/
  backend/
    project-context/                            (new)
      project-context.types.ts
      project-context.service.ts
      project-context.service.test.ts
      project-context.ipc.ts
      project-context-serializer.pure.ts
      project-context-serializer.pure.test.ts
    session/
      session.service.ts                        (modified — boot/every-turn injection)
      session.service.test.ts                   (extended)
    database/
      migrations/                               (new migration adds tables)
  preload/
    index.ts                                    (modified — expose projectContext namespace)

src/
  entities/
    project-context/                            (new)
      index.ts
      project-context.types.ts
      project-context.api.ts
      project-context.model.ts
      project-context.model.test.ts
      project-context-mention.pure.ts
      project-context-mention.pure.test.ts
  features/
    project-context-settings/                   (new)
      index.ts
      project-context-list.container.tsx
      project-context-list.container.test.tsx
      project-context-list.presentational.tsx
      project-context-form.presentational.tsx
    project-settings/                           (modified — host new tab)
    session-start/                              (modified — context picker)
    session-create-inline/                      (modified — context picker)
    composer/                                   (modified — ::mention)
      composer.container.tsx                    (modified)
      composer-context-mention.presentational.tsx  (new)
```

No changes to widgets, electron/main, or the provider adapters.

## Code style

Follow existing conventions per CLAUDE.md and `docs/architecture/quick-reference.md`:

- Named exports only.
- File suffixes: `.types.ts`, `.service.ts`, `.pure.ts`, `.api.ts`, `.model.ts`,
  `.container.tsx`, `.presentational.tsx`.
- Renderer imports from Electron only via `*.api.ts` over the preload bridge.
- All cross-slice imports go through slice `index.ts`.
- Mention detection, filtering, expansion, and the boot/every-turn
  serializer are **pure** functions — no IO, no React, no Electron — and are
  the primary unit-test surface.
- No new runtime dependencies.

## Testing strategy

### Pure tests (`*.pure.test.ts`)

- `project-context-serializer.pure.test.ts`:
  - empty attachments → no block, original message unchanged
  - one boot item → single labelled section
  - multiple items (mixed boot + every-turn) → block contains both at boot
  - every-turn-only block (used per turn) excludes boot-only items
  - missing label falls back to "untitled"
  - body trimming rules
  - wrapper uses the slug passed in (`<my-repo:context>` etc.)

- `project-slug.pure.test.ts`:
  - `Convergence` → `convergence`
  - `My Awesome Repo` → `my-awesome-repo`
  - `123-numbers` → `p-123-numbers`
  - empty / whitespace → `convergence`
  - non-ASCII / emoji → stripped, no transliteration
  - length cap at 64 chars
  - leading / trailing punctuation trimmed

- `project-context-mention.pure.test.ts`:
  - `detectMentionTrigger`:
    - `::` at start opens with empty query
    - `::foo` opens with query `foo`
    - `foo::bar` does NOT open (mid-word)
    - `:::` does not open
    - cursor after `::foo bar` is no longer in the trigger range
  - `applyMentionExpansion`:
    - replaces `::query` range with body, returns updated cursor
    - preserves text before / after the range
  - `filterContextMentions` orders enabled-first, then alphabetical by label.

### Unit tests (`*.test.ts(x)`)

- `project-context.service.test.ts`:
  - CRUD round-trips
  - attaching to a non-existent session throws
  - cascading delete: deleting a project removes items and attachments
  - `listForSession` returns only attached items in stable order

- `session.service.test.ts` (extensions):
  - `start` with attached boot items: outgoing initial message contains the
    block; transcript has a `note` at sequence 0 with the same text
  - `sendMessage` with `every-turn` items: outgoing user text contains the
    block; transcript user message persists the prepended text
  - editing an item between turns: next turn sees new body, prior turn
    unchanged
  - deleting an item between turns: next turn excludes it

- `project-context.model.test.ts`:
  - store update flows for create / update / delete / attach
  - selectors return items by project / by session

- `composer.container.test.tsx`:
  - typing `::` opens the picker; arrow + Enter inserts body; Escape closes
  - the existing `/` skill picker still works independently
  - mention insertion advances the textarea cursor correctly

### E2E

Out of scope for v1. Full mention + injection round-trip is covered by the
unit + service tests above.

## Boundaries

### Always do

- Run all four post-task gates after every task: `npm install`,
  `npm run typecheck`, `npm run test:pure`, `npm run test:unit`,
  `chaperone check --fix`.
- Keep the boot and every-turn block serializer **pure** so it can be tested
  without IO and reused renderer-side for previews.
- Treat every byte the provider sees as transcript-visible. Both injection
  paths produce a `note` ConversationItem (boot) or live inside the user
  `message` ConversationItem (every-turn).
- Read context item bodies at the moment of send for `every-turn`. Do not
  cache the value at session create time.

### Ask first

- Adding new npm dependencies (we should not need any).
- Changing the provider adapter interfaces (we explicitly should not for
  this feature).
- Persisting per-mention tokens (we explicitly should not in v1).
- Touching the existing skill-picker behaviour beyond what's needed to
  coexist with the new mention picker.

### Never do

- Modify a past `ConversationItem` to retroactively rewrite an expanded
  context. Past sends are immutable.
- Send injected context to the provider without also persisting it to the
  transcript. Transcript-stability is non-negotiable.
- Couple the session model to a specific provider. The injection contract is
  plain text concatenation, period.
- Add typed context kinds (`repo`, `file`, `url`) under the v1 banner.
- Use a Convergence-specific marker that providers might interpret. The
  `<convergence:context>...</convergence:context>` wrapper is plain text;
  providers see it as user-authored prose.

## Locked decisions

1. **Wrapper format**: `<{project-slug}:context>...</{project-slug}:context>`,
   where `{project-slug}` is derived from the user project's name. The slug
   is computed fresh at injection time (boot and every-turn). It is not
   persisted on the context items themselves; it travels with the project.

   **Slugify rules** (pure function, deterministic):
   1. lowercase the project name
   2. replace any run of non-`[a-z0-9]` characters with a single `-`
   3. trim leading and trailing `-`
   4. truncate to 64 characters max (XML-tag sanity)
   5. if the result is empty, use the fallback `convergence`
   6. if the first character is a digit, prepend `p-` (XML tag names cannot
      start with a digit)

   Examples:
   - `Convergence` → `convergence`
   - `My Awesome Repo` → `my-awesome-repo`
   - `123-numbers` → `p-123-numbers`
   - `   ` → `convergence`
   - `Über-Project ✨` → `ber-project` (non-ASCII stripped, no
     transliteration in v1)
   - `repo.name_v2` → `repo-name-v2`

   Lives at
   `electron/backend/project-context/project-slug.pure.ts` and is the only
   producer of the slug. Test the table of cases above plus boundary lengths.

2. **Every-turn trigger scope**: re-injection happens **only on user-initiated
   `sendMessage` calls** (the user types and submits in the composer). It
   does **not** fire on:
   - assistant turn boundaries
   - tool result returns
   - approval responses (`approve` / `deny`)
   - input-request answers (these are user-initiated but follow a separate
     code path; treat as user `sendMessage` for v1 — re-inject)
   - automatic continuations / queued-input dispatch (these go through
     `handle.sendMessage` already; re-inject)
     In short: any code path that ultimately sends user-authored text to the
     provider gets the every-turn block prepended. Anything driven by the
     provider's own progression does not.
3. **Empty state in session-create**: hide the context picker entirely when
   the project has zero items. Surface a "Manage context" link from project
   settings only. Reduces noise on first-time projects.
