# First-Class Skills Phase 8: Management, Readiness, And Polish

Companion phase spec for `docs/specs/first-class-skills.md` and Phase 8 in
`docs/specs/first-class-skills-plan.md`.

## Goal

Turn the Skills browser from a catalog viewer into a durable discovery and
inspection surface without adding an independent skill marketplace, editor, or
runtime.

This phase stays UI-first and provider-native. It should make a large skill
catalog easier to understand, copy from, refresh, and relate to MCP/app/tool
readiness.

## Current Code Anchors

- Browser container:
  - `src/features/skills/skills-browser.container.tsx`
- Browser filtering and derived view helpers:
  - `src/features/skills/skills-browser.pure.ts`
- Browser rendering:
  - `src/features/skills/skills-browser.presentational.tsx`
- Catalog/detail state:
  - `src/entities/skill/skill.model.ts`
- Normalized catalog types:
  - `src/shared/types/skill.types.ts`
  - `electron/backend/skills/skills.types.ts`
- Command center entry:
  - `src/features/command-center/command-palette-index.pure.ts`

## Scope

### Included

- Add dependency readiness filtering to the browser for states already present
  in normalized provider metadata: `declared`, `available`, `needs-auth`,
  `needs-install`, and `unknown`.
- Improve dependency rendering so state is visible directly on each dependency
  instead of only being appended as text.
- Add an MCP visibility cross-link when the selected skill declares MCP
  dependencies. This opens the existing MCP Servers dialog and does not own MCP
  configuration.
- Add details actions for copying:
  - `SKILL.md` path
  - skill name
  - provider-native invocation text
- Keep the existing full catalog refresh action.
- Keep the existing command center Skills entry and document it as already
  satisfied by the current code.

### Deferred

- Codex enable/disable via `skills/config/write`. This remains deferred until
  there is a small, tested backend write contract with clear cache invalidation.
- Skill editing and creation.
- Marketplace browsing or installation.
- MCP/app authentication setup flows.
- Automatic dependency probing for filesystem skills beyond provider-reported
  metadata.

## Native Invocation Copy Text

The browser may copy provider-native invocation syntax as reference text, but
runtime invocation remains owned by provider adapters.

- Codex: `$<skill-name>`
- Claude Code: `/<skill-name>`
- Pi: `/skill:<skill-name>`

For unsupported providers or future provider states, the copy action should be
disabled rather than inventing syntax.

## Acceptance Criteria

- [ ] Users can filter the browser by dependency readiness state.
- [ ] Dependency rows/badges show both dependency kind and readiness state.
- [ ] Skills with MCP dependencies expose a clear action to open MCP Servers.
- [ ] Users can copy path, skill name, and native invocation syntax from the
      details pane when available.
- [ ] The Skills command center entry remains available.
- [ ] Codex enable/disable is not partially implemented.

## Manual Validation

- [ ] Open the Skills browser from the composer and from Cmd+K -> Skills.
- [ ] Select a skill with dependencies and verify the dependency state appears
      clearly.
- [ ] Use the dependency readiness filter and verify only matching skills remain.
- [ ] For a skill with an MCP dependency, click the MCP action and verify the MCP
      Servers dialog opens.
- [ ] Copy the skill name, path, and native invocation text; paste each into a
      scratch field and verify the values.
- [ ] Refresh the catalog and confirm the selected details remain coherent or
      clear if the selected skill disappeared.

## Verification

- [ ] Re-read `docs/specs/first-class-skills.md`.
- [ ] Re-read `docs/specs/first-class-skills-plan.md`.
- [ ] Document any remaining management features as deferred follow-ups.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Likely Files Touched

- `docs/specs/first-class-skills-plan.md`
- `src/features/skills/*`
- `src/entities/skill/*`
