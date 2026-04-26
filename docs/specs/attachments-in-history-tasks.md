# Attachments in History — Implementation Tasks

> Tracking checklist for `docs/specs/attachments-in-history.md`. Tick as items land.

## T0 — Preflight

- [ ] Confirm `.nvmrc` Node version active (`fnm use` or equivalent)
- [ ] Baseline green: `npm run test:pure`, `npm run test:unit`, `npm run typecheck`, `chaperone check --fix`
- [ ] Read `electron/backend/provider/provider-session.emitter.ts` to confirm `addUserMessage` signature still accepts `attachmentIds?: string[]`

## T1 — Regression fix: provider call sites

Order: smallest diff first; ship as one commit.

- [ ] `electron/backend/provider/claude-code/claude-code-provider.ts:571` — pass `attachmentIds: attachments?.map(a => a.id)` (omit when undefined/empty)
- [ ] `electron/backend/provider/codex/codex-provider.ts:465` — same on start path
- [ ] `electron/backend/provider/codex/codex-provider.ts:869` — same on sendMessage path
- [ ] `electron/backend/provider/pi/pi-provider.ts:647` — same on start path
- [ ] `electron/backend/provider/pi/pi-provider.ts:685` — same on sendMessage path

## T2 — Regression tests

- [ ] `electron/backend/provider/claude-code/claude-code-provider.test.ts` — add: with attachments, emitter spy receives `attachmentIds`; without, it doesn't
- [ ] `electron/backend/provider/codex/codex-provider.test.ts` — create if absent (per T4 line 51 of session-attachments-tasks, no baseline). Cover both start + sendMessage call sites.
- [ ] `electron/backend/provider/pi/pi-provider.test.ts` — same coverage

Run: `npm run test:unit` — must pass before T3.

## T3 — Slice move: chip/row/preview to entities

Order: move file → update imports → run typecheck → run chaperone.

- [ ] Move file (and update imports inside): `src/features/composer/attachment-chip.presentational.tsx` → `src/entities/attachment/attachment-chip.presentational.tsx`
- [ ] Move test: `src/features/composer/attachment-chip.presentational.test.tsx` → `src/entities/attachment/attachment-chip.presentational.test.tsx`
- [ ] Move: `src/features/composer/attachments-row.presentational.tsx` → `src/entities/attachment/`
- [ ] Move: `src/features/composer/attachment-preview.container.tsx` → `src/entities/attachment/`
- [ ] Move: `src/features/composer/attachment-preview.presentational.tsx` → `src/entities/attachment/`
- [ ] `src/entities/attachment/index.ts` — re-export the moved symbols alongside existing types/api/model
- [ ] Update `src/features/composer/composer.container.tsx` imports to consume from `@/entities/attachment`
- [ ] Run `npm run typecheck` — fix any deep-import paths the move broke
- [ ] Run `chaperone check --fix` — confirm no FSD-lite boundary violations remain

## T4 — Resolved-attachment store slice

- [ ] `src/entities/attachment/attachment.model.ts`
  - [ ] Add `resolved: Record<sessionId, Map<attachmentId, Attachment>>`
  - [ ] Action `hydrateForSession(sessionId, items: Attachment[])` — replaces map for that session
  - [ ] In existing `ingestFiles` / `ingestFromPaths`: also write each new attachment into `resolved[sessionId]` (so newly-attached items render in history immediately after send without re-fetch)
  - [ ] Selector `selectResolvedAttachment(sessionId, id) => Attachment | undefined`
  - [ ] `clearDraft(sessionId)` does NOT touch `resolved` (history must keep showing past attachments)
- [ ] `src/entities/attachment/attachment.model.test.ts` — new tests:
  - [ ] `hydrateForSession` populates map
  - [ ] `ingestFiles` also writes resolved entry
  - [ ] `clearDraft` keeps resolved entries
  - [ ] `selectResolvedAttachment` returns `undefined` for unknown IDs

## T5 — Hydration on session-view mount

- [ ] Locate the session-view container that owns the current `sessionId` and renders the entries loop
- [ ] On mount + on `sessionId` change: call `attachmentApi.getForSession(sessionId)` → `useAttachmentStore.hydrateForSession(sessionId, result)`
- [ ] Handle IPC failure: log; downstream render falls back to broken-icon chips for unresolved IDs (acceptable degradation)

## T6 — History rendering

- [ ] `src/widgets/session-view/conversation-item.container.tsx` — new container:
  - [ ] Receives `entry: ConversationItem` + `sessionId: string`
  - [ ] Selects from store: `attachments` array (resolved) + `missingAttachmentIds` array (in `entry.attachmentIds` but not in resolved map) — only for `entry.kind === 'message' && entry.actor === 'user'`
  - [ ] Passes resolved data to presentational; for non-user kinds, passes through unchanged
- [ ] `src/widgets/session-view/transcript-entry.presentational.tsx` — extend user-message branch:
  - [ ] Accept optional `attachments?: Attachment[]` and `missingAttachmentIds?: string[]` props (presentational receives ready-made data, no hooks)
  - [ ] When either non-empty: render `<AttachmentsRow>` below the `<Markdown>` text
  - [ ] For each missing ID: render a chip with `FileWarning` icon + "Unavailable" label
- [ ] Update parent loop to render via the new container instead of presentational directly
- [ ] `chaperone check --fix` — confirm presentational has no hooks (per `feedback_presentational_no_hooks`)

## T7 — Render tests

- [ ] `src/widgets/session-view/transcript-entry.presentational.test.tsx`
  - [ ] User message + 2 attachments → 2 chips render
  - [ ] User message + 1 attachment + 1 missing ID → 1 normal chip + 1 broken-icon chip
  - [ ] User message + no attachments → no chip row in DOM
  - [ ] Assistant message ignores attachment props (defensive)
- [ ] Adapt moved `attachment-chip.presentational.test.tsx` for new path; add test: `kind="missing"` (or whatever broken-state prop) renders FileWarning

## T8 — Docs + changeset

- [ ] `docs/architecture/quick-reference.md` §7 — note slice-ownership of UI components + history-render path
- [ ] `docs/specs/session-attachments.md` — add cross-reference paragraph pointing to `attachments-in-history.md`
- [ ] `.changeset/fix-attachments-in-history.md` — `minor` (covers feat-render + fix-regression)

## T9 — Full verification

- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual smoke (human-driven):
  - [ ] Claude Code: send 1 image + 1 PDF → user message shows 2 chips → click image → preview modal opens
  - [ ] Codex: send 2 images + 1 CSV → 3 chips render (CSV as text-icon)
  - [ ] Pi: send 1 JPEG + 1 markdown → 2 chips render
  - [ ] App reload → chips persist on reopened session
  - [ ] Delete `{userData}/attachments/{sessionId}/{attachmentId}.png` manually → reload session → chip renders broken-icon

## T10 — Self-review before hand-off

- [ ] No `*.presentational.tsx` file added during this task uses `useState` / `useEffect` (chaperone-enforced)
- [ ] `composer.container.tsx` imports come exclusively through `@/entities/attachment` public API (no deep paths)
- [ ] `widgets/session-view` imports `entities/attachment` (legal direction), not `features/composer`
- [ ] Each of the 5 provider call sites passes `attachmentIds` only when non-empty (no spurious empty arrays in stored payloads)
- [ ] Diff size sanity: ~5 lines provider fix, ~5 file moves, ~1 new container, ~2 model fields, ~3 test files. Total ≪ original session-attachments rollout. If diff is much larger, scope crept.
