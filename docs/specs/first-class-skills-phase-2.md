# First-Class Skills Phase 2: Browser And Details

Companion phase spec for `docs/specs/first-class-skills.md` and Phase 2 in
`docs/specs/first-class-skills-plan.md`.

## Goal

Add a read-only skill browser that makes provider-discovered skills searchable
and understandable before Convergence starts attaching skill selections to
composer turns.

This phase should let a user inspect the catalog from Phase 1, open one skill,
and read the full provider-backed `SKILL.md` details. It should not invoke
skills, edit skills, install skills, or claim activation.

## Current Code Anchors

- Phase 1 catalog backend:
  - `electron/backend/skills/skills.service.ts`
  - `electron/backend/skills/skills.types.ts`
  - `electron/backend/skills/codex-skills.service.ts`
- IPC/preload/type bridge:
  - `electron/main/ipc.ts`
  - `electron/preload/index.ts`
  - `src/shared/types/electron-api.d.ts`
  - `src/shared/types/skill.types.ts`
- Similar project-scoped dialogs:
  - `src/features/mcp-servers/mcp-servers.container.tsx`
  - `src/features/mcp-servers/mcp-servers.presentational.tsx`
- Dialog orchestration:
  - `src/entities/dialog/*`
  - `src/widgets/sidebar/sidebar.container.tsx`
- Composer toolbar entry:
  - `src/features/composer/composer.container.tsx`
  - `src/features/composer/composer.presentational.tsx`

## In Scope

- Add a catalog-backed backend details read for a skill.
- Restrict details reads to entries that are currently present in the provider
  catalog for the selected project.
- Read only the resolved `SKILL.md` markdown and summarize first-level resource
  folders such as `scripts`, `references`, and `assets`.
- Add `src/entities/skill` API/model/types.
- Add a full Skills browser dialog under `src/features/skills`.
- Add search and filters for provider, scope, enabled state, and warnings.
- Add a compact composer toolbar button that opens the browser.
- Add a sidebar/footer entry for project-level browsing if useful for manual
  discovery.
- Add focused tests for browser filtering/rendering and details read safety.

## Out Of Scope

- Skill invocation.
- Skill selection chips in the composer.
- Transcript metadata.
- Runtime activation confirmation.
- Skill editing, installation, marketplace browsing, or creation.
- Filesystem discovery beyond provider catalog refs.
- Executing skill scripts or reading arbitrary referenced files.
- Cross-provider dedupe.

## Backend Details Contract

Extend the existing skills IPC contract with:

```ts
export interface SkillDetailsRequest {
  projectId: string
  providerId: SkillProviderId
  skillId: string
  path: string
}

export interface SkillResourceSummary {
  kind: 'script' | 'reference' | 'asset' | 'other'
  name: string
  relativePath: string
}

export interface SkillDetails {
  skillId: string
  providerId: SkillProviderId
  path: string
  markdown: string
  sizeBytes: number
  resources: SkillResourceSummary[]
}
```

`SkillsService.readDetails()` must:

1. Resolve the project by ID.
2. Refresh or read the provider catalog for that project.
3. Find a catalog entry matching `providerId`, `skillId`, and `path`.
4. Reject the request if the entry is missing, has no path, or does not point to
   a `SKILL.md` file.
5. Read the markdown file with a conservative size cap.
6. Return resource summaries from the skill directory without executing or
   opening resource contents.

This intentionally validates against the native provider catalog instead of
accepting arbitrary paths from the renderer.

## Renderer Behavior

Add a Skills browser dialog that can be opened from composer and project UI.

The browser should show:

- project name and refresh state
- provider-grouped catalog entries
- search across name, description, provider, scope, and path
- filters for provider, scope, enabled state, and warnings
- duplicate and missing-path warnings on rows
- selected skill details with:
  - provider
  - scope and raw scope
  - enabled state
  - path
  - dependencies
  - warnings
  - resources summary
  - rendered full `SKILL.md`

States that must be visible:

- no active project
- loading catalog
- provider returned an error
- empty catalog
- no search results
- details loading
- details read failure

## UX Notes

- Keep the composer entry compact. Phase 2 opens browsing only; it does not
  imply a skill has been selected for a prompt.
- Preserve provider grouping and duplicate entries. Disambiguate duplicates by
  provider, scope, and path rather than hiding them.
- Use "selected" only for the currently highlighted details row in the browser.
  Do not use "using", "used", "activated", or "confirmed" in this phase.
- Keep the browser read-only.

## Acceptance Criteria

- [ ] The browser lists Codex skills from Phase 1.
- [ ] Search matches name, description, provider, scope, and path.
- [ ] Filters narrow results by provider, scope, enabled state, and warnings.
- [ ] Opening a skill shows full `SKILL.md`, path, provider, scope, enabled
      state, dependencies, warnings, and resource summary.
- [ ] Details reads are path-restricted to current catalog refs.
- [ ] Empty, loading, provider-error, and details-error states are visible and
      tested.
- [ ] The UI remains provider-grouped and does not dedupe skills across
      providers.
- [ ] Composer invocation behavior is unchanged.

## Manual Validation

- [ ] Start the app with Codex available and a project selected.
- [ ] Open the Skills browser from the composer toolbar.
- [ ] Open the Skills browser from the project/sidebar entry if present.
- [ ] Search for a known skill and open it.
- [ ] Confirm the details pane matches the local `SKILL.md`.
- [ ] Confirm duplicate names remain distinguishable by provider/scope/path.
- [ ] Toggle filters and confirm the list updates without losing provider
      grouping.
- [ ] Temporarily rename or remove a catalog-backed skill file, refresh, and
      verify the details pane shows a clear read failure.
- [ ] Send a normal composer prompt and confirm skill browsing did not affect
      the message payload.

## Verification

- [ ] Re-read `docs/specs/first-class-skills.md`.
- [ ] Re-read `docs/specs/first-class-skills-plan.md`.
- [ ] Update Phase 3 details if the renderer state shape changed.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Likely Files Touched

- `docs/specs/first-class-skills-plan.md`
- `electron/backend/skills/*`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/shared/types/skill.types.ts`
- `src/shared/types/electron-api.d.ts`
- `src/entities/skill/*`
- `src/features/skills/*`
- `src/features/composer/*`
- `src/features/index.ts`
- `src/widgets/sidebar/sidebar.container.tsx`
