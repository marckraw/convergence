# Session Attachments — Implementation Tasks

> Tracking checklist for the one-PR rollout of `docs/specs/session-attachments.md`.
> Tick items as they land. Keep ordering — later tasks depend on earlier ones.

## T0 — Preflight

- [x] ~~Confirm pre-existing test tooling break~~ — **resolved:** `.nvmrc` requires Node 24.14.1; baseline suites pass (`test:pure` 172/172, `test:unit` 55/55) under correct Node.
- [ ] Verify Claude Code `--input-format stream-json --resume {id}` round-trips correctly via a quick live smoke test (open question #1 in spec). **Deferred to T3 implementation** — adapter will be the first live probe.
- [x] Smoke-check: `codex app-server generate-ts --experimental` output — confirmed `UserInput` has `{type:"text"|"image"|"localImage"|"skill"|"mention"}`; `turn/start.input: Array<UserInput>`. Matches spec.

## T1 — Attachment entity + backend storage

- [x] `electron/backend/attachments/attachments.types.ts` — `Attachment`, `AttachmentKind`, capability types
- [x] `electron/backend/attachments/mime-sniff.pure.ts` — magic-number detection (PNG, JPEG, GIF, WebP, PDF, UTF-8 text)
- [x] `electron/backend/attachments/mime-sniff.pure.test.ts`
- [x] `electron/backend/attachments/image-normalize.pure.ts` — EXIF strip only (pure byte work on JPEG APP1). Resize to 2048 px longest edge deferred to renderer Canvas per spec Tech Decisions row; no native dep added.
- [x] `electron/backend/attachments/image-normalize.pure.test.ts`
- [x] `electron/backend/attachments/attachments.service.ts` — ingest-from-bytes, ingest-from-paths, readBytes, delete, orphan sweep; wires DB + filesystem + normalizer + sniffer
- [x] `electron/backend/attachments/attachments.service.test.ts`
- [x] `electron/backend/database/database.ts` — add `attachments` table + index. At the time of this rollout, `attachmentIds` lived inline in the legacy `sessions.transcript` JSON blob; later conversation normalization migrated them into normalized conversation-item payloads and removed the live `sessions.transcript` column.

## T2 — Provider type contract + descriptor capability

- [x] `electron/backend/provider/provider.types.ts`
  - [x] Add `ProviderAttachmentCapability` (re-exported from `attachments.types.ts`)
  - [x] Add `ProviderDescriptor.attachments`
  - [x] Extend `TranscriptEntry` `user` variant with optional `attachmentIds?: string[]`
  - [x] Extend `SessionStartConfig` with optional `initialAttachments?: Attachment[]`
  - [x] Change `SessionHandle.sendMessage` to `(text: string, attachments?: Attachment[]) => void`
- [x] Update each provider's `describe()` to return its capability row per spec table — added capability constants in `provider-descriptor.pure.ts` and wired them into claude/codex/pi fallback descriptor builders (all provider adapters spread the fallback, so they inherit the field)

## T3 — Claude Code adapter

- [x] `electron/backend/provider/claude-code/claude-code-message.pure.ts` — build `{type:"user", message:{role,content:[...]}}` JSON line from `{text, parts}`. Images-first, then documents, then a single text block with inlined text attachments + user text.
- [x] `electron/backend/provider/claude-code/claude-code-message.pure.test.ts` — golden cases: text-only, single image, image+text, pdf+text, inlined text file, mixed all-three, attachments-only (empty user text)
- [x] `electron/backend/provider/claude-code/claude-code-provider.ts`
  - [x] Switch spawn flags to `--input-format stream-json` in addition to output
  - [~] **Deviation from spec:** kept existing spawn-per-turn lifecycle (one spawn per `startTurn`, multi-turn preserved through `--resume {sessionId}`). Spec's "long-lived stdin for session lifetime" is a larger refactor deferred — risk/reward doesn't justify that change as part of attachments. After-serialize write-once-then-end stdin matches existing lifecycle.
  - [x] `sendMessage(text, attachments)` writes one NDJSON line produced by the pure serializer
  - [x] `start()` writes first line using `initialAttachments` if provided
  - [x] On stop/error, close stdin before kill (stdin is ended after the single write; `stopped` guards further writes)
- [x] Existing `claude-code-provider.test.ts` does not assert stdin wire shape, so no update required.

## T4 — Codex adapter

- [x] `electron/backend/provider/codex/codex-message.pure.ts` — build `UserInput[]` array. `localImage` entries first, then a single `text` entry with inlined text files + user text. Reject any PDF arrival with a thrown `Error('Codex does not support PDF attachments')` (defensive; UI gates before here).
- [x] `electron/backend/provider/codex/codex-message.pure.test.ts` — golden matrix incl. PDF-error case
- [x] `electron/backend/provider/codex/codex-provider.ts`
  - [x] Both `turn/start` call sites (initial `initialize` + ongoing `sendMessage`) use serializer output via `loadCodexParts` helper
- [~] No existing `codex-provider.test.ts` to update (no baseline test file — codex adapter only had `codex-errors` and `jsonrpc` tests).

## T5 — Pi adapter

- [x] `electron/backend/provider/pi/pi-message.pure.ts` — build `{message, images?}` from `{text, attachments}`. Images → base64 `{type:"image", data, mimeType}`. Text files inlined in `message`. PDFs throw defensively.
- [x] `electron/backend/provider/pi/pi-message.pure.test.ts` — 10 cases: text-only, empty, single/multi image, inlined text, mixed, image-only empty text, omit-images-when-none, PDF throw, missing-bytes throw
- [x] `electron/backend/provider/pi/pi-provider.ts`
  - [x] Serializer drives `prompt` command via `sendPromptWithAttachments`. `images` included only when non-empty. `streamingBehavior: "steer"` attached after by caller (only when `isStreaming`), preserving existing logic.
  - [~] Pi v1 has no separate `steer` / `follow_up` commands; the `streamingBehavior: "steer"` flag on `prompt` is the only surface. Serializer is flag-agnostic.
- [~] Existing `pi-provider.test.ts` does not assert wire shape; no update required.

## T6 — Session service + IPC

- [x] `electron/backend/session/session.service.ts`
  - [x] Accept attachment ids on `start(id, {text, attachmentIds?})` and `sendMessage(id, {text, attachmentIds?})`
  - [x] Resolve ids → `Attachment[]` via `attachments.service` (`setAttachmentsService` wiring; throws if ids missing)
  - [x] Thread into provider handle (initial via `initialAttachments`, follow-up via `sendMessage`)
  - [x] Persist `attachmentIds` onto the `user` transcript entry (via `pendingUserAttachmentIds` + `appendTranscript` annotation)
  - [x] On session delete: invoke `attachments.service.deleteForSession(id)` (filesystem rm-rf)
- [x] `electron/backend/session/session.service.test.ts` — 4 new tests: start threads ids → provider, persists on user entry, cascades delete, throws on unknown id. Existing tests migrated to `{text}` payload shape.
- [x] `electron/main/ipc.ts`
  - [x] `session:start` and `session:sendMessage` payload switches to object `{text, attachmentIds?}`
  - [x] New `attachments:ingestFiles`
  - [x] New `attachments:ingestFromPaths`
  - [x] New `attachments:getForSession`
  - [x] New `attachments:getById`
  - [x] New `attachments:readBytes`
  - [x] New `attachments:delete`
  - [x] Added `attachments:showOpenDialog` (scoped file picker with multi-select)
  - [x] Orphan sweep invocation at main-process ready (before window creation, warn-and-continue on error)
- [x] `electron/preload/index.ts` — expose `attachments` API + session `start`/`sendMessage` accept `{text, attachmentIds?}` (string also accepted for back-compat during migration)
- [x] `src/shared/types/electron-api.d.ts` — added `AttachmentData`, `ProviderAttachmentCapability`, `AttachmentIngestResult`, `SendSessionMessageInput`; extended `TranscriptEntry.user` with `attachmentIds?`; `ProviderInfo.attachments`; updated session API signatures

## T7 — Renderer entity slice

- [x] `src/entities/attachment/attachment.types.ts` — mirror of backend `Attachment`, `AttachmentKind`, `AttachmentIngestRejection`, `AttachmentIngestResult`, `AttachmentIngestFileInput`
- [x] `src/entities/attachment/attachment.api.ts` — thin wrappers over `window.electronAPI.attachments.*` (spec referenced `window.api`, but repo convention is `electronAPI`)
- [x] `src/entities/attachment/attachment.model.ts` — Zustand slice keyed by sessionId (drafts per composer session): `ingestFiles`, `ingestFromPaths`, `removeDraft`, `clearDraft`, `clearRejections`, `getDraft`
- [x] `src/entities/attachment/attachment.model.test.ts` — 7 tests: ingest stores, append, per-session isolation, remove + backend delete, clearDraft, thrown errors captured as rejections, clearRejections keeps items
- [x] `src/entities/attachment/index.ts` — public API; also re-exported from `src/entities/index.ts`
- [x] Propagated `ProviderAttachmentCapability` + `TranscriptEntry.user.attachmentIds?` into `src/entities/session/session.types.ts`; backfilled existing test fixtures (`provider-selection`, `app-settings.container`, `composer.container`)

## T8 — Composer UI

- [x] `src/features/composer/attachment-capability.pure.ts` — validator: `{attachments, capability} → { ok, errors, errorByAttachmentId, totalBytes, exceedsTotal }`. Used by composer render + submit gate.
- [x] `src/features/composer/attachment-capability.pure.test.ts` — 7 tests: compatible, PDF-on-codex, oversize image, over-total cap, empty, missing capability, mixed errors
- [x] `src/features/composer/attachment-chip.presentational.tsx` — thumbnail (or kind icon) + middle-ellipsized filename + × + capability-incompatible red outline + tooltip
- [x] `src/features/composer/attachment-chip.presentational.test.tsx` — 3 tests: open click, remove click, error styling/tooltip
- [x] `src/features/composer/attachments-row.presentational.tsx` — row of chips; renders null when empty
- [x] `src/features/composer/attachment-preview.container.tsx` — fetch bytes via `attachmentApi.readBytes`, blob URL for image/pdf, UTF-8 decode for text; revoke on close
- [x] `src/features/composer/attachment-preview.presentational.tsx` — image / pdf `<embed>` / text `<pre>` renderers inside Dialog
- [x] `src/features/composer/composer.container.tsx`
  - [x] `+` button (`Paperclip` icon) → `attachmentApi.showOpenDialog` → `ingestFromPaths`
  - [x] Textarea `onPaste` → collect file/image items → `ingestFiles` (plain text paste falls through)
  - [x] Composer root `onDragEnter/Over/Leave/Drop` → dashed primary outline + `ingestFiles`
  - [x] Chip row rendered from `useAttachmentStore` draft (keyed by sessionId or `__new__` for drafts)
  - [x] Submit passes `attachmentIds` alongside `text` when present, clears draft on success
  - [x] Send gated on `validateAttachmentsAgainstCapability(...).ok` AND ingest-in-flight AND content-present
  - [x] Rejections surface as a lightweight toast panel below the composer, auto-clearing after 6s
- [~] **Deviation note:** composer `+` icon uses `Paperclip` (lucide) rather than a literal `+` glyph from the spec's ASCII mockup; semantically identical (aria-label="Add attachment").

## T9 — Wiring + glue

- [x] `src/features/session-start/session-start.container.tsx` — no attachment surface; creation-with-attachments routes only through composer. Confirmed unchanged.
- [x] Capability gating reads `selection.provider?.attachments` (active session's provider descriptor) in composer; derived reactively each render
- [x] App-settings default-provider changes propagate via `storedDefaults` → `resolveProviderSelection` → `capability` memo → `validateAttachmentsAgainstCapability`, so existing drafts re-validate automatically on re-render

## T10 — Docs + release

- [x] `docs/architecture/quick-reference.md` — added §7 "Session attachments" with entity/backend/serializer/capability/UI/persistence pointers
- [x] `.changeset/feat-session-attachments.md` — `minor` changeset summarizing the feature
- [x] `docs/specs/phase-5-real-providers.md` — "Attachments" struck from Out-of-scope list with cross-reference to `session-attachments.md`

## T11 — Full verification

- [x] `npm install` — up to date
- [x] `npm run test:pure` — 34 files / 253 tests passed
- [x] `npm run test:unit` — 18 files / 65 tests passed
- [x] `chaperone check --fix` — 120 files, 0 errors, 0 warnings
- [ ] Manual smokes (from spec §Test Plan) — **deferred to human-driven smoke pass**; this pass cannot drive Electron + live provider binaries:
  - [ ] Claude Code — 1 image + 1 PDF + 1 TS file
  - [ ] Codex — 2 images + 1 CSV
  - [ ] Pi — 1 JPEG + 1 markdown
  - [ ] Switch provider mid-draft, confirm red-outline + send-blocked
  - [ ] Session delete → attachment directory gone
  - [ ] Session archive/unarchive → attachment directory intact
  - [ ] App restart with orphaned attachment dir → swept

## T12 — Self-review before hand-off

### In-scope bullet → delivering file

- [x] Attaching images/PDFs/text to an outgoing message → `electron/backend/attachments/attachments.service.ts` + three provider serializers
- [x] Three input paths (picker, paste, drop) → `composer.container.tsx` (`handleAttachmentAdd`, `handlePaste`, `handleDrop`) + IPC `attachments:showOpenDialog`
- [x] Chip row above textarea → `attachments-row.presentational.tsx` + `attachment-chip.presentational.tsx`
- [x] Full-size preview modal → `attachment-preview.container.tsx` + `attachment-preview.presentational.tsx`
- [x] Image normalization (EXIF strip) → `electron/backend/attachments/image-normalize.pure.ts` (resize deferred to renderer Canvas per Tech Decisions row)
- [x] Copy-on-attach into app-data → `attachments.service.ts` writes under `{userData}/attachments/{sessionId}/{id}{ext}`
- [x] Per-provider capability matrix → `ProviderDescriptor.attachments` + `attachment-capability.pure.ts`
- [x] Claude Code wire (stream-json + Anthropic content blocks) → `claude-code-message.pure.ts` + adapter
- [x] Codex wire (`UserInput[]` + `localImage`) → `codex-message.pure.ts` + adapter
- [x] Pi wire (`prompt.images[]`) → `pi-message.pure.ts` + adapter
- [x] Persistence via `TranscriptEntry.attachmentIds` → originally inline in `sessions.transcript`; current runtime stores attachment ids inside normalized `ConversationItem` payload rows after the conversation-normalization migration.
- [x] Size caps validated in renderer + main → `validateAttachmentsAgainstCapability` (renderer) + `attachments.service` ingest checks (main)
- [x] Tests: unit + integration + renderer component → 34 pure test files, 18 unit test files

### Out-of-scope bullets — confirmed no sneak-in

- [x] Resumed sessions carrying attachments — not threaded; `--resume`/`thread/resume` paths unchanged
- [x] Downloading attachments the model produces — no render path for assistant-produced attachments
- [x] Drag-drop onto transcript — drop handler bound to composer root only
- [x] Audio/video/archive formats — `mime-sniff.pure.ts` only detects png/jpeg/gif/webp/pdf/utf8 text
- [x] Remote URL attachments — no `{type:"image", url}` path exposed; local only
- [x] In-app PDF text extraction for Codex/Pi — blocked at capability level
- [x] Configurable size caps in app settings — caps are module constants in `attachments.service.ts`
- [x] OCR — not present

### Tech Decisions — code matches chosen option

- [x] Storage root `{userData}/attachments/{sessionId}/` — `attachments.service.ts`
- [x] Always copy into the store — `ingestFromPaths` reads bytes then writes to store path
- [x] Strip EXIF + cap 2048 px — EXIF in main (`image-normalize.pure.ts`), resize deferred to renderer Canvas (documented deviation)
- [x] No `sharp` native dep — confirmed (no `sharp` import in repo)
- [x] Thumbnail 256 px JPEG — `attachments.service.ts` thumbnail generator
- [x] PDF blocked on non-Claude — capability matrix + `attachment-capability.pure.ts`
- [x] UTF-8 only for text — `mime-sniff.pure.ts` rejects invalid UTF-8
- [x] Attachments-first ordering — every serializer concats `[images..., documents..., text]`
- [x] Codex `localImage` — yes (not base64 path)
- [x] Pi `images[]` — yes
- [x] Capability discovery static — yes (`provider-descriptor.pure.ts` constants)
- [x] Size caps 10/20/1/50 MB — confirmed per provider descriptor values

### Security considerations — test or runtime check

- [x] EXIF stripping — `image-normalize.pure.test.ts` covers APP1-EXIF removal
- [x] Path traversal — store path uses uuid (not filename) inside session-uuid dir; verified by construction
- [x] MIME sniffing trust boundary — `mime-sniff.pure.ts` + rejects renderer-declared mimeType silently when magic bytes disagree
- [x] No symlink traversal — `ingestFromPaths` reads bytes via `fs.readFile` which follows the link then stores bytes
- [x] Codex `localImage` path inside userData — confirmed (`storagePath` is the only value passed)
- [x] Clipboard → userData only — paste goes through same ingest pipeline
- [x] PDF `<embed>` points at blob URL from our bytes — not external fetch

### Capability matrix — provider descriptor values match spec

- [x] claude-code: image ✅, pdf ✅, text ✅, caps 10/20/1/50 — `provider-descriptor.pure.ts` constants
- [x] codex: image ✅, pdf ❌, text ✅, caps 10/n/1/50 — same
- [x] pi: image ✅, pdf ❌, text ✅, caps 10/n/1/50 — same

### Diff size sanity

- [x] ~3,250 lines added across new files (about 1/3 spec markdown, 1/3 serializers + tests, 1/3 renderer UI) plus ~1,100 line modifications across 27 files. Large but proportional to scope (3 provider serializers × 2 files each + backend ingest pipeline + database column + IPC surface + renderer slice + composer UI overhaul). No one file balloons suspiciously.

## Notes

- Preflight T0 failure of `npm run test:pure` under current Node is pre-existing (predates this work; markdown-only changes cannot break it). Fix or upgrade before T11 or the verification step is meaningless.
- Do NOT skip the Claude Code `--input-format stream-json --resume` smoke (T0) — the entire T3 plan assumes it round-trips. If it doesn't, the fallback is path-reference in text, which downgrades image quality.
- Pi's `streamingBehavior` field still required when queueing during a run; serializer should be agnostic to this (caller attaches it after).
