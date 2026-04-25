# First-Class Skills Phase 7: Provider-Confirmed Activation Telemetry

Companion phase spec for `docs/specs/first-class-skills.md` and Phase 7 in
`docs/specs/first-class-skills-plan.md`.

## Goal

Move selected Claude Code skill chips from `sent` to `confirmed` only when
Claude Code emits a provider-native activation event.

Codex and Pi remain at `sent` because no stable activation event is available
in the provider surfaces Convergence currently uses.

## Current Code Anchors

- Claude Code runtime:
  - `electron/backend/provider/claude-code/claude-code-provider.ts`
- Shared skill status helpers:
  - `electron/backend/skills/skill-invocation.pure.ts`
- Transcript patching:
  - `electron/backend/provider/provider-session.emitter.ts`
- Phase 6 native invocation:
  - `electron/backend/skills/native-skill-invocation.pure.ts`

## Provider Signal

Claude Code documents the OpenTelemetry logs/events event
`claude_code.skill_activated`.

Important details for Convergence:

- Events are exported through OpenTelemetry logs/events when
  `OTEL_LOGS_EXPORTER` is configured.
- The event has `event.name: "skill_activated"`.
- It includes `skill.name` and `skill.source`.
- For user-defined and third-party plugin skills, `skill.name` is
  `"custom_skill"` unless `OTEL_LOG_TOOL_DETAILS=1`.

## Runtime Strategy

Use a best-effort embedded OTLP HTTP JSON logs sink for Claude Code sessions.

The sink is enabled only when:

- selected Claude skills are present for the turn
- Convergence has not been explicitly disabled with
  `CONVERGENCE_CLAUDE_SKILL_TELEMETRY=0` or
  `CONVERGENCE_DISABLE_CLAUDE_SKILL_TELEMETRY=1`
- the user has not already configured `OTEL_LOGS_EXPORTER` or an explicit
  logs endpoint

When enabled, Convergence starts a local `127.0.0.1` HTTP endpoint and adds
Claude subprocess environment values for logs only:

- `CLAUDE_CODE_ENABLE_TELEMETRY=1`
- `OTEL_LOGS_EXPORTER=otlp`
- `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/json`
- `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=<local endpoint>/v1/logs`
- `OTEL_LOG_TOOL_DETAILS=1`
- `OTEL_LOGS_EXPORT_INTERVAL=1000`

The sink parses OTLP JSON log payloads, extracts `skill_activated` events, and
patches only matching selected Claude skill chips to `confirmed`.

## Correlation Rule

Convergence confirms a skill only when all conditions hold:

- a recent Claude user message has selected skill metadata
- the OTel event is `skill_activated`
- the event has a concrete `skill.name`, not `"custom_skill"`
- `skill.name` exactly matches a selected skill's normalized `name`

No model text, tool output, filenames, or provider stdout content are used as
activation heuristics.

## Out Of Scope

- Parsing console exporter text output.
- Proxying or teeing user-configured OTEL logs to their own backend.
- Showing `confirmed` for Codex or Pi.
- Confirming unselected, auto-invoked skills.
- Enabling raw prompt/tool content telemetry.

## Acceptance Criteria

- [ ] Claude Code selected skill chips can move from `sent` to `confirmed`
      after a native `skill_activated` OTel event.
- [ ] `confirmed` is applied only to matching selected skill names.
- [ ] `custom_skill` placeholder events are ignored.
- [ ] Existing user OTEL logs configuration is not overwritten.
- [ ] If the local sink fails, Claude sessions still run and chips stay `sent`.
- [ ] Codex and Pi behavior is unchanged.

## Manual Validation

- [ ] Create/select a Claude skill and send a prompt that invokes it.
- [ ] Verify the chip first moves to `sent`.
- [ ] Verify it moves to `confirmed` only when the OTel activation event arrives.
- [ ] Set `CONVERGENCE_CLAUDE_SKILL_TELEMETRY=0`, restart the app/session, run
      the same prompt, and verify the chip stays `sent`.
- [ ] Set a custom `OTEL_LOGS_EXPORTER` before launch and verify Convergence
      does not override it.
- [ ] Run Codex and Pi selected-skill prompts and verify their chips stay
      `sent`.

## Verification

- [ ] Re-read `docs/specs/first-class-skills.md`.
- [ ] Re-read `docs/specs/first-class-skills-plan.md`.
- [ ] Update Phase 8 details based on runtime status UX.
- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Likely Files Touched

- `docs/specs/first-class-skills-plan.md`
- `electron/backend/provider/claude-code/*`
- `electron/backend/skills/*`
