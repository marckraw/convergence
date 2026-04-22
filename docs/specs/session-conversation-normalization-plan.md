# Session + Conversation Normalization — Implementation Plan

Companion plan for
`docs/specs/session-conversation-normalization.md`. The normalization spec is
the source of truth for the target model. This document only defines rollout
order, checkpoints, and deletion rules so the refactor can land in phased
cutovers rather than one giant jump.

All verification in this repo must run on the Node version declared in
`.nvmrc`.

## Overview

Ship the normalization in four product phases plus one bootstrap phase:

1. `Phase 0` — verification bootstrap
2. `Phase 1` — foundation and persistence
3. `Phase 2` — backend runtime cutover
4. `Phase 3` — renderer cutover
5. `Phase 4` — cleanup and hard delete of the old live path

The key architectural rule for the whole series:

- phase the implementation
- do **not** phase the truth

That means:

- one canonical target model
- one temporary migration path
- no long-lived dual runtime support

## Locked decisions

These are fixed by the source-of-truth spec and should not be reopened in the
implementation plan.

- `SessionSummary` becomes the default session shape for list/status surfaces.
- `ConversationItem` becomes the canonical unit in the transcript.
- provider adapters emit normalized `SessionDelta` values, not
  `TranscriptEntry[]` plus side-channel callbacks
- `sessions.transcript` is a legacy upgrade input only and should not remain in
  the live schema after cleanup
- the renderer must stop hydrating full conversation payloads in global session
  queries
- streaming text patches one item, not one row per delta

## Dependency graph

```text
Phase 0 bootstrap
  ↓
Phase 1 foundation
  ↓
Phase 2 backend runtime cutover
  ↓
Phase 3 renderer cutover
  ↓
Phase 4 cleanup
```

No later phase should begin until the prior checkpoint is green.

## Phase 0 — Verification Bootstrap

Goal: make repo verification reliable before the runtime refactor starts.

This is the gating phase because the last verification attempt failed before
tests actually ran: `.nvmrc` wants Node `24.14.1`, while the shell was on
`v20.11.1`.

### Acceptance criteria

- [ ] Repo instructions explicitly say agents must use `.nvmrc` Node before
      running verification.
- [ ] The local verification flow is documented and reproducible with the
      installed version manager, e.g.
      `nvm use && npm install && npm run test:pure && npm run test:unit && chaperone check --fix`
      or
      `fnm exec --using "$(cat .nvmrc)" -- npm run test:pure`.
- [ ] `npm run test:pure` starts successfully under the `.nvmrc` Node version.
- [ ] `npm run test:unit` starts successfully under the `.nvmrc` Node version.
- [ ] Any remaining Vitest/tooling failures are real test failures, not
      startup/runtime mismatches.

### Files likely touched

- `AGENTS.md`
- possibly `package.json`, Vitest config, or repo bootstrap docs if the Node 24
  switch surfaces new toolchain issues

### Exit rule

Do not start the normalization refactor while verification is still known to be
running on the wrong Node runtime.

## Checkpoint A — Verification Clean

- [ ] `.nvmrc` Node is the default runtime for agent verification
- [ ] `npm install` works
- [ ] `npm run test:pure` runs actual tests
- [ ] `npm run test:unit` runs actual tests
- [ ] `chaperone check --fix` passes or reports only pre-existing warnings

---

## Phase 1 — Foundation and Persistence

Goal: land the new types, persistence substrate, and migration path without
changing the active renderer yet.

This phase creates the new world but does not force the UI onto it yet.

### Scope

- normalized types for `SessionSummary`, `ConversationItem`, and `SessionDelta`
- database schema for conversation items
- migration from `sessions.transcript`
- backend read APIs for session summary vs conversation detail
- no provider contract cutover yet
- no renderer transcript cutover yet

### Acceptance criteria

- [ ] New backend types introduced for:
  - [ ] `SessionSummary`
  - [ ] `ConversationItem`
  - [ ] `SessionDelta`
- [ ] `session_conversation_items` table added with sequence ordering and
      session foreign key.
- [ ] `sessions` gains the minimal summary fields required by the new model:
  - [ ] `last_sequence`
  - [ ] `conversation_version`
- [ ] One-time migration converts existing `sessions.transcript` data into
      normalized conversation items.
- [ ] Existing persisted sessions remain readable after migration.
- [ ] New backend read surface exists:
  - [ ] `getAll()` and `getByProjectId()` return summary rows only
  - [ ] `getConversation(sessionId)` returns normalized items
- [ ] Unit tests cover:
  - [ ] row hydration for summary rows
  - [ ] conversation-item hydration
  - [ ] transcript-to-item migration from old persisted sessions
  - [ ] sequence assignment rules

### Suggested files

- `electron/backend/session/session.types.ts`
- `electron/backend/session/session.service.ts`
- `electron/backend/database/database.ts`
- `electron/backend/database/database.types.ts`
- new `electron/backend/session/conversation-item.types.ts`
- new `electron/backend/session/conversation-item.pure.ts`
- new migration-oriented tests

### Important constraint

At the end of Phase 1, the app is allowed to still render the old transcript
shape, but the new persistence model must already exist and be validated.

## Checkpoint B — Foundation Live

- [ ] Database schema and migration are in place
- [ ] Existing sessions survive migration
- [ ] Summary/detail reads are possible
- [ ] No provider has been forced onto the new contract yet

---

## Phase 2 — Backend Runtime Cutover

Goal: move the live runtime boundary from old transcript entries to normalized
session deltas.

This is the real architectural cutover.

### Scope

- provider contract changes
- session service reducer/writer changes
- live persistence into normalized conversation items
- split summary/item IPC
- old transcript append path becomes compatibility-only or dead

### Acceptance criteria

- [ ] Provider adapters no longer emit `TranscriptEntry` as their canonical
      app-facing output.
- [ ] Provider adapters emit normalized `SessionDelta` values.
- [ ] `SessionService` reduces `SessionDelta` and persists:
  - [ ] summary field patches to `sessions`
  - [ ] item add/patch operations to `session_conversation_items`
- [ ] Streaming assistant text updates an existing item rather than appending a
      row per chunk.
- [ ] Split IPC exists:
  - [ ] `session:summaryUpdated`
  - [ ] `session:conversationPatched`
- [ ] Claude Code adapter is cut over.
- [ ] Codex adapter is cut over.
- [ ] Pi adapter is cut over.
- [ ] Continuation token, attention, activity, and context-window behavior still
      work correctly after the contract change.
- [ ] Unit tests cover provider-to-delta mapping and reducer behavior.

### Suggested files

- `electron/backend/provider/provider.types.ts`
- `electron/backend/provider/claude-code/claude-code-provider.ts`
- `electron/backend/provider/codex/codex-provider.ts`
- `electron/backend/provider/pi/pi-provider.ts`
- `electron/backend/session/session.service.ts`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`

### Deletion rule

Once this phase lands:

- do not add new runtime logic to the old `TranscriptEntry` path
- any remaining old transcript code exists only as temporary adapter glue for
  the renderer cutover

## Checkpoint C — Backend Canonical Boundary Moved

- [ ] Providers all write through normalized deltas
- [ ] Session service persists normalized items
- [ ] Old transcript append logic is no longer the live runtime path

---

## Phase 3 — Renderer Cutover

Goal: switch the UI and renderer stores to summary/detail semantics and render
normalized conversation items directly.

### Scope

- session store split
- conversation loading for active session only
- transcript UI consumes normalized items
- global surfaces consume session summaries only

### Acceptance criteria

- [ ] Renderer session entity is split into:
  - [ ] session summaries for lists/global surfaces
  - [ ] conversation detail for the active session
- [ ] Session list queries do not store embedded transcript data.
- [ ] Active session view fetches and subscribes to normalized conversation
      items.
- [ ] Transcript renderer consumes `ConversationItem`, not `TranscriptEntry`.
- [ ] Approval/input actions still work from normalized items.
- [ ] Sidebar, command center, recents, and needs-you surfaces all work from
      `SessionSummary` only.
- [ ] Fork serialization reads normalized conversation items rather than the old
      transcript union.
- [ ] Container/unit tests cover the new store split and transcript rendering.

### Suggested files

- `src/entities/session/session.types.ts`
- `src/entities/session/session.model.ts`
- `src/entities/session/session.api.ts`
- `src/widgets/session-view/transcript-entry.presentational.tsx`
- `src/widgets/session-view/session-view.container.tsx`
- any session/fork helpers that currently depend on `TranscriptEntry`

### Important constraint

Do not “solve” this phase by re-embedding a large conversation blob into the
summary model. That would recreate the original problem under a new name.

## Checkpoint D — Renderer on Normalized Items

- [ ] Active transcript is rendered from normalized conversation items
- [ ] Session lists operate on summaries only
- [ ] No user-facing session surface depends on embedded transcript blobs

---

## Phase 4 — Cleanup and Hard Delete

Goal: remove the old live model and any temporary compatibility glue.

This phase is where the refactor becomes complete instead of merely working.

### Scope

- delete dead runtime types
- remove temporary compatibility transforms
- stop reading old transcript blobs in runtime code
- rebuild legacy databases so `sessions.transcript` is dropped from the live
  schema

### Acceptance criteria

- [ ] `TranscriptEntry` is no longer the live runtime model for sessions.
- [ ] No provider emits the old transcript union.
- [ ] No renderer session list API expects embedded transcript payloads.
- [ ] Temporary compatibility code added in Phases 1-3 is deleted.
- [ ] Legacy databases rebuild `sessions` without the `transcript` column after
      transcript-to-item migration succeeds.
- [ ] Startup fails closed instead of silently dropping malformed legacy
      transcript payloads.

Current repo decision:

- runtime renderer/backend summary-detail flows do not read transcript blobs
- startup migrates legacy transcript blobs into normalized conversation items
- the `sessions` table is then rebuilt without the `transcript` column

### Deletion rule

Be aggressive here. Because there is no external user base to preserve, this
repo should prefer deleting obsolete runtime paths instead of leaving both
models around.

## Checkpoint E — Old Live Model Gone

- [ ] Exactly one canonical live model remains
- [ ] The old transcript path is no longer part of active runtime behavior

---

## Cross-phase testing rules

Every phase must end with the repo verification flow on `.nvmrc` Node:

- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

Add targeted tests as the cutover progresses:

- Phase 1:
  - [ ] migration tests
  - [ ] row hydration tests
- Phase 2:
  - [ ] provider delta mapping tests
  - [ ] reducer persistence tests
- Phase 3:
  - [ ] renderer store split tests
  - [ ] transcript item rendering tests
- Phase 4:
  - [ ] dead-code grep / compile cleanup

## Rollback guidance

Rollback granularity should match the checkpoints.

- If Phase 1 fails, revert schema/read-model additions only.
- If Phase 2 fails, revert provider/session-service cutover without abandoning
  the persistence substrate.
- If Phase 3 fails, revert renderer cutover while keeping backend normalization
  intact.
- Phase 4 should still be the easiest to revert because it removes dead code
  and one legacy storage path rather than changing the canonical model again.

Do not roll back by reintroducing dual live models indefinitely.

## Immediate next task

Start with `Phase 0`, then `Phase 1`.

In practice:

1. make verification reliable on `.nvmrc` Node
2. add normalized types and the conversation-items table
3. land transcript-to-item migration
4. only then move the provider/runtime boundary
