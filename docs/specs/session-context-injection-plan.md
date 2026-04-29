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

- [ ] New migration in `electron/backend/database/migrations/` adding
      `project_context_items` and `session_context_attachments` tables per
      the spec. Both have `ON DELETE CASCADE` on their parent FKs.
- [ ] Extend `electron/backend/database/database.types.ts` with
      `ProjectContextItemRow` and `SessionContextAttachmentRow`.
- [ ] Migration test (or verification step in
      `database.service.test.ts`) confirming the tables are created on
      fresh install and existing DBs migrate without data loss.

**Verification**: all four gates pass. Manual smoke: launch the app, open
the SQLite file, confirm both new tables exist and existing sessions are
unmodified.

---

## Phase C3 — Backend service + IPC + preload

Goal: backend can CRUD context items, attach them to sessions, and list
them. Renderer not yet involved.

- [ ] Create `electron/backend/project-context/project-context.types.ts`
      with `ProjectContextItem`, `CreateProjectContextItemInput`,
      `UpdateProjectContextItemInput`, IPC payload types. Re-export the
      pure helpers from C1 through this module's `index` if it helps
      consumers.
- [ ] Create `electron/backend/project-context/project-context.service.ts`:
  - `list(projectId): ProjectContextItem[]`
  - `create(input): ProjectContextItem`
  - `update(id, patch): ProjectContextItem`
  - `delete(id): void`
  - `attachToSession(sessionId, itemIds): void` — replaces the current set
    of attachments for the session.
  - `listForSession(sessionId): ProjectContextItem[]` — returns items in
    attachment order, joined against `project_context_items`.
- [ ] `project-context.service.test.ts` covering CRUD round-trips,
      cascade-delete on project removal, attach replaces existing set,
      `listForSession` ordering, attach to non-existent session throws.
- [ ] Create `electron/backend/project-context/project-context.ipc.ts`
      registering channels:
      `projectContext:list`, `projectContext:create`,
      `projectContext:update`, `projectContext:delete`,
      `projectContext:attachToSession`, `projectContext:listForSession`.
- [ ] Wire `ProjectContextService` into `electron/main` bootstrap.
- [ ] Extend `electron/preload/index.ts` to expose a `projectContext`
      namespace mirroring the IPC channels.

**Verification**: all four gates pass. Manual smoke from devtools console:
`window.electronAPI.projectContext.create({ projectId, body: 'hello', reinjectMode: 'boot' })`
and read it back via `list`.

---

## Phase C4 — Renderer plumbing: entity + store + API surface

Goal: renderer can invoke project-context operations through a Zustand
store. No UI yet.

- [ ] Create `src/entities/project-context/`:
  - `project-context.types.ts` — re-export the IPC payload types.
  - `project-context.api.ts` — preload-bridge wrappers for the six IPC
    channels.
  - `project-context.model.ts` — Zustand store keyed by `projectId` and
    `sessionId`:
    - state: `itemsByProjectId`, `attachmentsBySessionId`, `error`.
    - actions: `loadForProject`, `createItem`, `updateItem`, `deleteItem`,
      `attachToSession`, `loadForSession`.
  - `index.ts` public API.
  - `project-context.model.test.ts` covering the action flows with a
    mocked api.
- [ ] Re-export the mention pure helpers from C1 through
      `src/entities/project-context/index.ts`.

**Verification**: all four gates pass. Renderer code can hold the store
without rendering UI yet.

---

## Phase C5 — Project settings CRUD UI

Goal: user can create, edit, and delete context items from project
settings. First user-visible surface.

- [ ] Create `src/features/project-context-settings/`:
  - `project-context-list.container.tsx` — owns load + delete + open-edit
    flows.
  - `project-context-list.presentational.tsx` — renders the list with
    label, body preview, reinject badge, edit + delete actions.
  - `project-context-form.presentational.tsx` — create/edit form: optional
    label, multi-line body, reinject toggle. Renders the every-turn
    warning copy from the spec when toggle is on.
  - `index.ts` public API.
  - Container test covering: list render, create flow, update flow,
    delete with confirm, every-turn warning visibility.
- [ ] Add a `Context` section/tab to `src/features/project-settings/`
      hosting the new feature. Match the existing settings shell pattern.

**Verification**: all four gates pass. Manual: open project settings →
Context tab → create item → edit → delete. State persists across app
restart.

---

## Phase C6 — Session-create attachment + boot injection wiring

Goal: user can attach context items at session create; the agent sees them
in the first message. End-to-end boot path lit up.

- [ ] Extend `src/features/session-start/session-start.container.tsx` and
      `src/features/session-create-inline/session-create-inline.container.tsx`
      with multi-select context picker bound to `loadForProject`. Picker is
      hidden when the project has zero items (per locked decision #3).
- [ ] Extend `createAndStartSession` (renderer
      `src/entities/session/session.model.ts`) and the `session.api.ts`
      `start` method to accept `contextItemIds: string[]` and forward via
      IPC.
- [ ] Extend backend `SessionService.start(id, input)` to:
  - persist attachments via `ProjectContextService.attachToSession`.
  - resolve project name → slug.
  - call `serializeBootBlock` with attached items.
  - if a block was produced, emit a sequence-0 `note` `ConversationItem`
    with the block text **before** sending to the provider.
  - prepend the block to `input.text` before passing to `startHandle`.
- [ ] Extend `session.service.test.ts` covering: start with no context
      items unchanged, start with boot items emits note + block prepended,
      project name with special characters slugifies correctly.
- [ ] Boot preview in the session-start form: small "Context will be
      injected" hint with collapsible preview rendered via the same pure
      serializer.

**Verification**: all four gates pass. Manual end-to-end: create context
item, create session attaching it, observe the `<slug:context>` block in
the transcript at sequence 0 and the agent referencing it in its first
response.

### Checkpoint after C6

Stop and verify with the user. By this point, boot injection is fully
working. Decide whether to ship a release at this checkpoint (no
every-turn, no `::mention`) or continue to C7. Either is a coherent
shippable cut.

---

## Phase C7 — Every-turn re-injection wiring

Goal: items flagged `every-turn` are prepended to every user-initiated
message in sessions that have them attached.

- [ ] Extend `SessionService.sendMessage(id, input)` and the
      `dispatchToActiveHandle` path to:
  - read attached items for the session via
    `ProjectContextService.listForSession`.
  - filter to `reinjectMode === 'every-turn'`.
  - if any, call `serializeEveryTurnBlock` and prepend to `input.text`
    before persisting the user `message` ConversationItem and before
    `handle.sendMessage`.
- [ ] Apply the same prepend in the queued-input dispatch path
      (`dispatchNextQueuedInput`) so app-queued follow-ups also re-inject.
- [ ] Apply to input-request answers (locked decision #2).
- [ ] Do **not** apply to approval responses, tool results, or assistant
      continuations.
- [ ] Extend `session.service.test.ts`:
  - every-turn item present → block on first send AND second send (with
    latest body)
  - editing item between turns → next send sees the new body, prior turn
    unchanged
  - deleting item between turns → next send excludes it, prior turn
    unchanged
  - approval / tool result paths unaffected
- [ ] Composer affordance: small badge "Every-turn context active · N
      items" rendered when the active session has every-turn items;
      clicking opens the project context settings tab.

**Verification**: all four gates pass. Manual: attach an every-turn item
saying "always run npm test before claiming done", run two turns, observe
the block in both user messages in the transcript and in provider input.

---

## Phase C8 — Composer `::mention` picker

Goal: user can type `::name` in the composer to inline-expand a context
item body into the current message.

- [ ] Extend `src/features/composer/composer.container.tsx` to:
  - run `detectMentionTrigger` on textarea value + selection on input and
    keyup.
  - own `mentionPickerOpen` and `mentionQuery` state.
  - own `mentionItems` derived from
    `useProjectContextStore` filtered via `filterContextMentions`.
  - on accept, call `applyMentionExpansion` and update both the textarea
    value and the cursor.
  - keep skill-picker state independent; both pickers can never be open
    simultaneously (skills triggered by `/`, mentions by `::`, but
    guard against overlap).
- [ ] Create `src/features/composer/composer-context-mention.presentational.tsx` —
      shadcn `Popover` anchored to the textarea, listing items with label + body preview, keyboard navigable.
- [ ] Extend `composer.container.test.tsx`:
  - typing `::` opens the picker
  - arrow + Enter inserts the body and advances cursor
  - Escape closes without inserting
  - mid-word `::` does NOT open the picker
  - skill picker (`/`) still works independently
- [ ] Update the composer placeholder to mention `::` as an additional
      trigger (currently it says "@tag files/folders, or use / to show
      available commands"; add ", :: to insert project context").

**Verification**: all four gates pass. Manual: type `::mon` → see picker
list filtered to items whose label starts with `mon`, Enter → body
inlined at cursor → Submit → provider receives the expanded plain text.
Verify transcript stores the expanded text, no `::` token persists.

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
