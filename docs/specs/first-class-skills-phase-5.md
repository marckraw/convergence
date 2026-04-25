# First-Class Skills Phase 5: Claude Code And Pi Catalogs

Companion phase spec for `docs/specs/first-class-skills.md` and Phase 5 in
`docs/specs/first-class-skills-plan.md`.

## Goal

Bring Claude Code and Pi into the Skills browser with conservative read-only
filesystem catalogs.

Codex remains native RPC. Claude Code and Pi use filesystem discovery in this
phase because Convergence does not currently have a stable native provider
catalog API for either provider.

## Current Code Anchors

- Skills backend:
  - `electron/backend/skills/skills.service.ts`
  - `electron/backend/skills/skill-catalog.pure.ts`
  - `electron/backend/skills/skills.types.ts`
- Provider detection:
  - `electron/backend/provider/detect.ts`
- Provider descriptors:
  - `electron/backend/provider/provider-descriptor.pure.ts`
  - `electron/backend/provider/provider.types.ts`
- Renderer browser already consumes provider-grouped catalogs from Phase 2:
  - `src/entities/skill/*`
  - `src/features/skills/*`

## In Scope

- Add a reusable read-only filesystem skill scanner for `SKILL.md` directories.
- Parse basic YAML frontmatter keys needed for listing:
  - `name`
  - `description`
  - `when_to_use`
  - `disable-model-invocation`
  - `user-invocable`
- Add warnings for invalid frontmatter, missing description, duplicate names,
  disabled/hidden skills, and provider-specific path invocation limits.
- Add Claude Code filesystem adapter for:
  - personal `~/.claude/skills/<skill-name>/SKILL.md`
  - project and nested project `.claude/skills/<skill-name>/SKILL.md`
  - plugin-like `skills/<skill-name>/SKILL.md` under `.claude/plugins`
- Add Pi filesystem adapter for:
  - global `~/.pi/agent/skills/`
  - global `~/.agents/skills/`
  - project and ancestor `.pi/skills/`
  - project and ancestor `.agents/skills/`
  - package `skills/` directories from project package roots
  - `skills` arrays in project/user `settings.json` files, constrained to
    project or user-home paths
- Keep all scans read-only and skip missing roots.

## Out Of Scope

- Native Claude Code catalog API discovery.
- Native Pi RPC catalog discovery.
- Skill invocation for Claude Code or Pi.
- Executing skill scripts or hooks.
- Enterprise-managed Claude settings and package manager/global plugin stores
  not represented in local project/user roots.
- Arbitrary settings paths outside the active project or current user's home.

## Runtime Strategy

`SkillsService.defaultCreateAdapter()` should return:

- `CodexSkillsService` for Codex, unchanged.
- `ClaudeCodeSkillsService` for Claude Code.
- `PiSkillsService` for Pi.

Each filesystem adapter returns a normal `ProviderSkillCatalog`:

- `catalogSource: 'filesystem'`
- `invocationSupport: 'native-command'`
- `activationConfirmation: 'native-event'` for Claude Code, because telemetry
  may confirm activation later
- `activationConfirmation: 'none'` for Pi

The scanner should preserve duplicate names as separate catalog entries and
then add duplicate warnings. It should not try to model provider precedence by
hiding lower-priority entries; the browser is a discovery surface.

## Acceptance Criteria

- [ ] Skills browser shows Claude Code and Pi provider sections when those
      binaries are detected.
- [ ] Project `.claude/skills/<name>/SKILL.md` entries appear as Claude Code
      project skills.
- [ ] Project `.pi/skills/<name>/SKILL.md` entries appear as Pi project skills.
- [ ] Duplicate names remain visible and receive duplicate warnings.
- [ ] Missing descriptions and invalid frontmatter are visible as warnings.
- [ ] Missing provider roots do not produce provider errors.
- [ ] No scan executes skill scripts or reads files outside allowed roots.

## Manual Validation

- [ ] Create `.claude/skills/example/SKILL.md` with valid frontmatter and
      refresh the Skills browser; verify Claude Code shows it.
- [ ] Create `.pi/skills/example/SKILL.md` with valid frontmatter and refresh;
      verify Pi shows it.
- [ ] Create same-name user and project skills and verify both are visible with
      duplicate warnings.
- [ ] Remove a skill and refresh; verify the catalog updates.
- [ ] Add malformed frontmatter to a test skill and verify an invalid
      frontmatter warning appears without crashing the catalog.

## Verification

- [ ] Re-read `docs/specs/first-class-skills.md`.
- [ ] Re-read `docs/specs/first-class-skills-plan.md`.
- [ ] Update Phase 6 details based on the catalog data actually available for
      Claude Code and Pi.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Likely Files Touched

- `docs/specs/first-class-skills-plan.md`
- `electron/backend/skills/*`
- `src/shared/types/skill.types.ts`
