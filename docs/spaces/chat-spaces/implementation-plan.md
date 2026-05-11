# Chat Spaces Implementation Plan

Parent spec: [Chat Spaces Product Spec](./product-spec.md)

## Phase Start Rule

Before implementing any phase, reread:

1. [Chat Spaces Product Spec](./product-spec.md)
2. This implementation plan
3. The relevant phase brief under `docs/spaces/chat-spaces/phases/`
4. Current source files in the slice being touched

The model to keep fresh:

- Space is inside Chat, not a third app surface.
- Space is not Project and not Workspace.
- V1 focuses on global chat Sessions.
- Attempts are Sessions linked to a Space.
- Existing Code surface behavior must not regress.
- Space context is explicit before provider injection.
- Files that are useful outside Convergence live on disk; transcripts remain in
  SQLite.

## Verification Rule

After each implementation phase, run with the Node version from `.nvmrc`:

```bash
fnm exec --using "$(cat .nvmrc)" -- npm install
fnm exec --using "$(cat .nvmrc)" -- npm run typecheck
fnm exec --using "$(cat .nvmrc)" -- npm run test:pure
fnm exec --using "$(cat .nvmrc)" -- npm run test:unit
fnm exec --using "$(cat .nvmrc)" -- chaperone check --fix
```

Do not run `npm run dev`; ask the user to run it for manual UI checks.

## Linear Tracking

The Linear project is `convergence` in team `MAR`.

Use one parent feature issue and child issues for the phases below. Publish
issues in dependency order and represent blockers with Linear issue relations.
Each issue should link this spec and plan.

Current Linear issue map:

| Phase  | Linear issue | Title                                                             |
| ------ | ------------ | ----------------------------------------------------------------- |
| Parent | `MAR-1215`   | Chat Spaces V1: first-class Spaces inside Chat                    |
| 0      | `MAR-1216`   | Chat Spaces phase 0: product decision and rename plan             |
| 1      | `MAR-1217`   | Chat Spaces phase 1: rename Initiative domain to Space            |
| 2      | `MAR-1218`   | Chat Spaces phase 2: add Spaces to the Chat sidebar               |
| 3      | `MAR-1219`   | Chat Spaces phase 3: build first-class Space home                 |
| 4      | `MAR-1220`   | Chat Spaces phase 4: move and link chats into Spaces              |
| 5      | `MAR-1221`   | Chat Spaces phase 5: add Space filesystem roots and Sources       |
| 6      | `MAR-1222`   | Chat Spaces phase 6: add Space brief, memory, and context preview |
| 7      | `MAR-1223`   | Chat Spaces phase 7: add Space Artifacts                          |
| 8      | `MAR-1224`   | Chat Spaces phase 8: polish V1 and capture follow-up roadmap      |

## Phase 0: Product Decision And Rename Plan

Type: HITL

Blocked by: None.

Goal: record the product decision and make the first implementation slice safe
to start.

What to build:

- Land the Chat Spaces product spec and implementation plan.
- Add an ADR that Space replaces Initiative as the broader chat context
  container.
- Confirm the rename scope:
  - user-facing Initiative -> Space
  - existing implementation can be renamed to `space_*`
  - Chat and Code remain the only app surfaces
- Create Linear parent and child issues.

Acceptance criteria:

- ADR, spec, and plan exist in the repo.
- Linear parent links or embeds the docs.
- Child issues exist for every implementation phase.
- The next implementer can start Phase 1 by reading the docs and ticket.

Manual check:

- None.

## Phase 1: Rename Initiative Domain To Space

Type: AFK

Blocked by: Phase 0.

Goal: make Space the real implementation language before building more UI on
top of it.

What to build:

- Rename renderer entity `src/entities/initiative` to `src/entities/space`.
- Rename backend `electron/backend/initiative` to `electron/backend/space`.
- Rename IPC/preload namespaces from `initiative` to `space`.
- Migrate SQLite tables from:
  - `initiatives` -> `spaces`
  - `initiative_attempts` -> `space_attempts`
  - `initiative_outputs` -> `space_artifacts`
- Rename types:
  - `Initiative` -> `Space`
  - `InitiativeAttempt` -> `SpaceAttempt`
  - `InitiativeOutput` -> `SpaceArtifact`
  - `currentUnderstanding` -> `brief`
- Preserve existing data where practical.
- Keep compatibility only where needed for migration tests; do not create a
  long-term dual Initiative/Space abstraction.

Acceptance criteria:

- The app compiles with Space domain names.
- Existing Initiative tests are renamed and pass as Space tests.
- Database migration covers old and new schemas.
- No user-facing "Initiative" copy remains in active UI.
- Code surface behavior is unchanged.

Manual check:

1. User starts the app.
2. Existing project/session navigation still works.
3. Opening the old Workboard entry now uses Space language.

## Phase 2: Chat Sidebar Spaces

Type: AFK

Blocked by: Phase 1.

Goal: make Spaces visible and selectable inside the Chat sidebar.

What to build:

- Add Space list state to the Chat/sidebar flow.
- Replace the flat Chat-only list with:
  - Spaces
  - Ungrouped chats
  - Archived
- Selecting a Space sets Chat context to the Space home.
- Expanding a Space in the sidebar reveals linked Attempts/Sessions for quick
  navigation.
- Keep ungrouped "New chat" behavior.
- Add "New Space" affordance in Chat.

Acceptance criteria:

- Chat sidebar shows Spaces when active surface is Chat.
- Clicking a Space opens its Space home, not a modal.
- Expanding a Space reveals attempts.
- Ungrouped chats still render and can be selected.
- Code sidebar/project tree is unchanged.

Manual check:

1. Switch to Chat.
2. Create or inspect a Space.
3. Select the Space from the sidebar and confirm the main view changes.
4. Expand the Space and select an Attempt.
5. Switch back to Code and confirm project/workspace navigation is unchanged.

## Phase 3: First-Class Space Home

Type: AFK

Blocked by: Phase 2.

Goal: replace the modal-centered Workboard with a main Chat view for one Space.

What to build:

- Add a `SpaceHome` widget under the Chat surface.
- Render Space title, short description/brief summary, and actions.
- Add tabs:
  - Chats
  - Sources
  - Memory
  - Artifacts
  - Brief
- Implement the Chats tab with linked Attempts and "New attempt in this Space".
- Keep Sources, Memory, Artifacts, and Brief useful but lightweight in this
  phase; empty states are acceptable where deeper functionality comes later.

Acceptance criteria:

- Selecting a Space renders a first-class Space home in the Chat surface.
- The Chats tab lists linked attempts.
- "New attempt in this Space" creates and starts a global Session linked to the
  Space.
- Existing reusable Session conversation rendering still handles opened
  attempts.
- The old modal Workboard is either removed from primary navigation or treated
  as a temporary secondary entry.

Manual check:

1. Open a Space.
2. Start a new attempt from the Space home.
3. Send a message and confirm the attempt appears in the Space Chats tab and
   sidebar expansion.
4. Reopen the attempt after switching away.

## Phase 4: Move And Link Chats Into Spaces

Type: AFK

Blocked by: Phase 3.

Goal: make Spaces useful for existing chat history, not only new attempts.

What to build:

- Add actions to move an ungrouped global Session into a Space.
- Add actions to detach a Space Attempt back to ungrouped chats.
- Add create-Space-from-chat flow.
- Preserve attempt role and primary attempt behavior.
- Make archive/delete behavior clear for Space links:
  - deleting a Session removes its Attempt link
  - deleting a Space cascades links/artifacts, not unrelated Sessions unless
    explicitly confirmed

Acceptance criteria:

- Existing ungrouped chats can be linked to a Space.
- Linked chats disappear from Ungrouped and appear under the Space.
- Detaching returns the chat to Ungrouped.
- Duplicate Space/Session links are prevented.
- Tests cover link, detach, create-from-chat, delete/archive edge cases.

Manual check:

1. Create a loose chat.
2. Move it into an existing Space.
3. Detach it and confirm it returns to Ungrouped.
4. Create a new Space from a loose chat.

## Phase 5: Space Filesystem Roots And Sources

Type: AFK

Blocked by: Phase 3.

Goal: establish the local filesystem model for Spaces and add the first source
management path.

What to build:

- Create app-owned Space roots:

  ```text
  {userData}/spaces/{spaceId}/
    sources/
    memory/
    artifacts/
    attempts/{sessionId}/
    scratch/
  ```

- Add backend `SpaceFileService` or equivalent focused service.
- Add source metadata table/API if existing artifacts table is not enough.
- Add "Add source" flow for local files:
  - copy into `sources/`
  - record metadata
  - list in Sources tab
  - remove source metadata and file when requested
- Keep source content indexing out of scope.

Acceptance criteria:

- Creating a Space creates or lazily ensures its filesystem root.
- Adding a file source copies it under the Space root.
- Sources tab lists stored files with metadata.
- Deleting a source handles DB and filesystem cleanup.
- Space deletion cleans up app-owned Space files.

Manual check:

1. Add a small text/JSON source to a Space.
2. Confirm it appears in Sources.
3. Confirm the file exists under app-owned Space storage.
4. Remove it and confirm cleanup.

## Phase 6: Space Brief, Memory, And Context Preview

Type: AFK

Blocked by: Phases 3 and 5.

Goal: introduce explicit Space context controls for new attempts.

What to build:

- Implement editable Brief and Memory/Instructions sections.
- Store user-curated brief/memory in DB and, where useful, as markdown files
  under `memory/`.
- Add a context preview/control in the Space attempt composer:
  - Space brief
  - Space instructions/memory
  - selected sources
  - optional previous-attempt summary placeholder
- Ensure provider-visible context is explicit and inspectable before Session
  start.
- Reuse existing context-injection patterns where possible; do not overload
  project context items.

Acceptance criteria:

- User can edit Space brief and memory.
- New attempt composer shows what Space context will be included.
- User can disable Space context for an attempt.
- Provider start receives only selected Space context.
- Tests cover context selection and prompt/input construction.

Manual check:

1. Add a Space brief and instruction.
2. Start a new attempt with Space context included.
3. Start another attempt with Space context disabled.
4. Confirm UI makes the difference visible before send.

## Phase 7: Space Artifacts

Type: AFK

Blocked by: Phase 5.

Goal: make durable outputs first-class under the Space.

What to build:

- Rename/extend old outputs into Space Artifacts.
- Support manual artifact creation with:
  - kind
  - label
  - value/path
  - optional source Session
  - status
- Support filesystem-backed artifact files under `artifacts/`.
- Show artifacts in the Space home Artifacts tab.
- Keep automatic artifact extraction/suggestion out of scope unless existing
  code can be reused cheaply.

Acceptance criteria:

- User can add, edit, and remove Space artifacts.
- Artifacts can reference a source Attempt.
- File-backed artifacts live under the Space root.
- Existing output suggestion logic is either renamed or explicitly deferred.

Manual check:

1. Add a manual artifact.
2. Add a file-backed artifact.
3. Link an artifact to an Attempt.
4. Reopen the Space and confirm persistence.

## Phase 8: Space Polish And Follow-Up Roadmap

Type: HITL

Blocked by: Phases 1-7.

Goal: harden the V1 Space experience and define the next roadmap.

What to build:

- Review copy and empty states.
- Confirm keyboard/navigation flows.
- Confirm Code surface and Project/Workspace flows are unchanged.
- Document follow-up roadmap:
  - Project references from Spaces
  - code Session attempts inside Spaces
  - semantic source indexing
  - automatic memory suggestions
  - AI synthesis of brief/current understanding
  - artifact suggestions
  - multi-provider delegation
- Run full verification and record results.

Acceptance criteria:

- User signs off that Spaces are ready as the Chat grouping/context layer.
- All required verification commands pass.
- Follow-up roadmap is captured in docs and Linear.

Manual check:

1. Use Chat Spaces for a small real workflow.
2. Start multiple attempts.
3. Add sources, memory, and artifacts.
4. Switch between Chat and Code without regression.
