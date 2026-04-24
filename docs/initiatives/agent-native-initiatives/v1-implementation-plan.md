# Agent-Native Initiatives V1 Implementation Plan

## Planning Rule For Every Phase

At the start of every implementation phase, reread:

1. [Product Spec](./product-spec.md)
2. This implementation plan
3. The source files touched by the previous phase

Do this before editing code. The feature is large enough that implementation
quality depends on keeping the product model fresh:

- Initiatives are global, not project-owned.
- Sessions become Attempts when linked to Initiatives.
- One Attempt can be primary, but the model is a list of Attempts.
- Current understanding is stable user-curated state.
- Suggested updates are AI-generated previews until accepted.
- Outputs are first-class records attached to Initiatives.
- The sidebar stays normal session navigation; linked sessions change the main
  content layout.
- AI-assisted Initiative features use Convergence's existing provider runtime,
  not direct ad hoc model API calls.

## Phase Start Brief Rule

Before implementing each phase, create or update a small phase-specific brief
under:

```text
docs/initiatives/agent-native-initiatives/phases/
```

Use names like:

```text
phase-0-foundation.md
phase-1-workboard.md
phase-2-attempt-linking.md
```

The brief should stay practical. It is not a second product spec. It should
capture the implementation-facing plan for the phase after reading the current
codebase.

Each phase brief should include:

- the product goal for the phase
- the current repo state and existing patterns that matter
- the data, API, service, and UI contracts the phase will introduce
- what is intentionally out of scope
- automated tests to add or update
- manual `npm run dev` checks for the user
- any known risks or migration concerns

The phase brief should be updated if implementation discovers that the codebase
requires a different shape than expected.

## Current Research Rule

At the start of a phase, decide whether targeted current research is needed.
Use current official or primary sources when the phase depends on unstable
external behavior, APIs, or product conventions.

Examples:

- Phase 0 data model is mostly repo-grounded; external research is probably
  unnecessary.
- Workboard UX may use light current product research, but the existing
  Convergence UI should be the primary source of truth.
- Output discovery should use current Git/GitHub documentation if it touches
  branch or pull request detection behavior.
- AI synthesis should use current provider documentation and structured-output
  guidance before finalizing prompt and parsing contracts.
- Direct OpenAI API work is not the default path. If a future phase explicitly
  requires it as an escape hatch, use official OpenAI documentation.

Keep research targeted. Do not use browsing as a substitute for reading the
repo or following established local architecture.

## Provider Runtime Rule For AI Features

Any AI-assisted Initiative behavior must use the provider functionality already
available in Convergence. Synthesis, suggestion generation, comparison, and
future agentic Initiative actions should run through the existing provider
runtime and provider-neutral abstractions used by Claude Code, Codex, Pi,
shell-backed providers, and future providers.

Do not implement Initiative AI features as separate direct API requests to a
model provider by default. The whole point of Convergence is to orchestrate
work through the providers and subscriptions users already have configured.

If a phase needs provider behavior that does not exist yet, extend the provider
abstraction or add a focused provider capability first. Direct model API
integration is a future escape hatch only when the provider runtime cannot
reasonably support the use case.

## Verification Rule For Every Phase

After each finished phase, run the repo-required verification on the Node
version from `.nvmrc`:

```bash
fnm exec --using "$(cat .nvmrc)" -- npm install
fnm exec --using "$(cat .nvmrc)" -- npm run test:pure
fnm exec --using "$(cat .nvmrc)" -- npm run test:unit
fnm exec --using "$(cat .nvmrc)" -- chaperone check --fix
```

If `chaperone check --fix` touches unrelated files, inspect and restore those
unrelated changes before completing the phase.

The user will run `npm run dev` manually for app-level verification. Each
phase below includes a **Manual Check** section for what the user should verify
in the development app.

## Phase 0: Foundation And Data Model

### Goal

Add the persisted Initiative domain without changing the visible product
surface yet.

### Scope

- Add SQLite tables for:
  - `initiatives`
  - `initiative_attempts`
  - `initiative_outputs`
- Keep Initiatives global. Do not add `project_id` to `initiatives`.
- `initiative_attempts.session_id` links to existing sessions.
- `initiative_attempts` stores role and `is_primary`.
- `initiative_outputs` stores kind, label, value, status, and optional
  `source_session_id`.
- Add backend types and pure mappers.
- Add backend service methods:
  - list Initiatives
  - get Initiative by id
  - create Initiative
  - update title/status/current understanding
  - delete Initiative if needed for tests/dev cleanup
  - link/unlink session as Attempt
  - set primary Attempt
  - list/add/update/remove outputs
- Add IPC, preload, renderer `*.api.ts`, and `src/entities/initiative`.
- Add store actions needed by later phases.

### Tests

- Pure mapper/validation tests for Initiative, Attempt, and Output data.
- Backend service tests using an in-memory or temporary SQLite database.
- Renderer store tests for loading, create/update, attempts, and outputs.
- IPC/preload shape tests if current project patterns include them for similar
  entities.

### Manual Check

No meaningful user-facing manual check is expected in this phase. The phase is
valid if automated tests pass and no existing UI behavior changes.

### Done When

- The domain can persist and retrieve global Initiatives.
- Sessions from different projects can be linked to the same Initiative at the
  data/service layer.
- A primary Attempt can be set without making the model single-session-centric.

## Phase 1: Lightweight Workboard

### Goal

Expose global Initiative navigation and creation in the UI.

### Scope

- Add a lightweight Workboard surface.
- Show all Initiatives globally, not scoped to the active project.
- Provide create Initiative flow with minimal required input: title.
- Allow editing:
  - title
  - status
  - current understanding
- Show compact Initiative metadata:
  - status
  - attention if implemented in the data model
  - number of attempts
  - number of outputs
  - updated time
- Add entry point through Command Center or an existing global app surface.
  Prefer a conservative entry that does not disturb the project/session
  sidebar model.

### Tests

- Component tests for empty state, list rendering, create flow, and edit flow.
- Store/container tests for create and update orchestration.
- Pure tests for any Workboard filtering/grouping/sorting logic.

### Manual Check

Run `npm run dev`, then verify:

1. You can open the Workboard from the chosen entry point.
2. Empty state is understandable when no Initiatives exist.
3. You can create an Initiative with only a title.
4. The new Initiative appears in the Workboard.
5. You can edit title, status, and current understanding.
6. Restart the app and confirm the Initiative persists.
7. Confirm normal project/session sidebar navigation still behaves as before.

### Done When

- A user can create and manage a tiny Initiative without linking any sessions.
- The Workboard feels lightweight, not like a heavyweight issue tracker.

## Phase 2: Link Sessions As Attempts

### Goal

Make existing sessions attachable to Initiatives and visible as Attempts.

### Scope

- Add actions from session view:
  - create Initiative from current session
  - attach current session to existing Initiative
  - detach current session from Initiative where appropriate
- When creating from current session:
  - create Initiative
  - link current session as `seed`
  - mark it primary
- Allow changing Attempt role.
- Allow marking a different linked Attempt as primary.
- In Workboard and Initiative detail, show linked Attempts with:
  - session name
  - project name
  - workspace/branch if available
  - provider
  - status/attention
- Ensure the same Initiative can link sessions from multiple projects.

### Tests

- Backend service tests for cross-project session linking.
- Tests preventing duplicate Attempt rows for the same Initiative/session.
- Store/container tests for create-from-session and attach-existing flows.
- Component tests for Attempt list rendering and primary marker.

### Manual Check

Run `npm run dev`, then verify:

1. Open an existing session.
2. Create an Initiative from that session.
3. Confirm the session is listed as an Attempt.
4. Confirm it is marked primary.
5. Create or switch to a session from another project.
6. Attach that second session to the same Initiative.
7. Open the Initiative and confirm both Attempts are visible with project
   context.
8. Mark the second Attempt primary and confirm only one Attempt is primary.
9. Detach a non-primary Attempt and confirm the Initiative remains valid.

### Done When

- Initiative membership works across projects.
- The product no longer assumes one Initiative equals one project or one
  session.

## Phase 3: Session View Initiative Context Panel

### Goal

When a linked session is selected, the main session view becomes a focused
Attempt inside the larger Initiative context.

### Scope

- Keep the sidebar as normal project/workspace/session navigation.
- Detect whether the selected session is linked to an Initiative.
- If linked, render the main content area as:

```text
conversation or terminal attempt | Initiative context panel
```

- The panel should show:
  - Initiative title and status
  - current understanding
  - linked Attempts
  - outputs
  - next action placeholder if implemented
- Support opening the full Initiative detail view from the panel.
- Keep standalone sessions centered/unchanged when not linked.
- Make layout responsive enough that the conversation remains usable.

### Tests

- Component/container tests for standalone session layout.
- Component/container tests for linked session layout.
- Tests confirming the sidebar does not need Initiative-specific tree state.
- Tests for opening Initiative detail from the panel.

### Manual Check

Run `npm run dev`, then verify:

1. Open an unlinked session and confirm the session view looks like it did
   before this feature.
2. Open a linked session and confirm the conversation/terminal shifts to make
   room for the Initiative context panel.
3. Confirm the sidebar did not gain confusing Initiative-specific structure.
4. Edit current understanding in the Initiative detail view and confirm the
   panel reflects the change.
5. Switch between linked and unlinked sessions and confirm the layout updates
   correctly.
6. Confirm the composer remains usable in the linked layout.

### Done When

- A linked session clearly feels like one Attempt inside a larger Initiative.
- The user can keep agent context and delivery context visible at the same
  time.

## Phase 4: Initiative Detail View And Manual Outputs

### Goal

Make the Initiative detail view useful as the durable history and delivery
surface.

### Scope

- Add full Initiative detail view.
- Sections:
  - Overview
  - Current understanding
  - Attempts
  - Outputs
  - Activity or updated-at history if cheap
- Support manual output CRUD:
  - kind
  - label
  - value
  - status
  - optional source session
- Output kinds:
  - `pull-request`
  - `branch`
  - `commit-range`
  - `release`
  - `spec`
  - `documentation`
  - `migration-note`
  - `external-issue`
  - `other`
- Avoid overbuilding Decisions/Open Questions if they would become hollow
  forms. They can remain future sections unless needed for synthesis.

### Tests

- Component tests for detail sections.
- Output CRUD store/service tests.
- Tests for output status and kind validation.
- Tests that outputs persist across reload.

### Manual Check

Run `npm run dev`, then verify:

1. Open an Initiative detail view from the Workboard.
2. Add outputs manually:
   - one pull request URL
   - one documentation/spec file path
   - one branch name
3. Edit output labels/statuses.
4. Remove an output.
5. Restart the app and confirm remaining outputs persist.
6. Confirm a completed Initiative is understandable when reopened later:
   current understanding, Attempts, and Outputs should tell the story.

### Done When

- Initiatives are useful as durable records, not only active work containers.
- Outputs make the delivery result visible without reading every transcript.

## Phase 5: Semi-Automatic Output Suggestions

### Goal

Suggest likely outputs from linked session repositories while keeping user
confirmation in control.

### Scope

- Add a refresh/discover action on Initiative outputs.
- Inspect repositories represented by linked Attempts.
- Suggest likely outputs where feasible from local repository state:
  - current branch names
  - remote branch tracking info
  - obvious PR URLs if already present in session transcript or git metadata
- Do not require GitHub integration in V1.
- Do not silently attach suggested outputs.
- Present suggestions with accept/dismiss controls.

### Tests

- Pure tests for converting discovered repository facts into output
  suggestions.
- Backend service tests around linked-session repository enumeration.
- Component tests for suggestion accept/dismiss behavior.

### Manual Check

Run `npm run dev`, then verify:

1. Link an Initiative to a session in a repository with a feature branch.
2. Open Initiative outputs and run refresh/discover.
3. Confirm suggestions appear only as suggestions.
4. Accept a branch suggestion and confirm it becomes a stable output.
5. Dismiss a suggestion and confirm it is not attached.
6. Confirm no unexpected output is added without confirmation.

### Done When

- The app can help discover outputs while preserving user control.
- Fully automatic PR lifecycle tracking remains out of scope.

## Phase 6: AI Synthesis As Suggested Updates

### Goal

Add the first AI-powered Initiative action:
**Synthesize current understanding from linked sessions**.

### Scope

- Add backend one-shot synthesis service through the existing Convergence
  provider runtime and provider-neutral patterns.
- Do not call external model APIs directly for synthesis.
- Input should include:
  - current Initiative stable state
  - linked session summaries/transcripts
  - Attempt roles
  - changed files where available and reasonably sized
  - outputs
- Output should be structured into transient suggested updates:
  - proposed current understanding
  - proposed decisions or decision-like bullets
  - proposed open questions
  - proposed next action
  - proposed outputs if detected
- User can accept, edit, or reject suggested updates.
- Persist only accepted/edited updates.
- Do not silently mutate stable Initiative state.

### Tests

- Pure tests for synthesis prompt assembly.
- Pure tests for output parsing/validation.
- Service tests with mocked provider one-shot responses.
- Component tests for suggestion preview, accept/edit/reject, and persistence.
- Tests that closing preview without accepting leaves stable state unchanged.

### Manual Check

Run `npm run dev`, then verify:

1. Create an Initiative with at least one linked session that has transcript
   content.
2. Run **Synthesize current understanding from linked sessions**.
3. Confirm the result appears as suggestions, not automatic edits.
4. Accept a suggested current understanding update.
5. Edit and accept another suggestion.
6. Reject a suggestion.
7. Close the synthesis preview and confirm unaccepted suggestions do not
   persist.
8. Restart the app and confirm only accepted changes persisted.

### Done When

- AI helps organize context without becoming the source of truth.
- Current understanding can be improved from real session history.

## Phase 7: V1 Hardening And End-To-End Review

### Goal

Make the V1 flow cohesive, reliable, and ready for day-to-day use.

### Scope

- Review naming consistency across UI.
- Review empty states and error states.
- Ensure Initiative flows work across multiple projects.
- Ensure no sidebar model regression.
- Ensure Initiative detail, Workboard, and side panel agree on state.
- Add or tighten tests around end-to-end store/service behavior.
- Update product spec or this plan if implementation discovers better
  language or necessary scope changes.

### Tests

- Add focused integration-style tests around:
  - create Initiative
  - create from session
  - attach cross-project Attempt
  - add output
  - synthesize/accept update with mocked provider
- Run all required verification.

### Manual Check

Run `npm run dev`, then perform a full V1 walkthrough:

1. Create an Initiative from scratch.
2. Create an Initiative from an existing session.
3. Link a session from another project.
4. Confirm Workboard shows the Initiative globally.
5. Open a linked session and confirm the Initiative panel appears.
6. Add manual outputs.
7. Run output discovery and accept one suggestion.
8. Run synthesis and accept one current understanding update.
9. Restart the app and confirm all accepted state persists.
10. Confirm unrelated sessions and project navigation still behave normally.

### Done When

- The V1 can support a real tiny Initiative and a real multi-session
  Initiative.
- The user can explain what happened later by reopening the Initiative.

## Suggested Commit Strategy

Keep each phase independently reviewable:

1. Foundation schema/service/API
2. Workboard UI
3. Session linking and Attempts
4. Session-side Initiative panel
5. Detail view and manual outputs
6. Output suggestions
7. AI synthesis
8. Hardening/docs

Do not batch multiple phases into one large commit unless a phase is too small
to stand alone.
