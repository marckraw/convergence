# First-Class Skills Phase 4: Codex Native Invocation

Companion phase spec for `docs/specs/first-class-skills.md` and Phase 4 in
`docs/specs/first-class-skills-plan.md`.

## Goal

Invoke selected Codex skills through Codex app-server's native structured skill
input while preserving the Phase 3 transcript contract.

Phase 4 is Codex-only. Claude Code and Pi remain catalog/selection metadata
only until their provider-specific invocation phases.

## Current Code Anchors

- Codex user input serialization:
  - `electron/backend/provider/codex/codex-message.pure.ts`
- Codex session runtime:
  - `electron/backend/provider/codex/codex-provider.ts`
- Codex catalog mapping:
  - `electron/backend/skills/codex-skills.mapper.pure.ts`
  - `electron/backend/skills/skill-catalog.pure.ts`
- Phase 3 skill selection metadata:
  - `electron/backend/skills/skills.types.ts`
  - `electron/backend/session/session.service.ts`
  - `electron/backend/provider/provider.types.ts`

## In Scope

- Extend Codex user input with structured skill items:
  `{ type: 'skill', name, path }`.
- Add a Codex skill input marker in provider-only text input, using `$name`,
  without changing the visible transcript prompt.
- Validate selected Codex skills against a fresh native `skills/list` response
  on the active app-server connection before `turn/start`.
- Build skill invocation paths from the fresh catalog entry, not from renderer
  supplied metadata.
- Keep the user message chip as `selected` until `turn/start` accepts.
- Patch selected chips to `sent` after `turn/start` succeeds.
- Mark selected chips `unavailable` when a selected skill is missing, disabled,
  wrong-provider, or lacks a catalog path.
- Mark selected chips `failed` when Codex cannot refresh the catalog or rejects
  the turn after validation.
- Add focused serialization, validation, and provider-runtime tests.

## Out Of Scope

- Provider-confirmed `confirmed` state.
- Any heuristic skill activation detection from model text, tool calls, files,
  or logs.
- Claude Code or Pi invocation.
- Skill enable/disable, editing, installation, or marketplace flows.
- Copying full `SKILL.md` instructions into prompts.

## Runtime Strategy

For Codex session start and follow-up sends:

1. `SessionService` passes Phase 3 `skillSelections` to the provider.
2. `CodexProvider` calls `skills/list` on the active app-server RPC with the
   current working directory and `forceReload: true`.
3. The native catalog response is normalized with the same mapper used by the
   browser.
4. Each selection is resolved by stable catalog `id`.
5. If any selected skill cannot be resolved or invoked, the provider emits the
   user message with status `unavailable`, adds an error note, and fails the
   turn before `turn/start`.
6. If validation succeeds, the provider emits the user message with status
   `selected`, starts the turn with structured skill input, and patches the
   user message to `sent` after `turn/start` returns successfully.
7. If `turn/start` rejects after validation, the provider patches the selected
   chips to `failed`, adds the existing failure note, and fails the session.

## Codex Input Shape

`buildCodexUserInput()` should continue preserving existing attachment order:

1. image attachment items
2. one text item containing text attachments and the prompt
3. selected structured skill items

When skills are present, the provider-only text item includes one `$skill-name`
marker per selected skill before the user's text. The transcript user message
keeps the original user text.

Example:

```ts
const input = [
  { type: 'text', text: '$planning\n\nReview this change', text_elements: [] },
  { type: 'skill', name: 'planning', path: '/.../planning/SKILL.md' },
]
```

## Acceptance Criteria

- [ ] Codex `turn/start.input` includes structured skill items for selected
      skills.
- [ ] Codex skill input paths come from a fresh native catalog entry.
- [ ] User transcript chips move from `selected` to `sent` after `turn/start`
      accepts.
- [ ] Missing, disabled, wrong-provider, or pathless selected skills show
      `unavailable` and do not start a turn.
- [ ] Catalog refresh or `turn/start` failures show `failed`.
- [ ] No UI or transcript state says `confirmed`.
- [ ] Existing text, image, and text-attachment behavior is unchanged.

## Manual Validation

- [ ] Open a project with Codex available and at least one enabled skill.
- [ ] Select a harmless Codex skill from the composer and send a normal prompt.
- [ ] Confirm the turn starts and the transcript chip changes to `sent`.
- [ ] Confirm the transcript does not show `confirmed`.
- [ ] Send a prompt with a selected Codex skill plus an image attachment and
      verify the turn still starts.
- [ ] Remove or disable the skill outside Convergence, refresh stale UI if
      needed, send, and verify the transcript chip is `unavailable` with a clear
      error note.

## Verification

- [ ] Re-read `docs/specs/first-class-skills.md`.
- [ ] Re-read `docs/specs/first-class-skills-plan.md`.
- [ ] Update Phase 5 details if Codex invocation changes catalog assumptions.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Likely Files Touched

- `docs/specs/first-class-skills-plan.md`
- `electron/backend/provider/codex/codex-message.pure.ts`
- `electron/backend/provider/codex/codex-message.pure.test.ts`
- `electron/backend/provider/codex/codex-provider.ts`
- `electron/backend/provider/codex/codex-provider.test.ts`
- `electron/backend/skills/*`
