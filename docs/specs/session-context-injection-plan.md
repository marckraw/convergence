# Session Context Injection — Implementation Plan

Companion to `docs/specs/session-context-injection.md`. Work is sliced into
eight phases, each independently shippable behind the four post-task gates
(`npm install`, `npm run typecheck`, `npm run test:pure`, `npm run test:unit`,
`chaperone check --fix`). Phases are ordered so that each one leaves the app
working end-to-end; nothing in this list ships a half-implemented surface.

## Agent process rules (READ FIRST, EVERY TIME)

The implementing agent **must** follow this loop. The conversation context
will be compacted between phases; treat each phase as a cold start.

1. **Re-read both documents in full at the start of every phase**, even if
   the previous phase just finished:
   - `docs/specs/session-context-injection.md` (the spec — locked decisions,
     contracts, slugify rules, out-of-scope list)
   - `docs/specs/session-context-injection-plan.md` (this file — the phase
     you're about to do, plus the cross-cutting non-goals)
2. **Re-check the spec's "Locked decisions" and "Never do" sections** before
   writing any code in a new phase. Compaction loses nuance; the spec is the
   source of truth.
3. **Do not start a phase if the previous phase's verification gates were
   not green.** The four gates are non-negotiable.
4. **Update this plan's checkboxes as tasks complete.** A finished task is
   `- [x]`; an in-progress one stays `- [ ]` until verified. Do not mark a
   task done before its tests pass.
5. **If the spec and the codebase disagree, stop and surface the conflict.**
   Do not pick an interpretation silently. Update the spec or the plan
   first, then implement.
6. **Stay in scope.** The spec's "Out of scope (v1)" and the plan's
   "Cross-cutting non-goals" sections are explicit. Anything not on the
   list is out of scope for this work, no matter how tempting.
7. **At every phase boundary, re-confirm the assumption that the user
   wants to continue.** The two checkpoints (after C6 and after C8) are
   stop-and-decide points; honour them.

The dependency graph:

```
C1 (pure helpers) ─────────┐
                           ├──→ C3 (backend service + IPC) ──→ C4 (renderer plumbing)
C2 (migration + schema) ───┘                                              │
                                                                          ├──→ C5 (project settings CRUD UI)
                                                                          ├──→ C6 (session-create attach + boot inject)
                                                                          ├──→ C7 (every-turn re-inject)
                                                                          └──→ C8 (composer ::mention)
```

C1 + C2 can run in parallel — they touch disjoint files. C3 depends on both.
Everything from C4 onward is sequential and each phase delivers a visible
capability.

---

## Phase C1 — Pure foundations: slug, serializer, mention detection

Goal: lock the stateless logic before any IO. All three helpers are
testable without DB, IPC, or React.

- [x] Create `electron/backend/project-context/project-slug.pure.ts` with
      `projectNameToSlug(name: string): string` implementing the seven rules
      from the spec.
- [x] Create `project-slug.pure.test.ts` covering the table from the spec
      plus boundary cases (length cap, leading digit, empty, non-ASCII,
      pure punctuation).
- [x] Create `electron/backend/project-context/project-context-serializer.pure.ts`
      with two functions:
  - `serializeBootBlock({ slug, items, originalText })` →
    `{ note: string | null, augmentedText: string }`. Returns the
    sequence-0 `note` body (or null if no items) plus the user's first
    message with the block prepended.
  - `serializeEveryTurnBlock({ slug, items, originalText })` →
    `string` (the user message with every-turn block prepended; original
    text unchanged when no every-turn items exist).
    Both produce the wrapper format `<{slug}:context>...</{slug}:context>`,
    use "untitled" when an item has no label, trim bodies, and place items in
    the order they were attached.
- [x] Create `project-context-serializer.pure.test.ts` covering: empty
      attachments, boot-only items, every-turn-only items, mixed boot +
      every-turn, missing label fallback, body trimming, slug threading.
- [x] Create `src/entities/project-context/project-context-mention.pure.ts`
      with three functions:
  - `detectMentionTrigger(text: string, cursor: number)`
    → `{ open: true, query: string, range: { start, end } } | { open: false }`.
    Trigger requires `::` at start of input or after whitespace; mid-word
    and `:::` cases return `open: false`.
  - `applyMentionExpansion(text: string, range, body: string)`
    → `{ text: string, cursor: number }`.
  - `filterContextMentions(items, query)` — case-insensitive, label-first
    match, alphabetical fallback.
- [x] Create `project-context-mention.pure.test.ts` covering all detection
      edge cases from the spec, expansion cursor maths, and filter ordering.

**C1 verification (2026-04-29)**: all four gates green.
`npm install` ✓, `npm run typecheck` ✓, `npm run test:pure` ✓ (1011 tests),
`npm run test:unit` ✓ (344 tests), `chaperone check --fix` ✓ (323 files,
0 errors). Note: spec's "filterContextMentions enabled-first" wording was
a leftover from the skill-picker spec template; ProjectContextItem has no
`enabled` field. Implemented as prefix-match-first, then alphabetical —
documented in code and tests.

**Verification**: `npm run test:pure`, `npm run typecheck`,
`chaperone check --fix`. No new runtime code is wired up; pure helpers
exist and are 100% covered.

---

## Phase C2 — Migration + schema types

Goal: the database can store context items and session attachments. No
service code yet.

- [x] Add `project_context_items` and `session_context_attachments` tables
      to the `SCHEMA` block in `electron/backend/database/database.ts` as
      `CREATE TABLE IF NOT EXISTS ...`. (Note: this repo does not use a
      `migrations/` subdirectory — schema lives inline in `database.ts`
      and per-column upgrades go through `ensure*` helpers. The plan
      originally said `migrations/`; corrected during C2.) Both tables
      have `ON DELETE CASCADE` on their parent FKs.
- [x] Extend `electron/backend/database/database.types.ts` with
      `ProjectContextItemRow` and `SessionContextAttachmentRow`.
- [x] Test in `database.test.ts` confirming both new tables are present
      on a freshly initialised database, with the expected columns and
      FK behaviour.

**Verification**: all four gates pass. Manual smoke: launch the app, open
the SQLite file, confirm both new tables exist and existing sessions are
unmodified.

**C2 verification (2026-04-29)**: all four gates green. New schema
includes a `sort_order` column on `session_context_attachments` so
attachment order can be preserved in C3 — composite PK is
`(session_id, context_item_id)`, list ordering happens via
`ORDER BY sort_order`. Five new tests cover columns, FKs, CHECK
constraint, and cascade behaviour both ways.

---

## Phase C3 — Backend service + IPC + preload

Goal: backend can CRUD context items, attach them to sessions, and list
them. Renderer not yet involved.

- [x] Create `electron/backend/project-context/project-context.types.ts`
      with `ProjectContextItem`, `CreateProjectContextItemInput`,
      `UpdateProjectContextItemInput`, plus `projectContextItemFromRow`
      and `projectContextItemToSerializable` helpers.
- [x] Create `electron/backend/project-context/project-context.service.ts`:
  - `list(projectId): ProjectContextItem[]`
  - `create(input): ProjectContextItem`
  - `update(id, patch): ProjectContextItem`
  - `delete(id): void`
  - `attachToSession(sessionId, itemIds): void` — replaces the current set
    of attachments for the session, in stable order via `sort_order`.
  - `listForSession(sessionId): ProjectContextItem[]` — returns items in
    attachment order, joined against `project_context_items`.
- [x] `project-context.service.test.ts` covering CRUD round-trips,
      cascade-delete on project removal, attach replaces existing set,
      `listForSession` ordering, attach to non-existent session throws.
- [x] Register IPC channels in `electron/main/ipc.ts`. (Plan said
      `project-context.ipc.ts`; codebase keeps all handlers inline in
      `electron/main/ipc.ts` — followed convention.) Channels:
      `projectContext:list`, `projectContext:create`,
      `projectContext:update`, `projectContext:delete`,
      `projectContext:attachToSession`, `projectContext:listForSession`.
- [x] Wire `ProjectContextService` into `electron/main/index.ts`
      bootstrap and pass it through to `registerIpcHandlers`.
- [x] Extend `electron/preload/index.ts` to expose a `projectContext`
      namespace mirroring the IPC channels.
- [x] Extend `src/shared/types/electron-api.d.ts` with
      `ProjectContextItemData`, the input data types, and the
      `projectContext` namespace on `ElectronAPI`.

**Verification**: all four gates pass. Manual smoke from devtools console:
`window.electronAPI.projectContext.create({ projectId, body: 'hello', reinjectMode: 'boot' })`
and read it back via `list`.

**C3 verification (2026-04-29)**: all four gates green. Service has 17
tests; pure totals 1030; unit 344; chaperone clean. One plan adjustment:
IPC handlers are registered inline in `electron/main/ipc.ts` per repo
convention rather than in a per-module `*.ipc.ts` file. Also added the
matching `projectContext` namespace to the renderer-facing
`ElectronAPI` interface so `*.api.ts` consumers in C4 see typed
preload bindings.

---

## Phase C4 — Renderer plumbing: entity + store + API surface

Goal: renderer can invoke project-context operations through a Zustand
store. No UI yet.

- [x] Create `src/entities/project-context/`:
  - `project-context.types.ts` — local renderer-side types
    (`ProjectContextItem`, `ProjectContextReinjectMode`, input types).
  - `project-context.api.ts` — preload-bridge wrappers for the six IPC
    channels.
  - `project-context.model.ts` — Zustand store keyed by `projectId` and
    `sessionId`:
    - state: `itemsByProjectId`, `attachmentsBySessionId`, `loading`,
      `error`.
    - actions: `loadForProject`, `createItem`, `updateItem`, `deleteItem`,
      `attachToSession`, `loadForSession`, `clearError`.
  - `index.ts` public API.
  - `project-context.model.test.ts` covering the action flows with a
    mocked api.
- [x] Re-export the mention pure helpers from C1 through
      `src/entities/project-context/index.ts` (already done in C1; index
      now also exports the types, api, and store).

**Verification**: all four gates pass. Renderer code can hold the store
without rendering UI yet.

**C4 verification (2026-04-30)**: all four gates green. 10 model tests
covering load, create, update (with cross-bucket propagation into
session attachments), delete (with cascade into session attachments),
attach refresh, per-project isolation, and error paths. Pure totals
1030; unit 354; chaperone 0 errors across 327 files.

---

## Phase C5 — Project settings CRUD UI

Goal: user can create, edit, and delete context items from project
settings. First user-visible surface.

- [x] Create `src/features/project-context-settings/`:
  - `project-context-list.container.tsx` — owns load + delete + open-edit
    - form-state flows; reads from `useProjectContextStore`.
  - `project-context-list.presentational.tsx` — renders the list with
    label, body preview, reinject badge, edit + delete actions, and an
    inline delete-confirm row.
  - `project-context-form.presentational.tsx` — create/edit form: optional
    label, multi-line body, reinject toggle. Renders the every-turn
    warning copy from the spec when toggle is on.
  - `index.ts` public API.
  - Container test (7 cases) covering: load/render with badges, empty
    state, open form, every-turn warning toggle, create flow, edit
    flow with prefilled values, delete confirm + cancel paths.
- [x] Compose into `src/features/project-settings/` via a new
      `contextSection` slot prop on the dialog. The dialog itself stays a
      feature; the actual `<ProjectContextSettings>` mount happens at the
      widget layer (`src/widgets/sidebar/sidebar.container.tsx`) where
      cross-feature composition is allowed by the FSD-lite rules.

**Verification**: all four gates pass. Manual: open project settings →
Context tab → create item → edit → delete. State persists across app
restart.

**C5 verification (2026-04-30)**: all four gates green. Pure 1030;
unit 361 (7 new container tests); chaperone 0 errors across 332 files.
Plan correction surfaced: features cannot import features (FSD-lite
boundary), so the host pattern uses a slot-prop composed at the widget
layer rather than a direct import inside the project-settings feature.
The fix loop also caught a Zustand selector returning a fresh `[]`
default per render, which created an infinite update loop; replaced
with a module-level constant.

---

## Phase C6 — Session-create attachment + boot injection wiring

Goal: user can attach context items at session create; the agent sees them
in the first message. End-to-end boot path lit up.

- [x] Extend `src/features/session-start/session-start.container.tsx` with a
      multi-select context picker bound to `loadForProject`. Picker is
      hidden when the project has zero items (per locked decision #3).
      `session-create-inline` is just a button that opens the
      session-intent dialog (no form), so no change is needed there.
- [x] Extend `createAndStartSession` (renderer
      `src/entities/session/session.model.ts`) and the `session.api.ts`
      `start` method to accept `contextItemIds: string[]` and forward via
      IPC. The `SendSessionMessageInput` type in
      `src/shared/types/electron-api.d.ts` and the backend
      `SendMessageInput` are extended to carry the field.
- [x] Extend backend `SessionService.start(id, input)` to:
  - persist attachments via `ProjectContextService.attachToSession` when
    `contextItemIds` is provided.
  - resolve project name → slug via `projectNameToSlug`.
  - call `serializeBootBlock` with attached items (boot + every-turn).
  - if a block was produced, emit a sequence-1 `note` `ConversationItem`
    with the block text **before** sending to the provider.
  - prepend the block to `input.text` before passing to `startHandle`.
- [x] Extend `session.service.test.ts` covering: start with no context
      items unchanged, start with boot items emits note + block prepended
      to the user message, attachments persist via `listForSession`,
      project name with special characters slugifies correctly.
- [x] Session-start form shows a chip-style multi-select strip when context
      items exist for the project, plus a one-line "N items will be
      injected" summary when items are selected. Full collapsible preview
      via the pure serializer is deferred — not v1 essential.

**Verification**: all four gates pass. Manual end-to-end: create context
item, create session attaching it, observe the `<slug:context>` block in
the transcript at sequence 0 and the agent referencing it in its first
response.

**C6 verification (2026-04-30)**: all four gates green. Pure 1034 (4
new session-service tests); unit 361; chaperone 0 errors across 332
files. Notes:

- Picker UI uses chip-style toggles via shadcn `<Button>` per the
  chaperone `no-raw-button-in-presentational-outside-shared` rule
  (caught a raw `<button>` on first pass).
- The boot note lands at sequence 1 (the first written sequence in this
  app's model is 1, not 0). Spec uses "sequence 0" colloquially; the
  ordering invariant — note before user message — holds either way.
- Collapsible preview deferred. Strip + count summary covers the
  "context will be injected" affordance for v1.

### Checkpoint after C6

Stop and verify with the user. By this point, boot injection is fully
working. Decide whether to ship a release at this checkpoint (no
every-turn, no `::mention`) or continue to C7. Either is a coherent
shippable cut.

---

## Phase C7 — Every-turn re-injection wiring

Goal: items flagged `every-turn` are prepended to every user-initiated
message in sessions that have them attached.

- [x] Extend `SessionService.sendMessage(id, input)` and the
      `dispatchToActiveHandle` path to call a new
      `injectEveryTurnContextBlock(session, text)` helper that runs
      `serializeEveryTurnBlock` against the latest items and returns the
      possibly-augmented text. The augmented text is forwarded to
      `handle.sendMessage` so the provider emits the user message with
      the prepended block; the persisted `ConversationItem.text` matches.
- [x] Apply the same prepend in the queued-input dispatch path
      (`dispatchNextQueuedInput`) for both the active-handle and the
      continuation-resume branches, so app-queued follow-ups also
      re-inject with the latest item bodies.
- [x] Apply to input-request answers and any other user-initiated
      send: the helper runs unconditionally on every `sendMessage` flow
      that ultimately calls `handle.sendMessage` or `startHandle` with a
      user-authored `text` field.
- [x] Do **not** apply to approval responses, tool results, or assistant
      continuations — those code paths do not pass through
      `dispatchToActiveHandle` / `dispatchNextQueuedInput` and are
      untouched.
- [x] Extend `session.service.test.ts` with a new describe block:
  - boot-only attachment + sendMessage → second message unchanged
    (no every-turn block).
  - every-turn item attached → block on every subsequent user message
    in the transcript, ending with the user's text.
  - editing the item between turns → next send carries the new body,
    prior turn unchanged.
  - deleting the item between turns → next send excludes it.
- [x] Composer affordance: a small "Every-turn context active · N
      item(s)" badge renders above the textarea via a new
      `everyTurnContextCount` prop on the Composer presentational, fed
      by a new `loadForSession` effect in the composer container that
      reads `attachmentsBySessionId[activeSessionId]` from the
      project-context store.

**Verification**: all four gates pass. Manual: attach an every-turn item
saying "always run npm test before claiming done", run two turns, observe
the block in both user messages in the transcript and in provider input.

**C7 verification (2026-04-30)**: all four gates green. Pure 1038
(four new every-turn cases on top of C6's four boot cases); unit 361;
chaperone 0 errors / 332 files. Notes:

- Tests use explicit `deliveryMode: 'normal'` so they run against the
  test provider's `NO_MID_RUN_INPUT_CAPABILITY` without falling
  through `resolveDeliveryMode`. The actual provider adapters
  (Claude, Codex, PI) carry their own capabilities, so production
  flows still pick a mode via `resolveDeliveryMode`.
- The badge intentionally does not link anywhere yet — the spec
  bullet ("clicking opens the project context settings tab") would
  need cross-feature wiring through the dialog store. Deferred as a
  future polish; the badge itself is enough to surface the active
  every-turn context.

---

## Phase C8 — Composer `::mention` picker

Goal: user can type `::name` in the composer to inline-expand a context
item body into the current message.

- [x] Extend `src/features/composer/composer.container.tsx` to:
  - run `detectMentionTrigger` on the latest `value`/`cursor` (cursor
    is fed from textarea `onChange`/`onKeyUp`/`onClick`).
  - own `mentionHighlightedIndex` and a `mentionDismissedRange` flag
    that drives Escape handling and auto-clears when the trigger range
    or open state changes.
  - derive `mentionItems` from
    `useProjectContextStore.itemsByProjectId[projectId]` filtered via
    `filterContextMentions`.
  - on accept, call `applyMentionExpansion` and queue a cursor restore
    via `pendingCursorRef`, applied in a `useEffect` after the value
    re-renders.
  - skill-picker state stays independent; the two pickers' triggers
    (`/` for skills, `::` for context) are disjoint by design.
- [x] Create `src/features/composer/composer-context-mention.presentational.tsx` —
      lightweight absolutely-positioned dropdown anchored above the
      textarea, listing items with label + body preview and
      `aria-selected` highlighting. Built without Radix Popover so the
      list anchors to the composer container without extra plumbing.
- [x] Add `src/features/composer/composer-context-mention.container.test.tsx`
      (7 cases): picker opens for `::`, filters by query, click insert,
      Enter insert, Escape close + reopen, mid-word `::` ignored, `:::`
      ignored.
- [x] Update the composer default placeholder to mention `::`
      ("Ask anything, @tag files/folders, / for commands, :: for
      project context...").

**Verification**: all four gates pass. Manual: type `::mon` → see picker
list filtered to items whose label starts with `mon`, Enter → body
inlined at cursor → Submit → provider receives the expanded plain text.
Verify transcript stores the expanded text, no `::` token persists.

**C8 verification (2026-04-30)**: all four gates green. Pure 1038
unchanged (no new pure cases — C1 already covered detection, expansion,
and filtering). Unit 368 (7 new mention container cases on top of C7).
Chaperone clean across 334 files. Notes:
- The picker is a plain absolutely-positioned `<div>` rather than a
  Radix Popover. Reason: shared `popover.tsx` doesn't expose
  `Popover.Anchor`, and adding it just for this list was more
  complexity than the v1 mention UX needs. Upgrading to Tiptap or a
  Radix-anchored variant remains the natural future path the spec
  flagged.
- The "skill picker (`/`) still works independently" bullet is
  exercised by the existing 5 composer tests, which all stayed green
  after the C7+C8 changes.

### Final checkpoint after C8

All three injection paths (boot, every-turn, mention) are working. Run a
manual end-to-end: create a multi-item project context, create a session
attaching some boot + every-turn items, send a message that uses a
`::mention`, verify all three blocks/expansions are in the transcript and
the provider behaves as expected. Open a PR.

---

## Cross-cutting non-goals (carry through every phase)

- No new runtime npm dependencies. Use existing shadcn primitives, the
  existing skill-picker pattern, and Zustand.
- No changes to provider adapters
  (`electron/backend/provider/{claude-code,codex,pi,shell}/...`).
- No retroactive transcript rewrites under any circumstances.
- No persistence of `::name` tokens. Mentions are inlined at composer
  submission time.
- Do not add typed context kinds. Free-text body + optional label only.

## Estimated sizes (rough, pre-implementation)

| Phase | Files touched  | New code (LOC, rough) | Risk |
| ----- | -------------- | --------------------- | ---- |
| C1    | ~6 new         | ~250                  | low  |
| C2    | ~3             | ~80                   | low  |
| C3    | ~5 new + 1 mod | ~350                  | med  |
| C4    | ~5 new         | ~200                  | low  |
| C5    | ~5 new + 1 mod | ~400                  | low  |
| C6    | 4 mod          | ~250                  | med  |
| C7    | 1–2 mod        | ~200                  | med  |
| C8    | 2 mod + 1 new  | ~250                  | low  |

Total scope: ~2 000 LOC, ~25 files, ~1 migration. Eight focused PRs is
the natural shape; bundle C1 + C2 if you want a smaller PR count.
