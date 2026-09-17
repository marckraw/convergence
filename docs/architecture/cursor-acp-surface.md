# Cursor ACP surface (measured)

**Status:** observed · CP0 (MAR-3141)  
**CLI:** `cursor-agent` `2026.06.03-0bbb28e` at `~/.local/bin/cursor-agent`  
**Date:** 2026-09-17  
**OS:** macOS (darwin 25)  
**Probe:** throwaway Node JSON-RPC client speaking Convergence’s `initialize` /
`authenticate` / `session/new` shape, then additional methods. Transcript scrubbed
in memory before any write. Default model; **7** one-line `session/prompt` calls.

This document states what was **seen on the wire**, not what the app currently
assumes. Anything inferred is labeled _inferred_.

## Six answers

| #   | Question                                                                                                                    | Answer                                                                                                                                                                                                                                                                                                               | Wire evidence (scrubbed)                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Does `session/cancel` work during a running prompt? What `stopReason`? Process stays alive?                                 | **yes** (as a **notification** only). Request form is rejected. Prompt resolved `stopReason: "cancelled"`. Further `session/prompt` on the same session returned `stopReason: "end_turn"`.                                                                                                                           | Request error: `{"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"\"Method not found\": session/cancel","data":{"method":"session/cancel"}}}`. Notification out: `{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":"…"}}`. Prompt result: `{"stopReason":"cancelled"}`. |
| 2   | Full `initialize` result? Logged-out `authenticate`?                                                                        | **yes** for initialize (below). Logged-out authenticate: **unknown** (would require logging out). Logged-in `authenticate` with `methodId: "cursor_login"` returned `{}`.                                                                                                                                            | See [Initialize result](#initialize-result).                                                                                                                                                                                                                                                    |
| 3   | `session_info_update` / `current_mode_update` / `current_model_update` payloads? Usage / cost / context window on the wire? | `session_info_update`: **yes**. `current_mode_update` / `current_model_update` as `sessionUpdate` kinds: **no** (not observed). Modes/models arrived on `session/new` and `session/load` **results**. Token usage / cost / context-window figures: **no** on updates or `session/prompt` results in this transcript. | `{"sessionUpdate":"session_info_update","title":"Slow Counter"}`. Session result carries `modes` / `models` (see fixture). Prompt results were only `{ "stopReason": "…" }`.                                                                                                                    |
| 4   | Which `sessionUpdate` kinds for a small edit and a plan prompt? `plan`? `diff`?                                             | Kinds seen: `available_commands_update`, `session_info_update`, `agent_thought_chunk`, `agent_message_chunk`, `user_message_chunk`, `tool_call`, `tool_call_update`. **No** `plan` kind. **Yes** a `diff` content block inside completed `tool_call_update`.                                                         | Diff sample: `{"sessionUpdate":"tool_call_update","status":"completed","content":[{"type":"diff","path":"…/note.txt","oldText":"-- /dev/null","newText":"…\nping"}]}`.                                                                                                                          |
| 5   | One process, three prompts with 30s idle; second `session/new`; `session/load` on a fresh process?                          | **yes** / **yes** / **yes**.                                                                                                                                                                                                                                                                                         | Three prompts → `stopReason: "end_turn"` each after idle. Second `session/new` returned a new `sessionId`. Fresh process `session/load` returned modes/models for the first id (no error).                                                                                                      |
| 6   | Flag or env relocating the CLI config/credential home? (`--help` / `acp --help` / `status` text only)                       | **no**. Help documents `--api-key` / `CURSOR_API_KEY` (auth), `--workspace` (cwd), `--worktree` (paths under `~/.cursor/worktrees/…`), not a relocate-home switch.                                                                                                                                                   | From `cursor-agent --help` and `cursor-agent acp --help` only.                                                                                                                                                                                                                                  |

## Initialize result

Observed `initialize` result (protocol spoken as Convergence: `protocolVersion: 1`,
`clientInfo.name: "convergence"`):

```json
{
  "protocolVersion": 1,
  "agentCapabilities": {
    "loadSession": true,
    "mcpCapabilities": { "http": true, "sse": true },
    "promptCapabilities": {
      "audio": false,
      "embeddedContext": false,
      "image": true
    },
    "sessionCapabilities": { "list": {} }
  },
  "authMethods": [
    {
      "id": "cursor_login",
      "name": "Cursor Login",
      "description": "Authenticate using existing Cursor login credentials. Run 'agent login' first if not logged in."
    }
  ]
}
```

## Cancel detail

Convergence’s recorded stop strategy
(`terminate-acp-process-until-session-cancel-is-supported`) assumed cancel was
unavailable. On this CLI build:

- `session/cancel` as a **JSON-RPC request** → `-32601 Method not found`.
- `session/cancel` as a **JSON-RPC notification** (no `id`) → in-flight
  `session/prompt` completed with `stopReason: "cancelled"`, and the same
  process/session accepted another prompt.

_Inferred for CP1:_ interrupt should send a **notification**, not a request.

## Modes and models

`current_mode_update` / `current_model_update` did **not** appear as
`session/update` payloads in this probe. The same information was present on:

- `session/new` result: `modes.currentModeId`, `modes.availableModes`,
  `models.currentModelId`, `models.availableModels`
- `session/load` result: the same shape

_Inferred:_ the app’s unread handlers for those update kinds may be dead on this
CLI build; reading modes/models from session RPC results is the observed path.

## Update kinds (samples)

Typed scrubbed constants live in
`apps/convergence/electron/backend/provider/cursor/cursor-acp.recorded.fixture.ts`.

| Kind                        | Sample role                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `agent_message_chunk`       | Assistant text deltas                                              |
| `agent_thought_chunk`       | Thinking text deltas                                               |
| `user_message_chunk`        | Echo of the user prompt text                                       |
| `tool_call`                 | Pending edit (`kind: "edit"`)                                      |
| `tool_call_update`          | Progress / completed; completed carries `content[{type:"diff",…}]` |
| `available_commands_update` | Slash-command catalog                                              |
| `session_info_update`       | Session title                                                      |

Not observed in this probe: a top-level `plan` `sessionUpdate`.

## Long-lived process

On one ACP process and one session id:

1. Prompt → `end_turn`
2. Prompt → `end_turn`
3. 30 s idle
4. Prompt → `end_turn`

Then a second `session/new` on the **same** process succeeded (new `sessionId`).
`session/load` of the first id on a **fresh** process succeeded (`loadSession:
true` matches the initialize capability).

## Per-account home

From help text alone: **no** documented flag or env var relocates the CLI’s
config/credential home. Auth is `agent login` / `--api-key` /
`CURSOR_API_KEY`. Workspace is `--workspace`. Worktrees nest under
`~/.cursor/worktrees/…` but that is not a home relocate.

## Not checked / STOP notes

- Logged-out `authenticate` behaviour: **unknown** (STOP on that sub-question
  only — would require logging the machine out).
- No credential files under `~/.cursor` were read; status output that can include
  an account identifier was not persisted into the transcript or this doc.
- Prompt count: **7** (under the eight-prompt ceiling).
