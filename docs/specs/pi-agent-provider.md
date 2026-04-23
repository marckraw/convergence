# Pi Agent Provider — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 5 (real Claude Code + Codex providers) and the session context window telemetry spec
> Research: `@mariozechner/pi-coding-agent` (binary `pi`), pi RPC mode docs, pi-ai OAuth module

## Objective

Add the Pi Agent harness (`pi`) as a third first-class provider in Convergence, using the same subprocess-over-JSONL pattern we use for Claude Code and Codex. Convergence stays UI-first: pi is authorized once in the user's terminal, and the app just spawns the already-authorized binary and streams events to the existing transcript/attention/continuation pipeline.

Pi is different from Claude Code and Codex because pi itself is a harness that speaks to underlying model APIs (Anthropic, OpenAI, Google) through its own credential store. Adding pi lets users run the same subscription models through a second harness with different tool behavior, and will later unlock provider-parity experiments (Gemini, Copilot, Antigravity) without writing a new adapter for each.

## Auth Model — Option A (No In-App Login)

Convergence does not implement any OAuth flow for pi. The user is responsible for running `pi /login` (or the provider-specific subcommand) in their own terminal before first use. Convergence only:

- Detects whether the `pi` binary exists on PATH.
- Detects whether `~/.pi/agent/auth.json` contains at least one credential.
- Spawns `pi` as a subprocess, inheriting the user's environment. Pi handles token refresh itself against its own auth store.
- Surfaces a clear "Run `pi /login` in your terminal" hint in the provider status card when the auth file is empty.

Rationale:

- Matches the existing Claude Code and Codex pattern, where Convergence never touches `~/.claude/` or `~/.codex/auth.json`.
- Keeps auth complexity (PKCE, callback servers, token refresh, key rotation) out of Convergence entirely. Pi-ai already does this correctly and is the single source of truth for pi's credentials.
- Subscription-first story (Claude Pro/Max, ChatGPT Plus/Pro, Gemini, Copilot, Antigravity) is preserved — the user authorizes each subscription once with pi's own UX, not through Convergence.
- "Convergence is a UI over beautiful CLI tools" — authorization is the CLI's job.

Auth-status surfacing in Convergence is advisory only. If the auth file is missing or empty we still register the provider; attempting to start a session will fail with pi's own error on stderr, which we relay unchanged.

## Provider Protocol — Pi RPC Mode

Pi exposes a JSONL RPC mode similar in shape to Codex but with a different envelope. It is **not** JSON-RPC 2.0 — there is no `jsonrpc: "2.0"` field, no numeric id scheme, and the request/event types are flat strings.

```
Spawn:  pi --mode rpc [--session <path>]
Framing: newline-delimited JSON. Strict \n only. Node readline is noncompliant
         because it also splits on U+2028/U+2029; use our own parseJsonLines.

Commands (Convergence → pi):
  { "type": "prompt",              "text": "..." }
  { "type": "abort" }
  { "type": "new_session" }
  { "type": "switch_session",      "path": "<session file path>" }
  { "type": "get_state" }
  { "type": "get_session_stats" }
  { "type": "set_model",           "model": "..." }
  { "type": "set_thinking_level",  "level": "off|low|medium|high" }
  { "type": "compact" }
  { "type": "set_auto_retry",      "enabled": true }

Events (pi → Convergence):
  { "type": "agent_start" }
  { "type": "turn_start" }
  { "type": "message_update", "message": {
      "assistantMessageEvent": {
        "type": "text_delta"   | "thinking_delta"
              | "toolcall_start" | "toolcall_delta" | "toolcall_end",
        ...
  }}}
  { "type": "tool_execution_start", "id": "...", "name": "...", "input": {...} }
  { "type": "tool_execution_update", "id": "...", "status": "running", ... }
  { "type": "tool_execution_end",    "id": "...", "result": ..., "error": ... }
  { "type": "turn_end",   "usage": {...} }
  { "type": "agent_end",  "reason": "completed|aborted|failed", ... }
  { "type": "compaction_start" | "compaction_end" }
  { "type": "auto_retry_start" | "auto_retry_end" }

State responses (from get_state, get_session_stats):
  { "type": "state_response",        "sessionFile": "...", "model": "...", ... }
  { "type": "session_stats_response", "tokensInContext": N, "maxTokens": N, ... }

Extension UI sub-protocol (only when pi extensions register approval-style dialogs):
  { "type": "extension_ui_request",  "id": "...", "dialog": {...} }
  Convergence → { "type": "extension_ui_response", "id": "...", "value": ... }
```

Long-lived process, multiple turns per session. Continuation is by session file path rather than an opaque token.

## Success Criteria

1. Pi provider is detected at startup when `pi` is on PATH and registered alongside Claude Code and Codex.
2. A session started with the pi provider streams assistant text, thinking, and tool calls into the existing transcript.
3. `turn_end` + `agent_end` map to the existing status/attention transitions (running → idle / finished / failed).
4. Continuation tokens round-trip: reopening a session respawns pi with `--session <path>` from the stored token.
5. Context window telemetry is populated by polling `get_session_stats` after each turn, reusing the existing context-window channel.
6. When `~/.pi/agent/auth.json` is empty, the provider status card shows "Run `pi /login` in your terminal" and does not block registration.
7. Convergence never reads or writes pi credentials. No OAuth code is added to the Electron backend.
8. FakeProvider and existing Claude Code and Codex flows are unchanged and still pass their tests.
9. Phase 0+ verification commands pass (`npm install`, `npm run test:pure`, `npm run test:unit`, `chaperone check --fix`).

## Scope

### In scope

- `PiProvider` implementing `Provider` and `SessionHandle` contracts.
- `PiRpcClient` — minimal custom JSONL client (not JSON-RPC 2.0) with typed send helpers and a notification stream.
- Event mapping from pi RPC events to `TranscriptEntry` (`assistant`, `thinking`, `tool-use`, `tool-result`, `system`).
- Continuation via session file path, read from `get_state.sessionFile` once per session and stored in the existing `continuation_token` column.
- Context window telemetry via `get_session_stats` polled on `turn_end`.
- Provider detection update (`provider-status.pure.ts`), registration wiring in `electron/main/index.ts`.
- Auth-status hint when pi's auth file is empty.

### Out of scope

- OAuth, PKCE, token refresh, or any credential IO inside Convergence.
- Approval handshake. Pi has no built-in approval mechanism; `extension_ui_request` is optional and only fires when an extension is loaded. V1 treats pi as approval-less.
- Model picker and thinking-level picker UI. V1 uses pi's defaults; `set_model` and `set_thinking_level` are plumbed through the client but not surfaced.
- Compaction controls (`compact`) in the UI. V1 lets pi auto-compact per its own config.
- Extensions surface (beyond tolerating `extension_ui_request` without crashing).
- Multi-repo project rooting beyond what Phase 6 already gives us.

## Tech Decisions

| Decision           | Choice                                                                  | Rationale                                                                                                 |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Process spawning   | `child_process.spawn` with piped stdio, same lifecycle helpers as Codex | Consistency; reuse existing process-supervisor patterns                                                   |
| Pi command         | `pi --mode rpc` (plus `--session <path>` on resume)                     | Documented, stable RPC mode. Matches CLI-only assumption.                                                 |
| RPC envelope       | Custom JSONL with flat `type` discriminator                             | Pi is not JSON-RPC 2.0; `codex/jsonrpc.ts` is not reusable                                                |
| Line parsing       | Existing `provider/line-parser.ts` (`\n` split)                         | Pi docs warn about readline's U+2028/U+2029 behavior — our parser is already compliant                    |
| Continuation token | Session file path from `get_state.sessionFile`                          | Pi exposes this explicitly; no opaque thread id like Codex                                                |
| Context window     | Poll `get_session_stats` after every `turn_end`                         | Pi does not push token counts; polling is the documented path                                             |
| Auth detection     | Read presence of `~/.pi/agent/auth.json` keys; do not parse or refresh  | Advisory UI only. Pi owns the file format.                                                                |
| Approvals          | Not wired in v1                                                         | Pi has no built-in approval flow; extension UI is optional                                                |
| Reasoning effort   | Not exposed in v1                                                       | Convergence's `none..max` ladder doesn't cleanly match pi's `off..high`; defer until there is a UI for it |

## Deliverables

### Backend — pi adapter

| File                                                         | What it does                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `electron/backend/provider/pi/pi-provider.ts`                | Implements `Provider` and `SessionHandle` for the pi CLI                                 |
| `electron/backend/provider/pi/pi-rpc.ts`                     | Minimal JSONL client: request/response for state queries, notification stream for events |
| `electron/backend/provider/pi/pi-event-mapping.pure.ts`      | Pure functions mapping pi RPC events to `TranscriptEntry` + status/attention transitions |
| `electron/backend/provider/pi/pi-auth-status.ts`             | Reads `~/.pi/agent/auth.json` to decide whether to show the "Run `pi /login`" hint       |
| `electron/backend/provider/pi/pi-provider.test.ts`           | Unit tests with a mock child process                                                     |
| `electron/backend/provider/pi/pi-event-mapping.pure.test.ts` | Pure tests for the event mapping table                                                   |

### Backend — shared updates

| File                                                | What it does                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `electron/backend/provider/provider-status.pure.ts` | Add pi entry to `KNOWN_PROVIDERS` (`id: 'pi'`, `name: 'Pi Agent'`, `vendorLabel: 'Mario Zechner'`, `binaryName: 'pi'`) |
| `electron/backend/provider/detect.ts`               | Extend detection map to include pi (PATH lookup only)                                                                  |
| `electron/main/index.ts`                            | Register `PiProvider(binaryPath)` when pi is detected                                                                  |

### Renderer updates

| File                                                          | What it does                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/provider-status/*` (existing)                   | Surface "Run `pi /login` in your terminal" hint when pi's auth file is empty — no new component, just a reason string on the existing card |
| `src/features/session-start/session-start.presentational.tsx` | Already shows the provider dropdown — pi should appear automatically once registered                                                       |

No new renderer slices are required. If we decide later to expose model/thinking-level controls, those go behind their own spec.

## Event Mapping

| Pi RPC event                                                          | Convergence TranscriptEntry / transition                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent_start`                                                         | Status → running                                                                                                                                                         |
| `turn_start`                                                          | (no transcript entry; used to reset per-turn accumulators)                                                                                                               |
| `message_update` with `assistantMessageEvent.type = "text_delta"`     | Accumulate → `{ type: "assistant", text: accumulated }`                                                                                                                  |
| `message_update` with `assistantMessageEvent.type = "thinking_delta"` | Accumulate → `{ type: "thinking", text: accumulated }`                                                                                                                   |
| `message_update` with `assistantMessageEvent.type = "toolcall_start"` | `{ type: "tool-use", tool: name, input: "" }` (input filled by subsequent deltas)                                                                                        |
| `message_update` with `assistantMessageEvent.type = "toolcall_delta"` | Update existing tool-use entry's input                                                                                                                                   |
| `message_update` with `assistantMessageEvent.type = "toolcall_end"`   | Finalize tool-use entry                                                                                                                                                  |
| `tool_execution_start`                                                | (already represented by tool-use; keep for telemetry/logging)                                                                                                            |
| `tool_execution_end`                                                  | `{ type: "tool-result", result: stringify(result or error) }`                                                                                                            |
| `turn_end`                                                            | Trigger `get_session_stats` → emit `onContextWindowChange`                                                                                                               |
| `agent_end` with `reason: "completed"`                                | Status → completed, attention → finished                                                                                                                                 |
| `agent_end` with `reason: "aborted"`                                  | Status → stopped, attention → idle                                                                                                                                       |
| `agent_end` with `reason: "failed"`                                   | Status → failed, attention → failed                                                                                                                                      |
| `compaction_start` / `compaction_end`                                 | System note `"Compacting context…"` / `"Compaction complete"` **and** `activity` set to `'compacting'` while compacting (restores prior streaming/thinking state on end) |
| `auto_retry_start` / `auto_retry_end`                                 | `{ type: "system", text: "Retrying…" / "Retry complete" }`                                                                                                               |
| `extension_ui_request`                                                | Ignore in v1; log and reply with a benign cancel so pi is not left waiting                                                                                               |

## Command Mapping

| Convergence action         | Pi RPC call                                                                |
| -------------------------- | -------------------------------------------------------------------------- |
| `sendMessage(text)`        | `{ type: "prompt", text }`                                                 |
| `stop()`                   | `{ type: "abort" }` then SIGTERM on the process after a short grace window |
| `approve()` / `deny()`     | No-op in v1 (no approval flow)                                             |
| Session resume             | Spawn with `--session <continuationToken>`                                 |
| Capture continuation token | On first `agent_start`, send `get_state`, store `sessionFile`              |
| Context window refresh     | On every `turn_end`, send `get_session_stats`                              |

## Implementation Order

### Step 1: Line parser + RPC client

- Confirm `provider/line-parser.ts` splits only on `\n` (it does — preserve this and add a comment citing pi docs).
- Create `pi/pi-rpc.ts` — send helpers, awaitable `sendAndExpect(type)` for one-shot state queries (`get_state`, `get_session_stats`), and an event observable for everything else.
- Unit-test with a mock readable/writable.
- **Verify:** `npm run test:pure` and `npm run test:unit` stay green.

### Step 2: Event mapping table (pure)

- Create `pi/pi-event-mapping.pure.ts` + pure tests.
- Cover every row in the Event Mapping table; golden-test each event → entries transformation.
- **Verify:** `npm run test:pure` covers new file.

### Step 3: Pi provider adapter

- Create `pi/pi-provider.ts` implementing `Provider` and `SessionHandle`.
- Wire `start()`, `sendMessage()`, `stop()`, and the `get_state` + `get_session_stats` hooks.
- Resume via `--session <token>` when a continuation token is provided.
- Unit-test with a mock child process emitting scripted event streams.
- **Verify:** `npm run test:unit` covers provider adapter.

### Step 4: Detection + registration + status hint

- Add pi to `KNOWN_PROVIDERS` in `provider-status.pure.ts`.
- Extend `detect.ts` to look up `pi` on PATH.
- Add `pi-auth-status.ts` to compute the `reason` string when the auth file is empty.
- Register `PiProvider` in `electron/main/index.ts` when detected.
- **Verify:** provider status card shows pi with the correct hint; dropdown in session-start lists pi when installed.

### Step 5: Manual verification

- With `pi /login` completed in terminal: start a session, observe streaming text, thinking, tool calls, tool results, `turn_end`, `agent_end`.
- Reopen the session and confirm it continues via `--session <path>`.
- With `~/.pi/agent/auth.json` emptied: confirm the hint appears and starting a session surfaces pi's own auth error on stderr.

## Verification Gate

```bash
npm install
npm run test:pure
npm run test:unit
chaperone check --fix
```

Manual verification:

- Pi provider appears in the provider status card and session-start dropdown only when `pi` is on PATH.
- Auth hint appears when `~/.pi/agent/auth.json` is empty; disappears once the user runs `pi /login`.
- Real session against a repo produces streaming text, thinking deltas, tool calls, and completion.
- Reopening the session continues it via the stored session file path.
- Context window telemetry updates after each turn.

## Risks

| Risk                                                | Mitigation                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Pi binary not installed                             | Detect at startup; omit from provider list (existing pattern)                                              |
| Pi not logged in                                    | Show terminal-login hint; surface pi's own stderr on session start failure                                 |
| Pi RPC protocol drift                               | Pin expectations to the documented event names; log unknown `type`s at debug level without crashing        |
| Session file path changes between turns             | `get_state` once per session and cache; re-query if pi emits a `new_session` acknowledgement in the future |
| Tool call deltas arrive out of order                | Key by `toolcall` id from pi; use last-write-wins for input assembly                                       |
| Extension UI requests arrive unexpectedly           | Auto-cancel with a benign response so pi does not block; log for later surfacing                           |
| Unicode line separators (U+2028/U+2029) in payloads | Keep `parseJsonLines` on strict `\n` split — matches pi's framing contract                                 |
| Credential store format changes                     | Treat `~/.pi/agent/auth.json` as opaque: only check for presence/emptiness, never parse                    |
