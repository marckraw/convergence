# Session Attachments — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 5 (Claude Code + Codex providers), Pi Agent Provider spec
> Research: Claude Code 2.1.112 (`--input-format stream-json`), Codex 0.115.0 (`app-server` v2 protocol), Pi 0.65.2 (`--mode rpc`)
> Follow-up: `docs/specs/attachments-in-history.md` covers history rendering + the post-normalization regression that dropped `attachmentIds` at the provider→emitter boundary across all three adapters.

## Objective

Let users attach images, PDFs, and text files to the message they send to any provider session. Attachments are bound to a single outgoing message (not to the session), can be added via a `+` button next to the model selector, via clipboard paste into the composer, or via drag-and-drop onto the composer. Users can see a thumbnail for each attachment in the composer and open a larger preview before sending. Each provider receives attachments in the harness's native format when possible, and with an honest fallback or user-visible "not supported" state when the harness cannot accept a given kind.

## Scope

### In scope

- Attaching images (PNG, JPEG, GIF, WebP), PDFs, and text-like files (`.txt`, `.md`, `.csv`, `.json`, `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.h`, `.sh`, `.yml`, `.yaml`, `.toml`, `.xml`, `.html`, `.css`, `.sql`, `.log`, any UTF-8 text up to the size cap) to an outgoing message
- Three input paths on the composer: `+` button → native file picker, clipboard paste, drag-and-drop
- Attachment chips row rendered above the textarea with per-chip thumbnail, filename, kind icon, and remove control
- Full-size preview modal (images, PDF via `<embed>`, text via syntax-agnostic `<pre>`)
- Attachment normalization (EXIF strip, dimension cap) for images in the main process
- Deterministic copy-on-attach into an app-data attachment store keyed by session id
- Per-provider capability matrix surfaced to the UI so the composer can disable or warn based on the currently selected provider
- Serialization per harness:
  - Claude Code via `--input-format stream-json` with Anthropic Messages content blocks
  - Codex via `turn/start` v2 `input[]` with `localImage` entries for images
  - Pi via `prompt.images[]` and `steer.images[]` / `follow_up.images[]`
- Persistence: each `TranscriptEntry` of type `user` may reference a list of attachment ids; on session archive or deletion, attachments are cleaned up with the session
- Size caps enforced in the renderer before IPC, re-validated in main
- Tests: unit (pure serializers, capability matrix), main-process integration (ingest + cleanup), renderer component (composer chips + paste/drop)

### Out of scope

- Resumed sessions carrying forward prior attachments across `--resume` / `thread/resume` boundaries (providers' own session files already persist them where supported)
- Downloading attachments that the model produces back into the transcript
- Non-image drag-and-drop onto the transcript (drop is composer-only)
- Audio, video, archive formats
- Remote URL attachments (`{type:"image", url}`) — local files only in v1
- In-app PDF text extraction for Codex / Pi beyond a fixed fallback (see Tech Decisions)
- Configurable size caps in app settings (hardcoded in v1; revisit later if users complain)
- OCR for scanned PDFs

## Harness Capability Matrix

Verified empirically against installed binaries and upstream protocol schemas.

| Capability          | Claude Code 2.1.112                                         | Codex 0.115.0 (app-server v2)           | Pi 0.65.2 (`--mode rpc`)             |
| ------------------- | ----------------------------------------------------------- | --------------------------------------- | ------------------------------------ |
| Images              | ✅ base64 content block                                     | ✅ `localImage` (path) or `image` (url) | ✅ `images[]` base64 array           |
| PDFs                | ✅ native `document` content block                          | ❌ not in `UserInput` union             | ❌ not in RPC `prompt.images` schema |
| Text files          | ✅ inline as `text` content block                           | ✅ inline as `text`                     | ✅ inline as `message` text          |
| Declared modalities | n/a (transport-level)                                       | `InputModality = "text" \| "image"`     | `Model.input: ["text", "image"]`     |
| Input-format flag   | `--input-format stream-json` required for structured blocks | Always structured                       | Always structured                    |

Consequences:

- **PDFs are Claude Code-only in v1.** For Codex and Pi, the UI must prevent PDF attachment on those sessions (either disable the file kind, or show "PDFs require Claude Code" tooltip and refuse to attach).
- **Text files are always inlined** — same strategy across all three. Simpler, avoids path-permission surprises, and respects the harness's own context window because the bytes are already in the prompt.
- **Images use each harness's native format.** No re-encoding to a canonical blob except for normalization (see below).

## Attachment Model

### `Attachment` (entity)

Lives in a new slice `src/entities/attachment/`.

```ts
export type AttachmentKind = 'image' | 'pdf' | 'text'

export interface Attachment {
  id: string // uuid v4
  sessionId: string // owning session
  kind: AttachmentKind
  mimeType: string // e.g. 'image/png', 'application/pdf', 'text/plain'
  filename: string // original filename, sanitized
  sizeBytes: number // bytes on disk after normalization
  storagePath: string // absolute path under app-data attachments store
  thumbnailPath: string | null // 256px JPEG thumbnail for images; null for pdf/text
  textPreview: string | null // first 512 chars for text kind; null otherwise
  createdAt: string // ISO-8601
}
```

Rules:

- `id` is the canonical key. All IPC refers to attachments by id, never by path.
- `storagePath` is absolute under Electron `app.getPath('userData') + '/attachments/{sessionId}/{id}{ext}'`.
- `thumbnailPath` is `app.getPath('userData') + '/attachments/{sessionId}/{id}.thumb.jpg'` when present.
- `textPreview` is lossy, for UI chip hover only. Full bytes come from `storagePath`.

### Storage layout

```
{userData}/attachments/
  {sessionId}/
    {attachmentId}.png
    {attachmentId}.thumb.jpg
    {attachmentId}.pdf
    {attachmentId}.txt
```

Reasoning:

- Grouped per session → single-directory cleanup on session delete.
- Lives in `userData`, not the project copy workspace, because attachments must survive workspace rewrites and session archives.
- The `attachments/` root is created on first use. No boot-time provisioning.

### Database

Attachment metadata persists in a new SQLite table:

```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  text_preview TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attachments_session ON attachments(session_id);
```

The `transcript_entries` table gains a nullable `attachment_ids` column storing a JSON array of ids for `user`-kind entries. Alternative considered and rejected: a join table. Rejected because transcripts are append-only and attachments are always bound to one entry — a join table adds query cost with no gain.

### Cleanup

- Deleting a session deletes its attachment rows (FK cascade) and its `{userData}/attachments/{sessionId}/` directory.
- Archiving a session does NOT delete attachments; archive is reversible.
- Orphaned files (no row in `attachments`) are swept on app start by a directory walk that deletes any folder whose name is not a live session id. Implementation lives in `app-settings`-adjacent `attachments.service.ts`.

## Tech Decisions

| Decision                  | Choice                                                              | Rationale                                                                                                |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Storage root              | `app.getPath('userData')/attachments/{sessionId}/`                  | Survives workspace rewrites and archives; scoped cleanup per session                                     |
| Copy-on-attach            | Always copy into the store                                          | Source files may move, change, or be deleted; sessions must remain reproducible                          |
| Image normalization       | Strip EXIF, cap longest edge at 2048 px, re-encode to original type | Protects user privacy (GPS in EXIF), bounds payload size, and skips harness-side normalization surprises |
| Image normalizer          | `sharp` replaced by Canvas/`createImageBitmap` in renderer          | Avoids native dependency (per user memory on electron-rebuild). Renderer ships bytes to main for storage |
| Thumbnail size            | 256 px longest edge JPEG quality 70                                 | Small enough for chip + preview modal scrub; large enough to recognize content                           |
| PDF fidelity (non-Claude) | Blocked in UI                                                       | No loss-free path for Codex / Pi; explicit "PDFs require Claude Code" messaging is honest                |
| Text file encoding        | Require valid UTF-8; reject otherwise                               | Guarantees safe JSON embedding in every harness. Binary files dressed up as `.txt` rejected at ingest    |
| Ordering in prompt        | Attachments first, then user text                                   | Both Anthropic and OpenAI guidance; improves model grounding                                             |
| Claude Code prompt wire   | Migrate adapter to `--input-format stream-json`                     | Only clean path for images/documents. Out-scope paths (base64 in prompt text) are lossy hacks            |
| Codex image wire          | Prefer `localImage` (path) over base64 `image`                      | Zero-copy, no re-encoding at IPC boundary, faster for large images                                       |
| Pi image wire             | `prompt.images[]` per rpc.md                                        | Pi's documented native format. Path-reference via Read tool is fallback only                             |
| Capability discovery      | Static per provider id in provider descriptor                       | Matches current `ProviderDescriptor` pattern; no need for runtime probing in v1                          |
| Size caps                 | 10 MB image, 20 MB PDF, 1 MB text, 50 MB per-message total          | Under most LLM API per-image limits; protects against accidental large drops                             |
| Clipboard image format    | PNG (browser `ClipboardEvent.clipboardData.items['image/png']`)     | Broadly supported. JPEG clipboard also accepted if present                                               |
| Drop target               | Composer root only                                                  | Avoids hijacking drops on the transcript / sidebar                                                       |

## IPC and Type Contract Changes

### `TranscriptEntry`

```ts
export type TranscriptEntry =
  | {
      type: 'user'
      text: string
      timestamp: string
      attachmentIds?: string[]     // NEW — present only when attachments exist
    }
  | /* other variants unchanged */
```

Backwards compatibility: `attachmentIds` is optional, omitted for entries without attachments. Persisted entries without the column read as `undefined`.

### `SessionStartConfig` / `SessionHandle.sendMessage`

```ts
export interface SessionStartConfig {
  sessionId: string
  workingDirectory: string
  initialMessage: string
  initialAttachments?: Attachment[] // NEW
  model: string | null
  effort: ReasoningEffort | null
  continuationToken: string | null
}

export interface SessionHandle {
  // ...
  sendMessage: (text: string, attachments?: Attachment[]) => void // NEW param
}
```

`Attachment[]` (not ids) is passed to the adapter so the adapter does not need database access. The session service resolves ids to records before calling into the provider.

### `ProviderDescriptor`

```ts
export interface ProviderAttachmentCapability {
  supportsImage: boolean
  supportsPdf: boolean
  supportsText: boolean
  maxImageBytes: number
  maxPdfBytes: number
  maxTextBytes: number
  maxTotalBytes: number
}

export interface ProviderDescriptor {
  // ...existing fields
  attachments: ProviderAttachmentCapability // NEW
}
```

Values (v1):

| Provider    | image | pdf | text | maxImage | maxPdf | maxText | maxTotal |
| ----------- | ----- | --- | ---- | -------- | ------ | ------- | -------- |
| claude-code | ✅    | ✅  | ✅   | 10 MB    | 20 MB  | 1 MB    | 50 MB    |
| codex       | ✅    | ❌  | ✅   | 10 MB    | n/a    | 1 MB    | 50 MB    |
| pi          | ✅    | ❌  | ✅   | 10 MB    | n/a    | 1 MB    | 50 MB    |

### New IPC handlers

| Channel                       | Direction       | Payload                                                                  | Returns              |
| ----------------------------- | --------------- | ------------------------------------------------------------------------ | -------------------- |
| `attachments:ingestFiles`     | Renderer → Main | `{ sessionId: string, files: { name, bytes: Uint8Array, mimeType? }[] }` | `Attachment[]`       |
| `attachments:ingestFromPaths` | Renderer → Main | `{ sessionId: string, paths: string[] }`                                 | `Attachment[]`       |
| `attachments:getForSession`   | Renderer → Main | `sessionId: string`                                                      | `Attachment[]`       |
| `attachments:getById`         | Renderer → Main | `id: string`                                                             | `Attachment \| null` |
| `attachments:readBytes`       | Renderer → Main | `id: string`                                                             | `Uint8Array`         |
| `attachments:delete`          | Renderer → Main | `id: string`                                                             | `void`               |

Notes:

- Ingest paths: the file picker path uses Electron's `dialog.showOpenDialog` and yields absolute paths, so `ingestFromPaths` is cheapest. Clipboard/drag-drop arrive as in-memory bytes → `ingestFiles`.
- `readBytes` is the renderer's path to render PDF / preview images not already covered by a thumbnail.

### Updated session IPC

| Channel               | Old signature           | New signature                                         |
| --------------------- | ----------------------- | ----------------------------------------------------- |
| `session:start`       | `(id, message: string)` | `(id, { message: string, attachmentIds?: string[] })` |
| `session:sendMessage` | `(id, text: string)`    | `(id, { text: string, attachmentIds?: string[] })`    |

IPC payloads switch to an object so future additions (e.g. markdown flag) are non-breaking.

## Provider Serialization

### Claude Code adapter

**Breaking change to adapter:** switch from text stdin to `--input-format stream-json` stdin.

Spawn flags change from:

```
claude -p --output-format stream-json --verbose --include-partial-messages
        --dangerously-skip-permissions
```

to:

```
claude -p --input-format stream-json --output-format stream-json --verbose
        --include-partial-messages --dangerously-skip-permissions
```

Stdin becomes a long-lived NDJSON stream. Each user message is one line:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "image",
        "source": { "type": "base64", "media_type": "image/png", "data": "..." }
      },
      {
        "type": "document",
        "source": {
          "type": "base64",
          "media_type": "application/pdf",
          "data": "..."
        }
      },
      {
        "type": "text",
        "text": "<file path=\"src/foo.ts\">\nexport const x = 1\n</file>\nPlease review."
      }
    ]
  }
}
```

Serializer rules:

- Order: all image blocks → all document blocks → one text block that contains inlined text attachments followed by the user's typed message
- Images and PDFs use `source.type = "base64"` and read bytes from `storagePath`
- Text attachments inline as `<file path="{filename}">\n{contents}\n</file>` separated by blank lines, concatenated before the user's typed text

Stdin handling also changes: today the adapter writes once and closes stdin. For multi-turn we keep stdin open for the lifetime of the session and write one line per `sendMessage`. Turn completion remains driven by `result` events on stdout.

### Codex adapter

`turn/start.input[]` currently sends a single text entry:

```json
[{ "type": "text", "text": "<user text>", "text_elements": [] }]
```

After:

```json
[
  { "type": "localImage", "path": "/abs/path/to/img.png" },
  { "type": "localImage", "path": "/abs/path/to/img2.jpg" },
  {
    "type": "text",
    "text": "<file path=\"src/foo.ts\">\nexport const x = 1\n</file>\n\n<user typed text>",
    "text_elements": []
  }
]
```

Rules:

- Images → one `localImage` per attachment with `storagePath`
- Text attachments inline into the single text entry, same `<file>`-tag convention as Claude
- PDFs → blocked upstream in the UI; if one arrives here (programming error), the adapter throws and the session service emits a `system` transcript entry "PDF attachments are not supported for Codex sessions"

### Pi adapter

Current send:

```json
{ "type": "prompt", "message": "<text>", "streamingBehavior": "steer" }
```

After:

```json
{
  "type": "prompt",
  "message": "<file path=\"src/foo.ts\">...</file>\n\n<user text>",
  "images": [{ "type": "image", "data": "<base64>", "mimeType": "image/png" }],
  "streamingBehavior": "steer"
}
```

Rules:

- Images → `images[]` with base64 of `storagePath` contents + `mimeType`
- Text → inline in `message`, same `<file>` convention
- PDFs → blocked upstream; defensive error path same as Codex
- Same `streamingBehavior: "steer"` logic as today; the `images` field is included identically on `steer` and `follow_up` commands if the adapter ever routes there

## UI

### Composer layout

Composer gains an attachments chip row above the textarea:

```
┌─────────────────────────────────────────┐
│ [img.png ×]  [doc.pdf ×]  [notes.md ×]   │  ← chip row (hidden when empty)
│─────────────────────────────────────────│
│ < textarea with placeholder >           │
│                                          │
│─────────────────────────────────────────│
│ [+] model ▾  effort ▾         [Send]     │
└─────────────────────────────────────────┘
```

- `+` button sits in the left group next to model and effort selectors. Click → file picker filtered by provider capability.
- Chip row is only rendered when attachments exist.
- Each chip: thumbnail (image) or kind icon (pdf/text), filename truncated to ~20 chars middle-ellipsized, `×` to remove.
- Clicking a chip body opens the preview modal.

### Ingest flows

All three enter via the same main-process ingest pipeline:

1. **File picker** (`+` button) → `dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })` → `attachments:ingestFromPaths`.
2. **Paste** → textarea `onPaste` listener reads `event.clipboardData.items`, collects image/file items, converts to `Uint8Array`, calls `attachments:ingestFiles`. Plain-text paste falls through to the textarea unchanged.
3. **Drag-drop** → composer root `onDragOver` + `onDrop` extract `event.dataTransfer.files`. Each file is read via `file.arrayBuffer()` and passed to `attachments:ingestFiles`. Visual affordance: composer root gets a dashed outline while a drag is hovering.

### Preview modal

- Images: `<img>` with `max-height: 80vh`, `object-fit: contain`, background `#000`. Zoom is out of scope.
- PDFs: `<embed type="application/pdf">`. Falls back to "PDF preview unavailable; open externally" button that shells out to the OS via `shell.openPath`.
- Text: `<pre>` with mono font, no syntax highlighting in v1. Capped at 1 MB anyway.

### Capability gating

- Composer reads `selectedProvider.attachments` on every render.
- File picker `filters` narrows to supported kinds per provider.
- On paste/drop, unsupported kinds are silently dropped with a toast ("PDFs require Claude Code — switch providers to attach").
- If the user switches provider while attachments incompatible with the new provider are present (e.g. has a PDF attached, switches to Codex), those attachments get a red outline and a hover message ("Not supported by Codex. Remove or switch provider."). Send is blocked until resolved.

### Accessibility

- `+` button has `aria-label="Add attachment"`.
- Each chip is a `<button>` with `aria-label="Preview {filename}. Press to open preview or Delete to remove."`.
- Preview modal traps focus, returns focus to the triggering chip on close, `Esc` dismisses.
- Drag-drop outline is paired with a visually hidden announcement via `aria-live`.

## Size Limits and Validation

Validation happens **twice**: in the renderer before IPC (for fast feedback) and in main on ingest (trust boundary).

Per-attachment rejections:

- `image` > 10 MB: "Image too large (cap 10 MB)."
- `pdf` > 20 MB: "PDF too large (cap 20 MB)."
- `text` > 1 MB: "Text file too large (cap 1 MB)."
- MIME type not in the allow-list.
- Text file that is not valid UTF-8.
- File with no readable extension and no recognizable MIME-sniff signature.

Per-message rejection:

- Sum of all attached `sizeBytes` > 50 MB: "Message attachments exceed 50 MB total."

All rejections surface as a toast in the composer and leave the composer state unchanged so the user can remove or retry.

## Error Handling

| Failure mode                                                          | Behavior                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Ingest copy fails (disk full, permissions)                            | Toast with system error message. No partial state — the row is never inserted            |
| Normalization fails (corrupt image)                                   | Fall back to storing original bytes without normalization; warn in a debug log only      |
| Thumbnail generation fails                                            | Store attachment without thumbnail; chip shows kind icon instead                         |
| Provider-level serialization error (shouldn't happen after UI gating) | Emit `system` transcript entry "Failed to send attachments: {reason}" and abort the turn |
| Claude Code adapter receives >1 text bytes but stdin write fails      | Propagate to session `failed` status with error reason                                   |
| Orphan sweep finds a dir for a deleted session                        | `rm -rf` the directory on app start, log count                                           |

## Persistence

- On outgoing user message with attachments: insert each `Attachment` row, then the `user` transcript entry referencing ids.
- On session archive/unarchive: no file moves. Attachments remain in the per-session directory.
- On session delete: DB cascade removes rows; a main-side hook deletes the directory.
- On app start: orphan sweep (see Cleanup).

## Security Considerations

- **EXIF stripping** removes embedded GPS coordinates and camera serial numbers before the image ever leaves the main process or is persisted.
- **Path traversal**: filenames are sanitized to `[a-zA-Z0-9._-]` before use anywhere; the storage path uses the attachment uuid not the filename.
- **MIME sniffing**: rely on the first 512 bytes for magic-number detection rather than trusting the renderer's declared `mimeType`. A PNG attached as `.txt` is detected and rejected.
- **No symlink traversal**: `ingestFromPaths` follows the file but stores the resolved bytes. The symlink target path itself is never stored.
- **Codex `localImage` path** points inside our own `userData/attachments/` tree. Even a malicious file name cannot escape because we control the directory name (session uuid) and file name (attachment uuid).
- **Clipboard paste** never triggers filesystem reads outside `userData`.
- **PDFs**: we embed `<embed>` pointing at an Electron `file://` URL inside `userData`. No external fetches.

## Deliverables

### Backend — shared

| File                                                        | Purpose                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `electron/backend/attachments/attachments.types.ts`         | `Attachment`, `AttachmentKind`, capability types                                                        |
| `electron/backend/attachments/attachments.service.ts`       | Ingest, read, delete, orphan sweep; DB + filesystem orchestration                                       |
| `electron/backend/attachments/attachments.service.test.ts`  | Ingest golden paths, size rejections, UTF-8 validation, orphan sweep                                    |
| `electron/backend/attachments/image-normalize.pure.ts`      | Pure byte-in / byte-out EXIF strip + resize stub (wraps Node `canvas` API or a tiny dep if unavoidable) |
| `electron/backend/attachments/image-normalize.pure.test.ts` | Fixture-based tests                                                                                     |
| `electron/backend/attachments/mime-sniff.pure.ts`           | First-512-bytes MIME detection for image/png, jpeg, gif, webp, pdf, text                                |
| `electron/backend/attachments/mime-sniff.pure.test.ts`      | Fixture-based tests                                                                                     |
| `electron/backend/database/database.ts`                     | Updated: add `attachments` table + `attachment_ids` column on `transcript_entries`                      |

### Backend — provider serializers

| File                                                                     | Purpose                                                                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/backend/provider/claude-code/claude-code-message.pure.ts`      | Build Anthropic content-blocks JSON line from `{text, attachments}`                                                                       |
| `electron/backend/provider/claude-code/claude-code-message.pure.test.ts` | Golden JSON tests for each combination                                                                                                    |
| `electron/backend/provider/claude-code/claude-code-provider.ts`          | Updated: switch to `--input-format stream-json`, long-lived stdin                                                                         |
| `electron/backend/provider/codex/codex-message.pure.ts`                  | Build `UserInput[]` array from `{text, attachments}`                                                                                      |
| `electron/backend/provider/codex/codex-message.pure.test.ts`             | Golden tests                                                                                                                              |
| `electron/backend/provider/codex/codex-provider.ts`                      | Updated: pass `input[]` including `localImage` entries                                                                                    |
| `electron/backend/provider/pi/pi-message.pure.ts`                        | Build `{message, images?}` from `{text, attachments}`                                                                                     |
| `electron/backend/provider/pi/pi-message.pure.test.ts`                   | Golden tests                                                                                                                              |
| `electron/backend/provider/pi/pi-provider.ts`                            | Updated: include `images` on prompt / steer / follow_up                                                                                   |
| `electron/backend/provider/provider.types.ts`                            | Updated: `SessionStartConfig.initialAttachments`, `SessionHandle.sendMessage` signature, `ProviderAttachmentCapability`, descriptor field |

### Backend — session + IPC

| File                                          | Purpose                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `electron/backend/session/session.service.ts` | Updated: accept attachment ids on start/sendMessage; resolve + thread through |
| `electron/main/ipc.ts`                        | Updated: session handlers; new `attachments:*` handlers                       |
| `electron/preload/index.ts`                   | Updated: expose `attachments` API                                             |

### Renderer

| File                                                            | Purpose                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/entities/attachment/index.ts`                              | Slice public API                                                     |
| `src/entities/attachment/attachment.types.ts`                   | Mirror of backend `Attachment` plus UI-only fields                   |
| `src/entities/attachment/attachment.api.ts`                     | Preload wrapper for `attachments:*` channels                         |
| `src/entities/attachment/attachment.model.ts`                   | Zustand store: draft attachments per composer + resolved metadata    |
| `src/entities/attachment/attachment.model.test.ts`              | Store unit tests                                                     |
| `src/features/composer/composer.container.tsx`                  | Updated: wire `+` button, paste, drop, chip row, capability gating   |
| `src/features/composer/attachments-row.presentational.tsx`      | Render chip row                                                      |
| `src/features/composer/attachment-chip.presentational.tsx`      | Single chip with thumbnail + remove                                  |
| `src/features/composer/attachment-chip.presentational.test.tsx` | Chip render + remove interaction                                     |
| `src/features/composer/attachment-preview.container.tsx`        | Preview modal state + byte fetch                                     |
| `src/features/composer/attachment-preview.presentational.tsx`   | Modal shell + image / pdf / text renderers                           |
| `src/features/composer/attachment-capability.pure.ts`           | Pure validator: `{attachments, providerCapability} → { ok, errors }` |
| `src/features/composer/attachment-capability.pure.test.ts`      | Matrix tests                                                         |
| `src/shared/types/electron-api.d.ts`                            | Updated: attachments API surface                                     |

### Docs

| File                                   | Purpose                                |
| -------------------------------------- | -------------------------------------- |
| `docs/specs/session-attachments.md`    | This spec                              |
| `docs/architecture/quick-reference.md` | Updated: attachments entry in glossary |

## Test Plan

### Unit (pure)

- `image-normalize.pure.test.ts` — EXIF strip removes GPS, dimension cap preserves aspect ratio, re-encode preserves type
- `mime-sniff.pure.test.ts` — PNG/JPEG/GIF/WebP/PDF magic numbers, UTF-8 BOM handling, PNG disguised as .txt rejected
- `claude-code-message.pure.test.ts` — images-first ordering, document blocks, inlined text files, mixed types, attachments-only (no user text)
- `codex-message.pure.test.ts` — same matrix but producing `UserInput[]`
- `pi-message.pure.test.ts` — same matrix but producing `{message, images?}`
- `attachment-capability.pure.test.ts` — capability gate returns correct errors per provider × kind × size

### Unit (services)

- `attachments.service.test.ts` — ingest from bytes, ingest from paths, rejects oversize, rejects bad UTF-8, thumbnail generated for images, orphan sweep deletes right dirs

### Integration (main process)

- Ingest → get → readBytes → delete round trip
- Session delete cascades attachment rows AND directory
- Archive keeps attachments intact

### Renderer

- Composer chip row renders attachments, remove button removes one
- Paste of a PNG creates an attachment
- Drop of a PDF on Codex session is rejected with toast
- Switching provider marks incompatible attachments and blocks send
- Preview modal renders image/pdf/text correctly

### Manual smoke

- Start Claude Code session, attach 1 image + 1 PDF + 1 TS file, send "review this", verify agent references them
- Start Codex session, attach 2 images + 1 CSV, send "what do you see", verify
- Start Pi session, attach 1 JPEG + 1 markdown file, send, verify

## Rollout

- Hidden behind no feature flag — ship as a single merge once green.
- Changeset: `feat: attachments support for sessions (images, pdfs, text files)`.
- The Claude Code adapter stdin-format migration is the riskiest piece; ship it in a separate commit behind the same PR so bisect is clean.

## Open Questions

1. **Claude Code `--resume` interaction.** Today we resume with `--resume {id}`. Does `--input-format stream-json --resume {id}` behave identically? Need a live smoke test once implementation starts.
2. **Codex `image` (URL) entry** is documented but v1 accepts only local files — fine to defer remote until a request exists.
3. **Max image dimension 2048 px** is a starting point. If models disagree on best-fit size, revisit.
