# Implementation Plan: First-Class Skills

Companion plan for `docs/specs/first-class-skills.md`. Read the spec before
starting any phase.

This is intentionally a phased plan, not a fixed ten-ticket contract. Skills
touch provider protocols, transcript persistence, composer UX, provider
catalogs, and future management flows. Each phase ends with a manual validation
path and a required spec re-read so the next phase can be adjusted against the
actual code that landed.

## Ground Rules

- Do not implement heuristics for skill activation.
- Do not copy full `SKILL.md` instructions into prompts when a provider-native
  invocation path exists.
- Do not merge skill catalogs with MCP/tool catalogs.
- Do not execute skill scripts during browsing or detail reads.
- Keep V1 read-only except provider-native enable/disable if explicitly scoped.
- Preserve provider differences in the UI instead of hiding them.
- At the end of every implementation phase:
  - re-read `docs/specs/first-class-skills.md`
  - re-read this plan
  - update the next phase's task details if current code changed the shape
  - run the repo-required verification from `AGENTS.md`

## Phase 0 - Spec And Provider Confirmation Baseline

**Goal:** Land this spec and plan, with the provider confirmation semantics
explicitly documented before implementation begins.

### Tasks

- Add `docs/specs/first-class-skills.md`.
- Add `docs/specs/first-class-skills-plan.md`.
- Record provider baseline:
  - Codex has native catalog and structured skill input.
  - Claude Code has documented `claude_code.skill_activated` OTel event, but
    Convergence does not yet consume it.
  - Pi has documented skill discovery and `/skill:name`; current Convergence
    RPC path has no stable skill activation event.

### Acceptance Criteria

- [ ] Spec defines discovery, details, invocation, and activation semantics.
- [ ] Plan includes manual test steps for every implementation phase.
- [ ] Spec states that `sent` and `confirmed` are different UI states.
- [ ] Spec names Codex, Claude Code, and Pi provider strategies.

### Manual Validation

- [ ] Read the spec and confirm the product behavior matches the intended
      direction: composer skill picker, full skill browser, skill details, and
      no fake activation claims.
- [ ] Confirm the plan's phase order is acceptable before Phase 1 starts.

### Verification

- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Files Touched

- `docs/specs/first-class-skills.md`
- `docs/specs/first-class-skills-plan.md`

---

## Phase 1 - Backend Skill Domain And Codex Catalog

**Goal:** Build the provider-neutral backend model and prove it with Codex,
because Codex currently exposes the strongest native app-server catalog.

Detailed phase spec: `docs/specs/first-class-skills-phase-1.md`.

### Tasks

- Add normalized skill types under `electron/backend/skills`.
- Add pure utilities for stable skill IDs, scope normalization, duplicate
  detection, and catalog warnings.
- Add `SkillsService.listByProjectId(projectId, options)`.
- Add a Codex catalog adapter that starts or reuses a small app-server client,
  calls `skills/list` with the selected project cwd, and maps results into
  normalized catalog entries.
- Listen for or expose refresh behavior for `skills/changed`.
- Add IPC/preload boundary for `skills:listByProjectId`.
- Add renderer shared types only where needed to compile the IPC contract.

### Acceptance Criteria

- [ ] `skills:listByProjectId` returns provider-grouped entries for Codex.
- [ ] Duplicate names are preserved as separate entries.
- [ ] Codex entries include name, description, path, raw scope, normalized
      scope, enabled state, dependencies when provided, and warnings.
- [ ] Catalog listing errors are returned per provider instead of failing the
      whole request.
- [ ] Unit tests cover scope normalization, stable IDs, duplicate detection,
      and Codex mapping from representative app-server payloads.
- [ ] No skill script is executed during listing.

### Manual Validation

- [ ] Start the app against a project that has Codex available.
- [ ] In devtools, call the new preload API for skills and verify Codex skills
      appear with paths and scopes.
- [ ] Add or remove a local Codex skill, refresh manually, and verify the
      catalog changes.
- [ ] Confirm duplicate skill names are displayed as separate raw catalog
      entries in the returned data.

### Verification

- [ ] Re-read `docs/specs/first-class-skills.md` and this plan.
- [ ] Update Phase 2 details if the backend contract changed.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Likely Files Touched

- `electron/backend/skills/*`
- `electron/backend/provider/codex/*`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/shared/types/electron-api.d.ts`

---

## Phase 2 - Skill Browser And Details

**Goal:** Give users a full skill directory with search and detail reading
before wiring invocation into the composer.

Detailed phase spec: `docs/specs/first-class-skills-phase-2.md`.

### Tasks

- Add `src/entities/skill` API/model/types.
- Add `src/features/skills` browser dialog.
- Add a details endpoint that reads full `SKILL.md` content for catalog refs
  returned by the backend.
- Render full skill details safely in the dialog.
- Add search, provider filter, scope filter, enabled filter, and duplicate
  warning UI.
- Add a "Browse skills" entry from the composer skill popover placeholder or a
  temporary developer-accessible entry if the composer integration is not ready.

### Acceptance Criteria

- [ ] The browser lists Codex skills from Phase 1.
- [ ] Search matches name, description, scope, provider, and path.
- [ ] Opening a skill shows full `SKILL.md`, path, provider, scope, enabled
      state, dependencies, and warnings.
- [ ] Details reads are path-restricted to catalog refs.
- [ ] Empty, loading, and provider-error states are visible and tested.
- [ ] The UI remains provider-grouped and does not dedupe skills across
      providers.

### Manual Validation

- [ ] Open the Skills browser from the app.
- [ ] Search for a known skill and open it.
- [ ] Confirm the details pane matches the local `SKILL.md`.
- [ ] Confirm duplicate names remain distinguishable by provider/scope/path.
- [ ] Temporarily rename or remove a skill file, refresh, and verify the UI
      shows a clear missing/error state.

### Verification

- [ ] Re-read `docs/specs/first-class-skills.md` and this plan.
- [ ] Update Phase 3 details if the renderer state shape changed.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Likely Files Touched

- `src/entities/skill/*`
- `src/features/skills/*`
- `electron/backend/skills/*`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/shared/types/electron-api.d.ts`

---

## Phase 3 - Composer Skill Selection And Transcript Metadata

**Goal:** Let the user select skills in the composer and persist selected skill
refs on user messages, without yet changing provider invocation behavior.

Detailed phase spec: `docs/specs/first-class-skills-phase-3.md`.

### Tasks

- Replace the Phase 2 browse-only composer Skills button with a searchable
  picker that reuses `src/entities/skill` catalog state and catalog-backed
  skill refs.
- Add selected skill chips in the composer.
- Extend session start/send-message input types with `skillSelections`.
- Extend user conversation item payloads with `skillRefs`.
- Persist skill refs in normalized conversation item payload JSON.
- Render skill chips on user messages in the transcript.
- Keep provider adapters temporarily ignoring skill selections until Phase 4.

### Acceptance Criteria

- [ ] User can select and remove a skill before sending.
- [ ] Skill chips are included on the user message after send.
- [ ] Skill refs survive app reload through `session_conversation_items`.
- [ ] Existing attachment behavior is unchanged.
- [ ] Provider adapters compile with the new `sendMessage` signature.
- [ ] UI labels selections as `selected` before send and `sent` only when a
      provider phase actually marks them sent.

### Manual Validation

- [ ] Open a session, select a skill, send a normal prompt.
- [ ] Confirm the transcript user message shows the selected skill chip.
- [ ] Restart the app and confirm the chip is still present.
- [ ] Send a prompt with both an attachment and a selected skill; verify both
      metadata surfaces remain visible.
- [ ] Confirm the agent behavior has not changed yet if provider invocation is
      still intentionally disabled in this phase.

### Verification

- [ ] Re-read `docs/specs/first-class-skills.md` and this plan.
- [ ] Update Phase 4 details against the final session/metadata shape.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Likely Files Touched

- `src/features/composer/*`
- `src/entities/session/*`
- `src/widgets/session-view/*`
- `electron/backend/session/*`
- `electron/backend/provider/provider.types.ts`
- provider implementations for signature updates
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/shared/types/electron-api.d.ts`

---

## Phase 4 - Codex Native Invocation

**Goal:** Invoke selected Codex skills using Codex's native structured skill
input.

Detailed phase spec: `docs/specs/first-class-skills-phase-4.md`.

### Tasks

- Extend `CodexUserInput` to support `{ type: 'skill', name, path }`.
- Update `buildCodexUserInput` or a nearby helper to append selected skill
  input items.
- Include a text marker such as `$skill-name` only where it matches Codex
  guidance and does not corrupt the user's visible prompt unexpectedly.
- Validate selected Codex skill refs against the latest catalog before send.
- Mark skill chips as `sent` after `turn/start` accepts the input.
- Surface `unavailable` or `failed` if the selected skill cannot be resolved or
  app-server rejects the turn.

### Acceptance Criteria

- [ ] Codex `turn/start.input` includes structured skill items for selected
      skills.
- [ ] The selected skill path comes from the catalog, not arbitrary renderer
      input.
- [ ] Transcript chip state moves to `sent` after the provider accepts the
      turn.
- [ ] Missing/disabled skill selections fail with visible user-facing feedback.
- [ ] No UI claims provider-confirmed activation for Codex.
- [ ] Tests cover Codex input serialization with text, attachments, and skills.

### Manual Validation

- [ ] Select a harmless Codex skill and send a prompt that should use it.
- [ ] Confirm the turn starts successfully.
- [ ] Confirm the transcript chip shows `sent`, not `confirmed`.
- [ ] Disable or remove the skill, select it from stale UI if possible, send,
      and verify the error is clear.
- [ ] Use a prompt with an image or text attachment plus a selected skill and
      verify the turn still starts.

### Verification

- [ ] Re-read `docs/specs/first-class-skills.md` and this plan.
- [ ] Update Phase 5 provider details based on lessons from Codex invocation.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Likely Files Touched

- `electron/backend/provider/codex/codex-message.pure.ts`
- `electron/backend/provider/codex/codex-provider.ts`
- `electron/backend/skills/*`
- session metadata/status helpers from Phase 3

---

## Phase 5 - Claude Code And Pi Catalogs

**Goal:** Bring Claude Code and Pi into the skill browser using conservative,
read-only native-or-filesystem catalogs.

Detailed phase spec: `docs/specs/first-class-skills-phase-5.md`.

### Tasks

- Add Claude Code catalog adapter:
  - prefer native CLI/SDK catalog if available
  - otherwise scan documented user/project/plugin paths read-only
- Add Pi catalog adapter:
  - prefer native RPC/catalog command if available
  - otherwise scan documented global/project/settings roots read-only
- Normalize provider-specific warnings:
  - duplicate names
  - invalid frontmatter
  - missing description
  - unsupported exact-path invocation
- Add provider capability metadata for catalog source.

### Acceptance Criteria

- [ ] Skill browser can show Codex, Claude Code, and Pi sections.
- [ ] Provider errors are isolated to each provider.
- [ ] Filesystem scans do not leave documented roots for the active project and
      current user.
- [ ] Duplicate/ambiguous Claude and Pi names are flagged.
- [ ] Catalog entries clearly state whether they came from native RPC/CLI or
      filesystem scanning.

### Manual Validation

- [ ] Create a small test skill in `.claude/skills/<name>/SKILL.md`; refresh
      and verify Claude Code shows it.
- [ ] Create a small test skill in `.pi/skills/<name>/SKILL.md`; refresh and
      verify Pi shows it.
- [ ] Create same-name user and project skills; verify duplicate warnings are
      visible and entries remain separate where the provider supports that.
- [ ] Remove a skill and refresh; verify the catalog updates cleanly.

### Verification

- [ ] Re-read `docs/specs/first-class-skills.md` and this plan.
- [ ] Update Phase 6 invocation details based on the catalog data actually
      available for Claude Code and Pi.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Likely Files Touched

- `electron/backend/skills/*`
- `electron/backend/provider/claude-code/*`
- `electron/backend/provider/pi/*`
- provider descriptor helpers/tests

---

## Phase 6 - Claude Code And Pi Native Invocation

**Goal:** Invoke selected Claude Code and Pi skills through their native command
syntax, while preserving honest transcript status.

Detailed phase spec: `docs/specs/first-class-skills-phase-6.md`.

### Tasks

- Add provider-specific skill invocation formatting:
  - Claude Code: native skill command by name where supported.
  - Pi: `/skill:name` prompt command.
- Treat Phase 5 filesystem `path` values as catalog/detail anchors only:
  Claude Code and Pi invocation is name-based until a provider exposes stable
  exact-path invocation.
- Validate selections against the provider catalog immediately before send.
- Handle duplicate/ambiguous names:
  - default to blocking duplicate-name selections with a clear ambiguity message
  - relax only if provider precedence is proven deterministic and testable
- Mark selected skills as `sent` when the provider accepts the prompt.
- Keep activation state as not confirmed for both providers in this phase.

### Acceptance Criteria

- [ ] Claude Code selected skills are sent through native syntax, not copied
      `SKILL.md` content.
- [ ] Pi selected skills are sent through `/skill:name`.
- [ ] Ambiguous selections are surfaced instead of silently choosing the wrong
      skill.
- [ ] Transcript chip state shows `sent`, not `confirmed`.
- [ ] Unit tests cover command formatting and ambiguity handling.

### Manual Validation

- [ ] Create a harmless Claude Code skill, select it, send a prompt, and verify
      the turn runs.
- [ ] Create a harmless Pi skill, select it, send a prompt, and verify the turn
      runs.
- [ ] Create duplicate names for one provider and verify the UI warns or blocks
      according to the implemented provider rule.
- [ ] Confirm neither provider shows `confirmed` after send.

### Verification

- [ ] Re-read `docs/specs/first-class-skills.md` and this plan.
- [ ] Update Phase 7 telemetry details based on any provider runtime events
      observed during manual testing.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Likely Files Touched

- `electron/backend/provider/claude-code/*`
- `electron/backend/provider/pi/*`
- `electron/backend/skills/*`
- session skill status helpers

---

## Phase 7 - Provider-Confirmed Activation Telemetry

**Goal:** Add `confirmed` skill status only where a provider exposes a stable
native signal.

Detailed phase spec: `docs/specs/first-class-skills-phase-7.md`.

Phase 6 note: Claude Code and Pi now receive provider-native command syntax,
but that send path still exposes only `sent`/failure state. It does not expose
additional activation confirmation events, so Phase 7 remains a telemetry-only
confirmation phase with no heuristic fallback.

### Tasks

- Prototype a Claude Code telemetry ingestion path for
  `claude_code.skill_activated`.
- Use an embedded local OTLP HTTP JSON logs endpoint when the user has not
  configured their own OTEL logs exporter.
- Correlate activation events to the current session/turn without using model
  output heuristics.
- Add provider runtime event type for skill activation.
- Update transcript chips from `sent` to `confirmed` only on native activation
  events.
- Leave Codex and Pi at `sent` unless stable native activation events are found
  before this phase starts.

### Acceptance Criteria

- [ ] `confirmed` appears only for provider-native activation events.
- [ ] Claude activation, if implemented, includes skill name and source in
      event metadata.
- [ ] No implementation parses assistant prose to infer skill usage.
- [ ] Codex and Pi continue to show `sent` unless their providers expose native
      activation events.
- [ ] Telemetry can be disabled or fails closed without breaking sessions.

### Manual Validation

- [ ] Enable the telemetry path for Claude Code.
- [ ] Run a prompt that activates a known Claude skill.
- [ ] Verify the transcript chip moves from `sent` to `confirmed`.
- [ ] Run a Codex and Pi prompt with selected skills and verify their chips
      remain `sent`.
- [ ] Disable telemetry and verify Claude sessions still work, with chips
      staying `sent`.

### Verification

- [ ] Re-read `docs/specs/first-class-skills.md` and this plan.
- [ ] Update Phase 8 management/polish details based on runtime status UX.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Likely Files Touched

- `electron/backend/provider/claude-code/*`
- `electron/backend/skills/*`
- `electron/backend/session/*`
- `src/widgets/session-view/*`

---

## Phase 8 - Management, Readiness, And Polish

**Goal:** Improve the browser into a durable skill management surface without
turning it into a marketplace or editor.

### Tasks

- Add dependency readiness display where provider metadata supports it.
- Link skill dependency concepts to MCP visibility without owning MCP config.
- Add Codex enable/disable if using `skills/config/write` is stable and tested.
- Add details actions:
  - reveal path in copyable text form
  - refresh provider
  - copy skill name/native invocation
- Add command center entry for "Browse skills".
- Add accessibility and keyboard navigation polish.
- Add release notes if the repo process requires them.

### Acceptance Criteria

- [ ] The browser clearly separates skill metadata from MCP/tool config.
- [ ] Dependencies show conservative states: `declared`, `available`,
      `needs-auth`, `needs-install`, or `unknown`.
- [ ] Any enable/disable action is provider-native and tested.
- [ ] Keyboard users can open the browser, search, select, inspect details, and
      close it.
- [ ] Skill rows and composer chips remain readable at narrow widths.

### Manual Validation

- [ ] Browse skills using only keyboard navigation.
- [ ] Toggle Codex skill enablement if included; refresh and verify state.
- [ ] Open MCP visibility and Skills browser side by side conceptually and
      verify the distinction is clear.
- [ ] Resize the app narrow and verify rows/chips do not overlap or truncate
      critical labels beyond usability.

### Verification

- [ ] Re-read `docs/specs/first-class-skills.md` and this plan.
- [ ] Document any deferred management features as follow-up specs/tickets.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

### Likely Files Touched

- `src/features/skills/*`
- `src/features/composer/*`
- `src/entities/skill/*`
- `electron/backend/skills/*`
- command center files if the entry is included

---

## Deferred Follow-Up Areas

- Skill marketplace browsing and installation.
- Skill creation and editing inside Convergence.
- Cross-provider skill sync or linking.
- Team/admin policy views.
- Automatic skill recommendations.
- Provider-specific skill eval/test harnesses.
- Rich dependency setup flows for MCP/app auth and package installation.
