# First-Class Skills Phase 3: Composer Selection And Transcript Metadata

Companion phase spec for `docs/specs/first-class-skills.md` and Phase 3 in
`docs/specs/first-class-skills-plan.md`.

## Goal

Let users select provider-catalog skills in the composer and persist those
selected skill refs on the user conversation item, without changing provider
invocation behavior yet.

This phase makes selection visible and durable. It should not send provider
native skill inputs, inject skill instructions into prompts, or claim a skill
was sent or activated.

## Current Code Anchors

- Phase 2 catalog/detail renderer state:
  - `src/entities/skill/*`
  - `src/features/skills/*`
- Composer:
  - `src/features/composer/composer.container.tsx`
  - `src/features/composer/composer.presentational.tsx`
- Session renderer API/model:
  - `src/entities/session/session.api.ts`
  - `src/entities/session/session.model.ts`
  - `src/entities/session/session.types.ts`
- Session backend persistence:
  - `electron/backend/session/session.service.ts`
  - `electron/backend/session/conversation-item.types.ts`
  - `electron/backend/session/conversation-item.pure.ts`
  - `electron/backend/provider/provider-session.emitter.ts`
- Provider runtime contract:
  - `electron/backend/provider/provider.types.ts`
- Transcript rendering:
  - `src/widgets/session-view/transcript-entry.presentational.tsx`

## In Scope

- Add a normalized `SkillSelection` type with an explicit status.
- Add composer selection state for active-provider catalog entries.
- Replace the Phase 2 composer browse-only Skills button with a searchable
  picker.
- Add removable selected skill chips in the composer.
- Extend session start and send-message inputs with `skillSelections`.
- Persist selected refs on user message payload JSON in
  `session_conversation_items`.
- Render selected skill chips on user messages in the transcript.
- Keep provider adapters accepting the widened signature but ignoring skills.
- Add tests for selection filtering, session persistence, and transcript chips.

## Out Of Scope

- Codex structured skill input.
- Claude Code or Pi skill prompt commands.
- `sent`, `confirmed`, `failed`, or `unavailable` transitions.
- Provider-side validation of stale selections.
- Skill instructions copied into prompts.
- Editing, installing, or enabling/disabling skills.

## Data Contract

Add a shared `SkillSelection` shape derived from a provider catalog entry:

```ts
export type SkillInvocationStatus =
  | 'selected'
  | 'sent'
  | 'confirmed'
  | 'unavailable'
  | 'failed'

export interface SkillSelection extends SkillRef {
  id: string
  providerName: string
  displayName: string
  sourceLabel: string
  status: SkillInvocationStatus
  argumentText?: string
}
```

Phase 3 only writes `status: 'selected'`. Later provider invocation phases may
move persisted chips to `sent`, `confirmed`, `failed`, or `unavailable`.

## Runtime Strategy

Do not pass skills into provider-native invocation yet.

`SessionService` should follow the existing pending attachment metadata
pattern:

1. Renderer sends `skillSelections` with `session:start` or
   `session:sendMessage`.
2. `SessionService` stores those selections as pending user metadata.
3. Provider emits its normal user-message conversation item.
4. `SessionService.addConversationItem()` attaches pending selections to that
   user message before writing `payload_json`.
5. Provider `start()` and `sendMessage()` signatures accept optional skill
   selections but ignore them in this phase.

This keeps transcript metadata durable without creating fake provider
activation semantics.

## Composer Behavior

- The composer Skills button opens a compact searchable popover scoped to the
  active provider.
- Rows show skill name, short description, scope, provider, and warning count.
- Selecting a row toggles a skill chip in the composer.
- Selected chips show `selected` and can be removed before send.
- The popover includes a Browse all action that opens the Phase 2 Skills
  browser.
- Changing project, active session, or active provider clears incompatible
  selected skills.

## Transcript Behavior

User messages with `skillSelections` show chips near the user label.

Phase 3 chips must display `selected`, not `sent`, `using`, `used`,
`activated`, or `confirmed`.

## Acceptance Criteria

- [ ] User can select and remove a skill before sending.
- [ ] Skill chips are included on the user message after send.
- [ ] Skill refs survive app reload through `session_conversation_items`.
- [ ] Existing attachment behavior is unchanged.
- [ ] Provider adapters compile with the widened `sendMessage` signature.
- [ ] UI labels selections as `selected`; no provider activation is implied.

## Manual Validation

- [ ] Open a project with Codex skills available.
- [ ] Open the composer Skills picker and search for a known active-provider
      skill.
- [ ] Select a skill and confirm a removable `selected` chip appears.
- [ ] Send a normal prompt and confirm the user transcript message shows the
      selected skill chip.
- [ ] Restart the app and confirm the transcript chip is still present.
- [ ] Send a prompt with both an attachment and a selected skill; verify both
      metadata surfaces remain visible.
- [ ] Confirm the agent behavior has not changed yet because provider
      invocation is intentionally disabled in this phase.

## Verification

- [ ] Re-read `docs/specs/first-class-skills.md`.
- [ ] Re-read `docs/specs/first-class-skills-plan.md`.
- [ ] Update Phase 4 details if session metadata shape changed.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Likely Files Touched

- `docs/specs/first-class-skills-plan.md`
- `src/shared/types/skill.types.ts`
- `electron/backend/skills/skills.types.ts`
- `src/entities/skill/*`
- `src/features/composer/*`
- `src/entities/session/*`
- `src/widgets/session-view/*`
- `electron/backend/session/*`
- `electron/backend/provider/provider.types.ts`
- `electron/backend/provider/provider-session.emitter.ts`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/shared/types/electron-api.d.ts`
