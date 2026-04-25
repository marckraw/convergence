# First-Class Skills Phase 6: Claude Code And Pi Native Invocation

Companion phase spec for `docs/specs/first-class-skills.md` and Phase 6 in
`docs/specs/first-class-skills-plan.md`.

## Goal

Invoke selected Claude Code and Pi skills through their native command syntax,
while keeping transcript state honest.

Codex already uses structured app-server skill input. This phase adds the
equivalent send-time path for providers whose native interface is prompt-command
based.

## Current Code Anchors

- Existing Codex validation and status behavior:
  - `electron/backend/skills/codex-skill-invocation.pure.ts`
  - `electron/backend/provider/codex/codex-provider.ts`
- Claude Code runtime:
  - `electron/backend/provider/claude-code/claude-code-provider.ts`
  - `electron/backend/provider/claude-code/claude-code-message.pure.ts`
- Pi runtime:
  - `electron/backend/provider/pi/pi-provider.ts`
  - `electron/backend/provider/pi/pi-message.pure.ts`
- Filesystem catalogs from Phase 5:
  - `electron/backend/skills/claude-code-skills.service.ts`
  - `electron/backend/skills/pi-skills.service.ts`

## Native Command Syntax

- Claude Code skills are invoked directly with `/skill-name`. The skill
  `name` field becomes the slash command.
- Pi skills are invoked with `/skill:name`.

Convergence should prepend these commands only to the provider-bound prompt.
The transcript user message should keep the user's original text and represent
selected skills through chip metadata.

## In Scope

- Add shared native skill invocation resolution for prompt-command providers.
- Validate selected Claude Code and Pi skills against a fresh provider catalog
  immediately before send.
- Reject stale, disabled, wrong-provider, or ambiguous duplicate-name
  selections.
- Build provider prompt text by prepending native commands:
  - Claude Code: `/name`
  - Pi: `/skill:name`
- Preserve selected skill chips on the user message.
- Patch selected skill chips to `sent` after the prompt is accepted by the
  provider boundary.
- Patch selected skill chips to `unavailable` or `failed` for validation or
  send failures.

## Out Of Scope

- Confirming provider activation. This remains Phase 7 telemetry work.
- Exact-path invocation for Claude Code or Pi. Phase 5 filesystem paths are
  catalog/detail anchors only.
- Provider precedence modeling for duplicate skill names. Duplicate name
  selections are blocked until precedence is proven deterministic in this
  runtime path.
- Copying full `SKILL.md` contents into prompts.
- Terminal UI slash-command autocomplete.

## Runtime Strategy

Add a provider-neutral helper under `electron/backend/skills` that accepts:

- provider id/name
- provider catalog
- selected skill refs
- command syntax

It returns either:

- a validated command prefix and catalog-backed selections with status
  `selected`, or
- a validation failure with selections marked `unavailable` or `failed`.

Provider runtimes should:

1. Resolve selected skills with `forceReload: true`.
2. Add the transcript user message using the original user text.
3. If validation fails, add a provider note and fail the turn without spawning
   or sending a command.
4. Send a provider-only prompt with native skill commands prepended.
5. Patch chips to `sent` once the provider boundary accepts the prompt.

## Acceptance Criteria

- [ ] Claude Code selected skills are sent as `/name` commands.
- [ ] Pi selected skills are sent as `/skill:name` commands.
- [ ] Transcript user message text does not include injected slash commands.
- [ ] Stale and disabled selected skills fail with visible chip status.
- [ ] Duplicate selected skill names fail with a clear ambiguity message.
- [ ] Chips move to `sent`, not `confirmed`, after provider send acceptance.
- [ ] Unit tests cover command formatting, provider mismatch, stale skills,
      disabled skills, and duplicate ambiguity.

## Manual Validation

- [ ] Create `.claude/skills/example/SKILL.md`, select it, send a prompt, and
      verify Claude Code starts the turn.
- [ ] Confirm the transcript chip changes from `selected` to `sent`.
- [ ] Create `.pi/skills/example/SKILL.md`, select it, send a prompt, and
      verify Pi starts the turn.
- [ ] Confirm the Pi transcript chip changes from `selected` to `sent`.
- [ ] Create duplicate same-name skills for one provider, select one, send, and
      verify the turn is blocked with an ambiguity note.
- [ ] Remove a selected skill from disk, refresh/send, and verify it is marked
      `unavailable`.

## Verification

- [ ] Re-read `docs/specs/first-class-skills.md`.
- [ ] Re-read `docs/specs/first-class-skills-plan.md`.
- [ ] Update Phase 7 telemetry details based on any runtime signal findings.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Likely Files Touched

- `docs/specs/first-class-skills-plan.md`
- `electron/backend/provider/claude-code/*`
- `electron/backend/provider/pi/*`
- `electron/backend/skills/*`
