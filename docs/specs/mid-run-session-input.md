# Mid-Run Session Input - Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: normalized conversations, real providers, session attachments,
> first-class skills, global status bar
> Research validated: April 26, 2026. Claude CLI and streaming-input docs,
> Codex app-server generated protocol, OpenAI Codex App Server write-up, Pi RPC
> docs.

## Implementation Status

V1 is implemented for shared capability gating, app-managed queued follow-up,
Codex steering, and Pi native follow-up/steer. Claude Code intentionally
advertises only app-managed running follow-up until the separate streaming
adapter spike/refactor is complete.

## Objective

Let users send useful input to an agent while the agent is already working,
without collapsing provider-specific semantics into one unsafe "send while
running" behavior.

The current app blocks the composer for active sessions unless the provider has
explicitly requested input. That prevents important workflows:

- "Also check this file when you are done."
- "Actually, do not migrate that part."
- "Use the simpler implementation."
- "Here is the answer to the question you asked."

The product goal is to unblock these workflows while preserving the current
safe behavior for providers and states that cannot support them.

## Current State

### Renderer

`src/features/composer/composer.container.tsx` disables the composer whenever:

```ts
activeSession?.status === 'running' && activeSession.attention !== 'needs-input'
```

### Session Service

`SessionService.sendMessage()` already forwards input to an active provider
handle when one exists. If no handle exists, it resumes providers with
continuation support.

### Providers

The three real providers do not have equivalent mid-run semantics:

| Provider    | Current Convergence behavior                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `sendMessage()` calls `startTurn()`, but `startTurn()` returns while a child process is active. Mid-turn sends are effectively dropped if the UI allowed them.                   |
| Codex       | `sendMessage()` can use the active app-server connection, but it currently calls `turn/start` even during active work. It does not use current `turn/steer` or `turn/interrupt`. |
| Pi          | `sendMessage()` sends a `prompt`; when `isStreaming` it adds `streamingBehavior: "steer"`. It does not expose native `follow_up` yet.                                            |

## Upstream Behavior

### Claude Code

Claude documents streaming input as the recommended mode for rich interactive
applications. For Convergence's Claude provider, the future path should be the
local `claude` CLI with long-lived stream-json stdin/stdout, not the
`@anthropic-ai/claude-agent-sdk` package or an Anthropic API-key requirement.

The single-message mode is explicitly more limited: it does not support dynamic
message queueing, real-time interruption, hook integration, direct image
attachments, or natural multi-turn conversations.

Implication for Convergence:

- The current spawn-per-turn Claude adapter is acceptable for ordinary
  follow-up after a completed turn.
- It is not the right foundation for true mid-run steering or interruption.
- Claude mid-run support must be a deliberate CLI adapter refactor, not just a
  UI unlock. See `docs/specs/claude-cli-streaming-input-roadmap.md`.

### Codex

Codex App Server is a long-lived bidirectional JSONL/JSON-RPC-lite protocol.
The official OpenAI write-up describes thread, turn, and item primitives, server
notifications, and server-initiated approval requests.

Generated local protocol bindings from `codex app-server generate-ts
--experimental` include:

- `turn/start`
- `turn/steer`
- `turn/interrupt`
- `turn/started` with a provider turn id
- `turn/completed`
- server requests for approvals and user input

`turn/steer` requires an `expectedTurnId` precondition. That is good: it gives
Convergence a way to avoid steering the wrong active turn.

Implication for Convergence:

- Codex should track the current provider turn id.
- Mid-run steering should call `turn/steer`, not a second `turn/start`.
- Interrupt should call `turn/interrupt` for the current provider turn id.

### Pi

Pi RPC mode documents three relevant commands:

- `prompt` with `streamingBehavior: "steer"` or `"followUp"` when the agent is
  already streaming.
- `steer`, which queues a steering message while the agent is running and
  delivers it after current tool calls, before the next LLM call.
- `follow_up`, which queues a follow-up message after the agent finishes.

The docs also define queue modes:

- steering mode: `"all"` or `"one-at-a-time"`
- follow-up mode: `"all"` or `"one-at-a-time"`

Implication for Convergence:

- Pi is the safest first provider rollout.
- It has native queue semantics for both steer and follow-up.
- Its command responses only confirm acceptance/queueing; final task outcome
  still arrives through the normal event stream.

## Product Model

Convergence should expose the capability, not the transport. The user chooses
the intent:

| Mode        | Meaning                                                      | Default use                                              |
| ----------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `answer`    | Respond to a provider request for user input.                | Only when `attention === "needs-input"`.                 |
| `follow-up` | Add a message to process after the current run finishes.     | Safest default while running.                            |
| `steer`     | Try to influence the current run before the next model call. | Available only when provider advertises native support.  |
| `interrupt` | Stop the current turn and send a replacement instruction.    | Explicit destructive-ish action with confirmation in V1. |
| `normal`    | Existing idle/completed session send behavior.               | Used when session is not actively running.               |

The composer should not use hidden heuristics like "running means steer."
Running sessions need a small, explicit mode affordance. If no safe mode is
available, keep the current disabled state.

## Provider Capability Contract

Add a provider-neutral capability object to `ProviderDescriptor`.

```ts
export type MidRunInputMode =
  | 'normal'
  | 'answer'
  | 'follow-up'
  | 'steer'
  | 'interrupt'

export interface ProviderMidRunInputCapability {
  supportsAnswer: boolean
  supportsNativeFollowUp: boolean
  supportsAppQueuedFollowUp: boolean
  supportsSteer: boolean
  supportsInterrupt: boolean
  defaultRunningMode: Extract<MidRunInputMode, 'follow-up' | 'steer'> | null
  notes?: string
}

export interface ProviderDescriptor {
  // existing fields...
  midRunInput: ProviderMidRunInputCapability
}
```

V1 capability matrix:

| Provider    | answer                                        | follow-up                                                      | steer                                                   | interrupt                | Default while running                       |
| ----------- | --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- | ------------------------ | ------------------------------------------- |
| Claude Code | no in current adapter                         | app-queued only until streaming-input refactor                 | no                                                      | no                       | `follow-up` only after queue service exists |
| Codex       | yes                                           | app-queued                                                     | yes via `turn/steer`                                    | yes via `turn/interrupt` | `follow-up`                                 |
| Pi          | no built-in approval/input in current adapter | yes via `follow_up` or `prompt.streamingBehavior = "followUp"` | yes via `steer` or `prompt.streamingBehavior = "steer"` | abort + follow-up later  | `follow-up`                                 |

Rules:

- If a provider does not advertise a mode, the UI must not offer it.
- The backend must validate the selected mode anyway; the renderer is not a
  trust boundary.
- If the provider rejects a mode at runtime, the queued user input becomes a
  visible failed queued item or an error note. It must not vanish.

## Input Dispatch Contract

Extend the session send contract with explicit delivery options.

```ts
export interface SendMessageInput {
  text: string
  attachmentIds?: string[]
  skillSelections?: SkillSelection[]
  deliveryMode?: MidRunInputMode
}

export interface ProviderSendMessageOptions {
  deliveryMode: MidRunInputMode
  expectedProviderTurnId?: string | null
}

export interface SessionHandle {
  sendMessage: (
    text: string,
    attachments?: Attachment[],
    skillSelections?: SkillSelection[],
    options?: ProviderSendMessageOptions,
  ) => void
}
```

Backward compatibility:

- Existing callers can omit `deliveryMode`; backend derives it from session
  state:
  - `needs-input` -> `answer`
  - not running -> `normal`
  - running -> provider `defaultRunningMode`
- Shell sessions still reject conversation messages.
- Existing start/resume flows preserve their current behavior.

## Queue Model

Follow-up messages can be accepted before they are actually dispatched to the
provider. That state must be represented explicitly.

Add a lightweight queued-input model:

```ts
export type QueuedInputState =
  | 'queued'
  | 'dispatching'
  | 'sent'
  | 'failed'
  | 'cancelled'

export interface SessionQueuedInput {
  id: string
  sessionId: string
  deliveryMode: Extract<MidRunInputMode, 'follow-up' | 'steer' | 'interrupt'>
  state: QueuedInputState
  text: string
  attachmentIds: string[]
  skillSelections: SkillSelection[]
  providerRequestId: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}
```

Persistence:

```sql
CREATE TABLE session_queued_inputs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  delivery_mode TEXT NOT NULL,
  state TEXT NOT NULL,
  text TEXT NOT NULL,
  attachment_ids_json TEXT NOT NULL DEFAULT '[]',
  skill_selections_json TEXT NOT NULL DEFAULT '[]',
  provider_request_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_session_queued_inputs_session
  ON session_queued_inputs(session_id, state, created_at);
```

Rationale:

- Do not add a normal user conversation item until the provider accepts or the
  app dispatches the input.
- Do not lose queued messages if the renderer reloads.
- Do not pretend the provider saw a message that only exists in Convergence's
  queue.

Startup behavior:

- If a provider process is gone after app restart, `queued` inputs remain
  queued and visible.
- `dispatching` inputs older than process lifetime are marked `failed` with
  "App restarted before this input was accepted."
- No attempt is made to resurrect in-memory active provider processes in this
  spec.

## UI Contract

### Composer

When the active session is running:

- If only one safe mode is available, show that mode as a quiet label next to
  the send button.
- If multiple modes are available, show a small segmented control:
  `Follow-up | Steer`.
- `Interrupt` is not part of the normal segmented control in V1. It is an
  explicit menu action with confirmation.
- Attachments and skills use the same capability validation as normal sends.

Default while running:

- Use `follow-up` when available.
- Never default to `steer` unless product deliberately changes this after live
  testing.

### Queue Surface

Queued follow-ups should be visible near the composer, not hidden in the
transcript:

```
Queued follow-up
  "After this, update the README too"        Cancel
```

Once accepted by the provider, the queued item becomes a normal user message in
the transcript and the queue pill disappears.

### Needs Input

`attention === "needs-input"` keeps the current behavior:

- Placeholder remains "Respond to the agent..."
- Sending defaults to `answer`
- The mode selector is hidden
- A user answer must route to the pending provider request, not to follow-up or
  steer

## Provider-Specific Design

### Pi

V1 Pi implementation should use native queue commands:

- `follow-up` -> `{ type: "follow_up", message, images? }`
- `steer` -> `{ type: "steer", message, images? }`
- fallback compatibility: `prompt` with `streamingBehavior` is allowed only if
  direct commands are unavailable in a local version smoke test

Acceptance:

- Mark queue item `sent` only after Pi returns `success: true`.
- If Pi returns `success: false`, mark the queue item `failed`.
- Continue to map task outcome from normal event stream.

### Codex

Track current active provider turn:

- On `turn/started`, store `activeProviderTurnId = turn.id`.
- On `turn/completed`, clear it.
- If `thread/status/changed` reports idle, clear it defensively.

Dispatch:

- `answer` -> existing server request response path.
- `steer` -> `turn/steer` with `{ threadId, expectedTurnId, input }`.
- `interrupt` -> `turn/interrupt` with `{ threadId, turnId }`, then dispatch
  replacement as a new normal turn after interruption completes.
- `follow-up` -> Convergence queue, then `turn/start` after current turn
  completes.

Safety:

- Never call `turn/steer` without an active provider turn id.
- If `turn/steer` fails because `expectedTurnId` is stale, mark the queued item
  failed and leave the session running.
- Do not send a second `turn/start` while the current provider turn is active.

### Claude Code

Claude has one acceptable implementation path for this product direction:

1. Refactor the current CLI adapter to a long-lived `--input-format
stream-json` process per session and keep stdin open.

The SDK package/API-key path is intentionally out of scope because the Claude
provider should continue to use the user's installed and authenticated
`claude` command.

The phase plan starts with a spike because this is the highest-risk adapter.
Until that spike lands:

- Claude mid-run UI should offer app-queued `follow-up` only.
- No Claude `steer` or `interrupt` should be advertised.
- The current spawn-per-turn behavior for ordinary completed-turn follow-ups
  must remain unchanged.

## Regression Guardrails

This feature must be additive and provider-gated.

Hard rules:

- No provider receives a mid-run input mode it did not advertise.
- The existing completed-session follow-up path must keep working.
- `needs-input` answers must not become queued follow-ups.
- Tool approvals must continue to route through `approve()` / `deny()`, not
  through the composer.
- User messages must not be duplicated in the transcript.
- Queued input must not silently disappear.
- Turn capture must still close exactly one active turn per provider turn.
- A failed steer/follow-up must not mark the whole session failed unless the
  provider itself reports session failure.

## Test Strategy

Pure tests:

- Capability resolution from provider descriptor + session state.
- Default delivery mode selection.
- Queue reducer state transitions.
- Attachment/skill validation still gates sends for queued modes.

Backend unit tests:

- `SessionService.sendMessage()` derives `answer`, `normal`, or running default
  correctly.
- Unsupported mode is rejected before provider call.
- Queued follow-up persists and broadcasts.
- Queue drain dispatches in order after turn completion.
- Stale `dispatching` inputs are marked failed on startup.

Provider tests:

- Pi sends `follow_up` for follow-up and `steer` for steer.
- Pi marks accepted/rejected queue items correctly.
- Codex captures `turn.id` from `turn/started`.
- Codex `steer` calls `turn/steer` with `expectedTurnId`.
- Codex does not call `turn/start` while a turn is active for follow-up.
- Codex `needs-input` still responds to pending server request.
- Claude current behavior remains unchanged until the dedicated Claude phase.

Renderer tests:

- Running session with no capability keeps composer disabled.
- Running session with follow-up capability enables composer in follow-up mode.
- Needs-input session hides mode selector and sends `answer`.
- Mode selector shows only supported modes.
- Queue pill renders queued inputs and cancel action.
- Submit clears local draft only after backend accepts queue/send.

Manual smoke tests:

- Pi: send follow-up during a long tool run; verify it runs after completion.
- Pi: send steer during a long tool run; verify it is consumed before the next
  model call when possible.
- Codex: send steer during a long command approval-safe run; verify
  `turn/steer` acceptance and no duplicate transcript message.
- Codex: answer a request-user-input event; verify it is not queued.
- Claude: before Claude refactor, running composer should only allow queued
  follow-up if app queue is active.

## Open Questions

1. Should queued follow-ups be cancellable after the provider has accepted them
   natively? Suggestion: no in V1. Cancellation only applies while the item is
   still in Convergence's queue.
2. Should `steer` be visually more prominent? Suggestion: no. Keep follow-up as
   default until live testing proves steering is predictable enough.
3. Should interrupt preserve partial assistant text as an interrupted item?
   Suggestion: yes for Codex, because the app-server emits `turn/interrupt`;
   defer exact rendering to the Codex phase.
4. Which local Claude CLI versions can safely support long-lived streaming
   input, and how should unsupported versions fall back to app-managed queueing?

## Sources

- Claude Code streaming input:
  `https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode`
- Claude Code approvals and user input:
  `https://code.claude.com/docs/en/agent-sdk/user-input`
- OpenAI Codex App Server:
  `https://openai.com/index/unlocking-the-codex-harness/`
- Codex app-server local protocol:
  `codex app-server generate-ts --experimental`
- Pi RPC docs:
  `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md`
