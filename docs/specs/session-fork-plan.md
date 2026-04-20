# Session Fork — Implementation Plan

Companion to `docs/specs/session-fork.md`. Work is sliced into five phases,
each independently shippable and verified before the next begins.

## Phase F1 — Backend foundation: types, pure, service scaffold

Goal: all non-extraction primitives exist and are fully tested. No UI yet.
No provider calls yet. This phase lands the data model and the pure logic.

- [x] Migration: add `parent_session_id` and `fork_strategy` columns to
      `sessions` table. Migration file under
      `electron/backend/database/migrations/`.
- [x] Extend `SessionRow` in `electron/backend/database/database.types.ts`
      and `Session` in `electron/backend/session/session.types.ts` with
      `parentSessionId`, `forkStrategy`. Update `sessionFromRow`.
- [x] Extend renderer `Session` in `src/entities/session/session.types.ts`
      with the same two fields.
- [x] Create `electron/backend/session/fork/session-fork.types.ts`:
      `ForkStrategy`, `WorkspaceMode`, `ForkSummary`,
      `ForkFullInput`, `ForkSummaryInput`.
- [x] Create `electron/backend/session/fork/session-fork.pure.ts`:
  - [x] `serializeTranscript(entries: TranscriptEntry[]): string`
  - [x] `buildExtractionPrompt(serializedTranscript: string): string`
  - [x] `parseAndValidateSummary(text: string): ForkSummary | ValidationError`
  - [x] `extractArtifactsByRegex(serializedTranscript: string): ArtifactBuckets`
  - [x] `mergeArtifacts(llm: ArtifactBuckets, regex: ArtifactBuckets): ArtifactBuckets`
  - [x] `renderSeedMarkdown(summary: ForkSummary, parentName: string, additionalInstruction: string | null): string`
- [x] Pure tests covering all branches in `session-fork.pure.test.ts`.

Verification: `npm run test:pure`, `npm run typecheck`, `chaperone check --fix`
all pass. No runtime wiring yet.

## Phase F2 — App-settings extraction model

Goal: extraction model is user-configurable per provider, with sane default.

- [x] Extend `AppSettings` in
      `electron/backend/app-settings/app-settings.types.ts` with
      `extractionModelByProvider: Record<string, string>`.
- [x] Extend `AppSettingsInput` to accept optional
      `extractionModelByProvider`.
- [x] Extend `AppSettingsService` with `resolveExtractionModel(providerId)`.
      Default when unset: provider's `defaultModelId` (not `fastModelId`).
- [x] Service-layer tests mirroring `resolveNamingModel` tests.
- [x] Renderer entity: extend `AppSettings` type in
      `src/entities/app-settings/app-settings.types.ts` + API surface.
- [x] Settings dialog: add new section "Summary extraction model" with
      per-provider model selector. Mirrors
      `naming-model-defaults.presentational.tsx`. New file
      `extraction-model-defaults.presentational.tsx`.
- [x] Container tests for the new section.

Verification: all four gates + settings dialog renders the new section,
changing the selection persists across app restart.

## Phase F3 — Backend fork service + IPC

Goal: backend can execute forks end-to-end via IPC. Still no renderer UI.

- [x] Create `electron/backend/session/fork/session-fork.service.ts`:
  - [x] `SessionForkService` class constructor takes
        `{ sessions, providers, appSettings, workspaces }`.
  - [x] `previewSummary(parentId)` — loads parent, calls `provider.oneShot`,
        parses and validates, merges regex artifacts, returns `ForkSummary`.
        One-retry on invalid JSON.
  - [x] `forkFull(input)` — serializes parent transcript, resolves workspace
        (reuse or create), creates child session via `SessionService`,
        starts it with serialized seed.
  - [x] `forkSummary(input)` — resolves workspace, creates child session,
        starts it with the supplied (possibly user-edited) seed markdown
        verbatim.
- [x] Wire `SessionForkService` into `electron/main` bootstrap.
- [x] IPC handlers in `electron/backend/session/session.ipc.ts` (or a new
      `session-fork.ipc.ts` if preferred for separation):
      `session:fork:previewSummary`, `session:fork:full`, `session:fork:summary`.
- [x] Preload expose these handlers in `electron/preload/index.ts`.
- [x] Service-layer tests with mocked provider, session service, workspace
      service. Cover: happy path full, happy path summary, extraction
      retry succeeds, extraction retry fails, workspace reuse, workspace
      fork, malformed LLM output handling.

Verification: all four gates pass. IPC can be exercised manually from
devtools console (`window.convergence.session.fork.previewSummary(...)`)
end-to-end against a real running session.

## Phase F4 — Renderer plumbing: entity + store actions

Goal: renderer can invoke fork operations through the store. No UI yet.

- [x] Create `src/entities/session/session-fork.api.ts` with preload-exposed
      wrappers for the three IPC handlers.
- [x] Re-export from `src/entities/session/index.ts`.
- [x] Extend session store (`session.model.ts`) with three actions:
      `previewFork`, `forkFull`, `forkSummary`. Each delegates to the api
      and returns the resolved value; errors surface as thrown promises.
- [x] Store tests covering the three new actions.

Verification: all four gates pass. Store actions round-trip against the
IPC layer in a smoke test.

## Phase F5 — Fork dialog feature + entry points

Goal: user-facing flow complete. Fork is discoverable, usable, and correct.

- [x] Create `src/features/session-fork/`:
  - [x] `session-fork.types.ts` — local dialog state types.
  - [x] `session-fork.container.tsx` — orchestrates: reads parent session,
        manages strategy state, runs `previewFork` when strategy is
        `summary`, holds editable seed markdown buffer, dispatches
        `forkFull` or `forkSummary` on confirm.
  - [x] `session-fork.presentational.tsx` — dialog UI: name field,
        strategy radio (with disabled-state for too-short parents),
        provider/model/effort pickers (reusing
        `session-start-select.presentational.tsx` or shared pickers if
        possible), workspace-mode toggle, preview/edit textarea, error
        state with retry and full-fallback buttons, confirm and cancel.
  - [x] `index.ts` public API.
  - [x] Container test covering: strategy switch clears preview,
        successful extraction populates editable preview, extraction
        error surfaces retry path, full-strategy confirm bypasses
        extraction, workspace-fork toggle round-trips, cross-provider
        pick works.
- [x] Register dialog with `src/entities/dialog/` (or equivalent
      shared-dialog registry used by command-center dialogs).
- [x] Session header widget: add "Fork session…" menu item to existing
      kebab. Opens `session-fork` dialog with `{ parentSessionId }`.
- [x] Session header widget: render "Forked from: {parentName}" chip
      when `session.parentSessionId` is non-null. Click navigates to parent
      via existing cross-project session-switch intent
      (`switchToSession` in command-center intents).
- [x] Command Center: add intent `fork-current-session` in
      `src/features/command-center/intents.ts`. Listed when a session is
      focused. Dispatches the dialog with the current session id.
- [x] Size warning: if `full` strategy and serialized seed exceeds 80% of
      child provider's advertised context window, show warning with
      percentage and "Switch to summary" shortcut button.

Verification: all four gates pass. Manual QA checklist from the spec's
"Testing strategy" section executes cleanly. Changeset entry written:
`feat(session-fork): add session fork with full and summary strategies`.

## Phase F6 — Changeset, docs, cleanup

- [x] Add changeset under `.changeset/` describing the feature.
- [x] Update `README.md` or user-facing docs if they list top-level
      features.
- [x] Tick off boxes in this plan file.
- [x] Run the full verification suite one more time before opening PR.

## Dependency ordering

F1 must land before F3 (service depends on pure helpers and types).
F2 must land before F3 (service uses `resolveExtractionModel`).
F3 must land before F4 (renderer IPC wrappers need real handlers).
F4 must land before F5 (dialog uses store actions).
F6 is a finalizer.

F1 and F2 are independent and can be worked in parallel if two agents are
available.

## Out of scope (explicitly deferred to future specs)

See "Deferred / future work" in `docs/specs/session-fork.md`. Do not
introduce branch-point selection, merge-back, sidebar tree UI, or
cross-project fork in this feature; each of those deserves its own
spec and planning pass.
