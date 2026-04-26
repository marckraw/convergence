# Mid-Run Session Input - Implementation Plan

Companion to `docs/specs/mid-run-session-input.md`.

Work is sliced into phases so each phase is independently reviewable and can be
reverted without disturbing later provider work. Verification after every phase
means:

- `npm install`
- `npm run typecheck`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

All Node-backed commands must run through the `.nvmrc` runtime.

## Implementation Status - April 26, 2026

Completed in the current implementation:

- P1 capability types and pure composer policy.
- P2 persisted queued input model, backend service methods, IPC/preload, and
  renderer store wiring.
- P3 capability-gated composer UX, running-mode selector, visible queue rows,
  and queued-input cancellation.
- P4 Pi native `follow_up` and `steer` dispatch paths.
- P5 Codex active turn tracking, app-managed follow-up queueing, `turn/steer`,
  and existing provider user-input answer flow preservation.
- P8 lightweight architecture documentation, changeset, and automated
  verification.

Remaining work:

- P0 live protocol preflight/smoke testing against the locally installed
  provider binaries.
- P5 interrupt confirmation UX. The Codex adapter has a guarded
  `turn/interrupt` path, but the composer does not expose interrupt in V1.
- P6/P7 Claude long-lived CLI streaming-input spike and implementation. V1
  deliberately keeps Claude to app-managed running follow-up only. See
  `docs/specs/claude-cli-streaming-input-roadmap.md`.
- P8 manual provider matrix and release smoke notes.

## P0 - Protocol Preflight

Goal: lock down exact provider protocol shapes before implementation.

- [ ] Record local versions:
  - [ ] `claude --version`
  - [ ] `codex --version`
  - [ ] `pi --version`
- [ ] Regenerate Codex protocol types into `/tmp`:
  - [ ] Confirm `TurnSteerParams.expectedTurnId`.
  - [ ] Confirm `TurnInterruptParams.turnId`.
  - [ ] Confirm `TurnStartedNotification.turn.id`.
- [ ] Pi smoke in a throwaway repo:
  - [ ] Send `steer` while a tool run is active.
  - [ ] Send `follow_up` while a tool run is active.
  - [ ] Confirm response ids are correlated and event stream remains normal.
- [ ] Claude CLI spike:
  - [ ] Confirm CLI long-lived `--input-format stream-json` stdin can stay
        open across multiple user messages.
  - [ ] Confirm whether interruption is exposed through CLI stream-json.
  - [ ] Keep the SDK package/API-key path out of scope for the Claude provider.
- [ ] Document any local-version deviations in
      `docs/specs/mid-run-session-input.md`.

Exit criteria:

- No product code changed.
- We know which provider features are safe to advertise in P1.

## P1 - Capability Types And Pure Policy

Goal: add provider capability metadata and pure mode-selection logic. No runtime
behavior change.

- [ ] `electron/backend/provider/provider.types.ts`
  - [ ] Add `MidRunInputMode`.
  - [ ] Add `ProviderMidRunInputCapability`.
  - [ ] Add optional `ProviderSendMessageOptions` for future widening.
  - [ ] Add `ProviderDescriptor.midRunInput`.
- [ ] `electron/backend/provider/provider-descriptor.pure.ts`
  - [ ] Add default capability constants for Claude Code, Codex, Pi, Shell.
  - [ ] Shell capability is all false.
  - [ ] Claude starts with only app-queued follow-up if P2 is present;
        otherwise all running modes false.
  - [ ] Codex advertises answer, steer, interrupt, app-queued follow-up.
  - [ ] Pi advertises native follow-up and steer.
- [ ] Renderer mirror types in `src/entities/session/session.types.ts`.
- [ ] New pure helper, likely `src/features/composer/mid-run-input.pure.ts`:
  - [ ] Derive available modes from session status, attention, provider
        capability, and queue availability.
  - [ ] Derive default mode.
  - [ ] Derive disabled reason.
- [ ] Tests:
  - [ ] Running provider with no capability stays disabled.
  - [ ] Running Codex defaults to follow-up and offers steer.
  - [ ] Running Pi defaults to follow-up and offers steer.
  - [ ] Needs-input returns answer only.
  - [ ] Completed session returns normal.

Exit criteria:

- All descriptors carry explicit capabilities.
- UI behavior is unchanged except internal helper tests exist.

Rollback:

- Revert P1 without touching provider runtime.

## P2 - Queued Input Model And Service

Goal: add Convergence-owned queue plumbing for app-managed follow-ups. Provider
dispatch remains disabled until a later phase wires it in.

- [ ] Database:
  - [ ] Add `session_queued_inputs` table.
  - [ ] Add session/state index.
  - [ ] Add startup cleanup from stale `dispatching` -> `failed`.
- [ ] Backend types:
  - [ ] `SessionQueuedInput`.
  - [ ] `QueuedInputState`.
  - [ ] Queue create/cancel/mark-dispatching/mark-sent/mark-failed methods.
- [ ] Backend service:
  - [ ] `SessionQueuedInputService` or focused methods inside
        `SessionService` if smaller.
  - [ ] Persist queued follow-up only after attachments rebind successfully.
  - [ ] Broadcast queue patches over IPC.
  - [ ] Cancel only when `state === "queued"`.
- [ ] IPC/preload:
  - [ ] `sessionQueuedInputs:getForSession`.
  - [ ] `sessionQueuedInputs:cancel`.
  - [ ] `sessionQueuedInputs:onPatched`.
- [ ] Renderer entity:
  - [ ] `src/entities/session-queued-input/` or colocated under
        `src/entities/session/` if tiny.
  - [ ] Zustand store for active session queue.
- [ ] Tests:
  - [ ] DB persistence and ordering.
  - [ ] Cancel transitions.
  - [ ] Stale dispatching cleanup.
  - [ ] Renderer reducer/store.

Exit criteria:

- Queue can be created and rendered in tests, but composer still does not send
  running input through it.

Rollback:

- Revert P2 database/service slice; provider behavior remains unchanged.

## P3 - Composer UX Behind Capability Gate

Goal: enable the composer only for modes the backend can accept. Still no
provider-specific mid-run transport changes beyond app queue creation.

- [ ] `ComposerContainer`:
  - [ ] Replace `isComposerDisabled` boolean with pure helper result.
  - [ ] Hide provider/model/effort selectors for continued sessions as today.
  - [ ] Show mode selector only when running and more than one mode is
        available.
  - [ ] Use follow-up as default while running.
  - [ ] Keep `needs-input` placeholder and routing unchanged.
- [ ] `Composer` presentational:
  - [ ] Add compact segmented control for `Follow-up` / `Steer` when provided.
  - [ ] Show a quiet single-mode label when only one running mode is available.
  - [ ] Do not show instructional copy in-app beyond labels/tooltips.
- [ ] Queue UI:
  - [ ] Render queued follow-up pills near composer.
  - [ ] Cancel button for queued local follow-ups.
- [ ] `sessionApi.sendMessage`:
  - [ ] Accept `deliveryMode`.
  - [ ] Preserve old call signature where mode omitted.
- [ ] Tests:
  - [ ] Existing composer tests still pass.
  - [ ] Running with no modes disabled.
  - [ ] Running with follow-up enabled sends `deliveryMode: "follow-up"`.
  - [ ] Needs-input sends `deliveryMode: "answer"` and hides selector.
  - [ ] Draft text/attachments clear only after backend acceptance.

Exit criteria:

- App-managed follow-up can be queued visibly.
- No provider receives steer/interrupt yet.

Rollback:

- Revert P3 UI/API layer; P1/P2 remain dormant.

## P4 - Pi Native Follow-Up And Steer

Goal: implement the safest native provider first.

- [ ] `electron/backend/provider/pi/pi-provider.ts`
  - [ ] Widen `sendMessage` to receive `ProviderSendMessageOptions`.
  - [ ] `deliveryMode: "follow-up"` sends `{ type: "follow_up", ... }`.
  - [ ] `deliveryMode: "steer"` sends `{ type: "steer", ... }`.
  - [ ] Keep existing `prompt` path for `normal`.
  - [ ] Keep `answer` unsupported unless a real Pi input request is added.
  - [ ] Mark queue item sent/failed based on Pi response.
- [ ] `pi-message.pure.ts`
  - [ ] Reuse existing image/text serialization for follow-up and steer.
  - [ ] Keep PDF rejection unchanged.
- [ ] Session queue drain:
  - [ ] Native follow-up can skip app queue after Pi accepts.
  - [ ] App queue remains available as fallback only if direct command is
        disabled by version probe.
- [ ] Tests:
  - [ ] Pi follow-up wire shape.
  - [ ] Pi steer wire shape.
  - [ ] Rejection marks queued input failed without failing session.
  - [ ] Normal prompt path unchanged.

Exit criteria:

- Pi users can send follow-up and steer while running.
- Existing Pi normal send, attachments, skills, continuation still pass.

Rollback:

- Revert P4 provider patch; composer falls back to app queue or disabled based
  on capability.

## P5 - Codex Active Turn Tracking, Steer, Interrupt

Goal: wire Codex to current app-server turn controls.

- [ ] Track active Codex provider turn:
  - [ ] Read `turn.id` from `turn/started`.
  - [ ] Clear on `turn/completed`, `turn/interrupt`, `error`, process exit.
  - [ ] Store provider turn id separately from Convergence `turnId`.
- [ ] `deliveryMode: "steer"`:
  - [ ] Require active provider turn id.
  - [ ] Call `turn/steer` with `expectedTurnId`.
  - [ ] Use existing `buildCodexUserInput`.
  - [ ] Mark accepted/rejected queue state correctly.
- [ ] `deliveryMode: "follow-up"`:
  - [ ] Do not call `turn/start` while active provider turn id exists.
  - [ ] Queue in Convergence.
  - [ ] Drain queue in order after `turn/completed`.
- [ ] `deliveryMode: "interrupt"`:
  - [ ] Confirm action in UI.
  - [ ] Call `turn/interrupt`.
  - [ ] After interruption settles, start replacement as a normal turn.
  - [ ] Preserve partial assistant text as complete or interrupted note,
        depending on emitted events.
- [ ] Keep existing pending user-input path:
  - [ ] `answer` responds to `item/tool/requestUserInput`.
  - [ ] Do not create queued inputs for answers.
- [ ] Tests:
  - [ ] `turn/started` stores active id.
  - [ ] steer sends `turn/steer` with `expectedTurnId`.
  - [ ] stale steer failure marks only queued input failed.
  - [ ] follow-up during active run queues, then drains after complete.
  - [ ] request-user-input remains current behavior.
  - [ ] no duplicate user transcript messages.

Exit criteria:

- Codex supports steer and app-managed follow-up safely.
- No concurrent `turn/start` is sent while active.

Rollback:

- Revert P5 provider patch; Pi remains unaffected.

## P6 - Claude CLI Adapter Refactor Spike

Goal: decide the long-lived Claude CLI implementation path with throwaway code
and smoke tests before changing production behavior. Do not use
`@anthropic-ai/claude-agent-sdk`; this provider must continue to run through the
user's installed and authenticated `claude` CLI.

- [ ] Prototype CLI long-lived stream-json mode:
  - [ ] Spawn once with `--input-format stream-json`.
  - [ ] Keep stdin open.
  - [ ] Send multiple user lines.
  - [ ] Verify result boundaries.
  - [ ] Verify session id and resume behavior.
- [ ] Confirm the SDK package/API-key path stays out of scope:
  - [ ] Do not add `@anthropic-ai/claude-agent-sdk`.
  - [ ] Do not require `ANTHROPIC_API_KEY`.
  - [ ] Preserve local Claude Code CLI authentication.
- [ ] Compare:
  - [ ] Implementation risk.
  - [ ] Compatibility with attachments.
  - [ ] Compatibility with skills telemetry.
  - [ ] Approval/user-input support.
  - [ ] Stop/interrupt behavior.
- [ ] Update spec with selected path.

Exit criteria:

- Written decision in the spec.
- No production adapter change yet.

Rollback:

- Delete spike artifacts.

## P7 - Claude CLI Implementation

Goal: implement the selected Claude path from P6.

- [ ] Preserve existing normal follow-up/resume behavior.
- [ ] Add app-managed follow-up while running.
- [ ] Add native queued messages only if selected path proves stable.
- [ ] Add interrupt only if provider surface supports it clearly.
- [ ] Keep `--dangerously-skip-permissions` approval behavior unchanged unless
      a separate permissions spec changes it.
- [ ] Tests:
  - [ ] Existing Claude tests unchanged.
  - [ ] Running follow-up queue drains after result.
  - [ ] No mid-turn send is dropped.
  - [ ] Attachments still serialize.
  - [ ] Continuation recovery still works.

Exit criteria:

- Claude no longer silently drops mid-run sends.
- Advertised capabilities match implementation.

Rollback:

- Revert P7 only; capability falls back to app queue/disabled.

## P8 - Hardening And Release Prep

Goal: cross-provider polish and release confidence.

- [ ] Add provider capability notes to `docs/architecture/quick-reference.md`.
- [ ] Add changelog/changeset.
- [ ] Manual matrix:
  - [ ] Claude normal follow-up after completion.
  - [ ] Claude running follow-up behavior selected in P7.
  - [ ] Codex follow-up, steer, answer, interrupt.
  - [ ] Pi follow-up and steer.
  - [ ] Attachments with queued input for each provider that supports them.
  - [ ] Skills with queued input for each provider that supports them.
- [ ] Run non-fix chaperone if formatter touched broad files:
  - [ ] `chaperone check`
- [ ] Verify no dirty files outside intended scope.

Exit criteria:

- Full verification passes.
- Manual smoke results recorded in this plan or release notes.

## Rollback Strategy

- P1-P3 are additive infrastructure and UI gating.
- P4-P5 are independent provider patches.
- P6 is research only.
- P7 is Claude-only and intentionally last because it has the largest adapter
  risk.
- P8 contains documentation and release prep only.

If any provider rollout regresses, revert that provider phase and adjust its
capability descriptor to remove the mode. Do not revert the shared capability
or queue primitives unless they are directly broken.
