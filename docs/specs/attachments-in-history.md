# Attachments in Conversation History — Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: `docs/specs/session-attachments.md`, `docs/specs/session-conversation-normalization.md`
> Type: bug-fix + scope extension

## Context

`session-attachments.md` shipped attachment ingest, composer chips, hover preview, provider serialization, and persistence onto the legacy `sessions.transcript` JSON blob (T6 line 68: "persist `attachmentIds` onto the user transcript entry").

`session-conversation-normalization.md` later replaced that JSON blob with normalized `ConversationItem` rows. During the migration, two things happened:

1. **Regression**: every provider's `sessionEmitter.addUserMessage(...)` call lost the `attachmentIds` argument. The emitter still accepts the field; the call sites stopped passing it. As a result, attachments are correctly forwarded to the provider's stdin/RPC (so the model sees them) but never stored on the persisted user `ConversationItem`.
2. **Pre-existing gap**: the original spec never specified rendering attachments in the conversation transcript. Even before the regression, `ConversationItemView` had no branch to display attachment chips on a stored user message.

Result: user attaches an image, sends, model receives it correctly, but the transcript shows the user message text only — no chip, no thumbnail, no indication an attachment was sent. Confirmed user-visible bug across all three providers.

## Objective

Restore end-to-end attachment visibility:

1. Persist `attachmentIds` on the user `ConversationItem` payload at send time (regression fix).
2. Render attachments inline under the user message in the transcript, with the same hover-preview and click-to-open behavior as the composer.

## Scope

### In scope

- Re-wire `attachmentIds` at every provider `addUserMessage` call site (5 sites across claude-code, codex, pi).
- Hydrate attachment metadata for the session-view renderer (single IPC per session mount).
- Render an `AttachmentsRow` under user message text in `ConversationItemView` when `attachmentIds.length > 0`.
- Move `AttachmentChip` + `AttachmentsRow` + `AttachmentPreview*` from `src/features/composer/` to `src/entities/attachment/` so the transcript can reuse without violating FSD-lite import direction (widgets → features is illegal; widgets → entities is fine).
- Broken-file fallback: if an attachment ID resolves to no row (orphaned by session ops or DB drift), render a chip with a broken-file icon and the original filename (if known) or "Unavailable attachment".
- Tests:
  - Unit: provider serializer call-site regression test (each provider passes attachment IDs through to emitter).
  - Renderer: `ConversationItemView` renders chips for user messages with attachments; renders broken-icon for missing IDs.
  - Pure: nothing new — capability/serialization tests already exist.

### Out of scope

- Re-rendering composer-incompatible state in history (e.g. switching providers mid-session never triggers history-side validation; we render whatever was sent).
- Inline image rendering inside the message bubble (chips only — same density as composer).
- Editing or removing attachments from a sent message (history is immutable).
- Attachments on assistant messages (assistant doesn't produce `Attachment` records; tool/tool-use events are separate).
- Lazy-loading thumbnails: every chip's thumbnail loads on session-view mount via the same `getForSession` batch fetch.
- Backfilling historical messages that pre-date this fix: those messages have no `attachmentIds` to recover. Bug only blocks future sends.

## Tech Decisions

| Decision                                          | Choice                                                                                                                 | Rationale                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistence call site                             | Provider adapters pass `attachmentIds: attachments.map(a => a.id)` to `addUserMessage`                                 | Smallest diff, fixes regression at source. Five lines changed total.                                                                                                                                                                                                   |
| Centralization                                    | Keep call site in provider, do **not** move to session.service                                                         | Considered hoisting into `session.service.sendMessage` so providers can't regress again. Rejected: provider already owns `addUserMessage` (it knows when the turn truly starts). Adding a regression test per provider is cheaper than restructuring the emitter call. |
| Hydration strategy                                | Single `attachments:getForSession(sessionId)` IPC on session-view mount, build `Map<id, Attachment>`, pass to renderer | One IPC per session view, simpler than backend join, leverages existing channel. New attachments added during session don't need re-fetch — they're already in the Zustand draft store at send time and added to the local map after send.                             |
| Component slice                                   | Move chip/row/preview to `entities/attachment/`                                                                        | Composer (feature) and session-view (widget) both consume. FSD-lite import direction requires entities-or-shared. Composer continues to consume via slice public API.                                                                                                  |
| Broken-file fallback                              | Render chip with `FileWarning` icon + filename (if any) + "Unavailable" tooltip                                        | Honest signal that something was sent. Hiding silently lies. Considered "skip render" — rejected because the message would render as text-only despite original send including attachments.                                                                            |
| Attachment metadata in `ConversationItem` payload | No change — `attachmentIds: string[]` stays as-is                                                                      | Ids are stable; metadata can change (file moved, archived, etc). Storing IDs only avoids stale snapshots.                                                                                                                                                              |
| Assistant attachments                             | Not modeled                                                                                                            | Assistants don't produce `Attachment` records in any provider. Out of scope.                                                                                                                                                                                           |

## File Changes

### Provider adapters (regression fix)

| File                                                                | Change                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `electron/backend/provider/claude-code/claude-code-provider.ts:571` | Pass `attachmentIds: attachments?.map(a => a.id)` (when non-empty) |
| `electron/backend/provider/codex/codex-provider.ts:465`             | Same — `initialMessage` start path                                 |
| `electron/backend/provider/codex/codex-provider.ts:869`             | Same — `sendMessage` follow-up path                                |
| `electron/backend/provider/pi/pi-provider.ts:647`                   | Same — start path                                                  |
| `electron/backend/provider/pi/pi-provider.ts:685`                   | Same — `sendMessage` path                                          |

### Component relocation (slice move)

| Old path (delete)                                               | New path (create)                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/features/composer/attachment-chip.presentational.tsx`      | `src/entities/attachment/attachment-chip.presentational.tsx`      |
| `src/features/composer/attachment-chip.presentational.test.tsx` | `src/entities/attachment/attachment-chip.presentational.test.tsx` |
| `src/features/composer/attachments-row.presentational.tsx`      | `src/entities/attachment/attachments-row.presentational.tsx`      |
| `src/features/composer/attachment-preview.container.tsx`        | `src/entities/attachment/attachment-preview.container.tsx`        |
| `src/features/composer/attachment-preview.presentational.tsx`   | `src/entities/attachment/attachment-preview.presentational.tsx`   |

`src/entities/attachment/index.ts` re-exports the moved components alongside existing types/api/model.

`composer.container.tsx` updates imports to consume from the entity public API.

### History rendering (new)

| File                                                                                             | Purpose                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/widgets/session-view/conversation-item.container.tsx`                                       | New container. Subscribes to a session-scoped attachment map (Zustand selector). Resolves `entry.attachmentIds → Attachment[]`. Passes resolved + missing IDs to presentational.                                                                                                                                     |
| `src/widgets/session-view/transcript-entry.presentational.tsx`                                   | Updated: user-message branch accepts optional `attachments: Attachment[]` and `missingAttachmentIds: string[]` props. Renders `<AttachmentsRow>` below text when present.                                                                                                                                            |
| `src/widgets/session-view/session-view.container.tsx` (or wherever current loop renders entries) | On mount + on `sessionId` change, calls `attachmentApi.getForSession(sessionId)` and stores result in a per-session-view local state (or extends `useAttachmentStore` with a `resolved` per-session map).                                                                                                            |
| `src/entities/attachment/attachment.model.ts`                                                    | Add a `resolved` slice keyed by sessionId: `Map<id, Attachment>`. Action `hydrateForSession(sessionId, items[])`. Selector `selectResolvedById(sessionId, id)`. Composer's `ingest*` actions push into `resolved` too, so newly-attached items render immediately on the next user message in the same session view. |
| `src/entities/attachment/attachment.model.test.ts`                                               | New tests: hydrate populates map; ingest also writes resolved entry; `clearDraft` does NOT evict resolved entries; missing IDs return `undefined`.                                                                                                                                                                   |

### Tests

| File                                                                          | Purpose                                                                                                                                               |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/backend/provider/claude-code/claude-code-provider.test.ts` (or new) | `addUserMessage` is called with `attachmentIds` when attachments are present                                                                          |
| `electron/backend/provider/codex/codex-provider.test.ts`                      | Same — start + sendMessage paths                                                                                                                      |
| `electron/backend/provider/pi/pi-provider.test.ts`                            | Same                                                                                                                                                  |
| `src/widgets/session-view/transcript-entry.presentational.test.tsx`           | User message with `attachments` prop renders `AttachmentsRow`; with `missingAttachmentIds` renders broken-icon chip; without either renders text-only |
| `src/entities/attachment/attachment-chip.presentational.test.tsx`             | Already exists; adapt path after move                                                                                                                 |

### Docs

| File                                       | Update                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `docs/architecture/quick-reference.md`     | §7 "Session attachments" — note the entity-slice ownership of UI components and the history-render path |
| `docs/specs/session-attachments.md`        | Add a short "Update: history rendering and post-normalization regression fix" pointer to this spec      |
| `.changeset/fix-attachments-in-history.md` | `patch` changeset (regression) + `minor` for new render. Single file, pick the higher: `minor`.         |

## Persistence

No schema changes. `ConversationItem.kind === 'message'` payload already supports `attachmentIds?: string[]` (see `conversation-item.pure.ts`). Round-trip through `payload_json` is verified by existing tests.

## Error Handling

| Failure                                                | Behavior                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `getForSession` IPC fails                              | Log; render all attachment chips as broken-icon for that session view                                |
| Attachment row exists but `storagePath` deleted        | Chip renders metadata; preview modal shows "File missing" state                                      |
| `attachmentIds` array empty/undefined                  | No chip row rendered (existing behavior)                                                             |
| Provider attaches `attachmentIds` to assistant message | Programmer error — emitter signature is user-only by design. Not possible without explicit refactor. |

## Test Plan

### Unit (regression guards)

- For each provider: when `startTurn` / `sendMessage` is called with `attachments: [a, b]`, the spy on `sessionEmitter.addUserMessage` receives `attachmentIds: [a.id, b.id]`.
- When called with no attachments: `addUserMessage` receives no `attachmentIds` field (or undefined).

### Renderer

- `ConversationItemView` user message + 2 resolved attachments → renders 2 chips below text.
- Same with 1 resolved + 1 missing → renders 1 normal chip + 1 broken-icon chip.
- No attachments → no chip row, no extra DOM.
- Click chip in history → preview modal opens (same component as composer).

### Manual smoke

- Start Claude Code session, attach 1 image + 1 PDF, send "describe these", confirm:
  - Model responds correctly (existing behavior).
  - **New**: user message in transcript shows two chips below text.
  - **New**: clicking a chip opens preview modal.
- Same flow on Codex (image + text file) and Pi (image).
- Reload app, reopen session → chips still present (persistence verified).
- Delete an attachment file from `{userData}/attachments/{sessionId}/` manually, reload → broken-icon fallback renders.

## Rollout

- Single PR. Two commits for clean bisect:
  1. `fix: re-wire attachmentIds onto persisted user ConversationItem` (the 5-line provider patch + per-provider regression tests).
  2. `feat: render attachments in conversation history` (slice move + container + presentational + render tests).
- No flag. No migration. Existing pre-fix messages render text-only (no IDs to recover).

## Open Questions

1. **Provider-side regression-prevention hoist**: should `addUserMessage` move into `session.service` so providers physically can't drop the field? Punted — adds a layer. Per-provider regression test is the chosen guardrail. Revisit if a fourth provider lands.
2. **Hover preview parity in history**: composer hover-opens preview on chip hover. Spec preserves that. If usability testing shows transcripts feel noisy with hover-modals, demote history chips to click-only. Defer until shipped.
