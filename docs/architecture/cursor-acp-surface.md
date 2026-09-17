# Cursor ACP surface (measured)

**Status:** observed · CP0 (MAR-3141)  
**CLI:** `cursor-agent` `2026.06.03-0bbb28e` at `~/.local/bin/cursor-agent`  
**Date:** 2026-09-17  
**OS:** macOS (darwin 25)  
**Probe (throwaway, not committed):** Node JSON-RPC client speaking Convergence’s
`initialize` / `authenticate` / `session/new` shape, then additional methods.
Transcript scrubbed in memory before any write. Default model; **7** one-line
`session/prompt` calls in lap 1; lap 2 spent **0** further prompts (transcript
still on disk).  
**Committed probe tool (wrong envelope):** `apps/convergence/tools/probe-cursor-acp.mjs`
with `--probe-cancel` / `--cancel-after-ms` sends `session/cancel` as a JSON-RPC
**request** (`client.request(...)`). That path is `-32601` on this CLI; the
working cancel is a **notification**. Do not re-measure cancel with that tool’s
request form and conclude “unsupported.”

This document states what was **seen on the wire**, not what the app currently
assumes. Anything inferred is labeled _inferred_.

## Six answers

| #   | Question                                                                                                                    | Answer                                                                                                                                                                                                                                                                                                               | Wire evidence (scrubbed)                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Does `session/cancel` work during a running prompt? What `stopReason`? Process stays alive?                                 | **yes** (as a **notification** only). Request form is rejected. Prompt resolved `stopReason: "cancelled"`. Further `session/prompt` on the same session returned `stopReason: "end_turn"`.                                                                                                                           | Request error: `{"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"\"Method not found\": session/cancel","data":{"method":"session/cancel"}}}`. Notification out: `{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":"…"}}`. Prompt result: `{"stopReason":"cancelled"}`. |
| 2   | Full `initialize` result? Logged-out `authenticate`?                                                                        | **yes** for initialize (below). Logged-out authenticate: **unknown** (would require logging out). Logged-in `authenticate` with `methodId: "cursor_login"` returned `{}`.                                                                                                                                            | See [Initialize result](#initialize-result).                                                                                                                                                                                                                                                    |
| 3   | `session_info_update` / `current_mode_update` / `current_model_update` payloads? Usage / cost / context window on the wire? | `session_info_update`: **yes**. `current_mode_update` / `current_model_update` as `sessionUpdate` kinds: **no** (not observed). Modes/models arrived on `session/new` and `session/load` **results**. Token usage / cost / context-window figures: **no** on updates or `session/prompt` results in this transcript. | `{"sessionUpdate":"session_info_update","title":"Slow Counter"}`. Session result carries `modes` / `models` (see fixture). Prompt results were only `{ "stopReason": "…" }`.                                                                                                                    |
| 4   | Which `sessionUpdate` kinds for a small edit and a plan prompt? `plan`? `diff`?                                             | Kinds seen: `available_commands_update`, `session_info_update`, `agent_thought_chunk`, `agent_message_chunk`, `user_message_chunk`, `tool_call`, `tool_call_update`. **No** `plan` kind. **Yes** a `diff` content block inside completed `tool_call_update`. Plan server requests: **no**.                           | Diff sample (headers **on the wire**): `{"type":"diff","path":"…/note.txt","oldText":"-- /dev/null","newText":"++ b/…/note.txt\\nping"}`. Inbound methods during the probe: only `session/update` — no `cursor/create_plan` / `cursor/update_todos`.                                            |
| 5   | One process, three prompts with 30s idle; second `session/new`; `session/load` on a fresh process?                          | **yes** / **yes** / **yes**.                                                                                                                                                                                                                                                                                         | Three prompts → `stopReason: "end_turn"` each; 30 s idle sat between prompts 2 and 3. Second `session/new` returned a new `sessionId`. Fresh process `session/load` returned modes/models for the first id (no error).                                                                          |
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

- `session/cancel` as a JSON-RPC **request** → `-32601 Method not found`.
  Live message text is `"Method not found": session/cancel`. The unit test in
  `cursor-acp-jsonrpc.test.ts` rejects with the plain string `Method not found`
  — a trap only if someone matches on message text.
- `session/cancel` as a JSON-RPC **notification** (no `id`) → in-flight
  `session/prompt` completed with `stopReason: "cancelled"`, and the same
  process/session accepted another prompt.

_Inferred for CP1:_ interrupt should send a **notification**, not a request.

## Modes and models

`current_mode_update` / `current_model_update` did **not** appear as
`session/update` payloads in this probe. The same information was present on:

- `session/new` result: `modes.currentModeId`, `modes.availableModes`,
  `models.currentModelId`, `models.availableModels` (wire entries use
  `modelId` + `name`, not `id`)
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
| `tool_call`                 | Pending edit (`kind: "edit"`); `rawInput: {}` on the wire          |
| `tool_call_update`          | Progress / completed; completed carries `content[{type:"diff",…}]` |
| `available_commands_update` | Slash-command catalog                                              |
| `session_info_update`       | Session title                                                      |

Not observed in this probe: a top-level `plan` `sessionUpdate`. Plan prompt did
**not** produce `cursor/create_plan` or `cursor/update_todos` server requests
(**no**).

Diff `oldText` / `newText` include unified-diff header lines (`-- /dev/null`,
`++ b/…`) **as sent on the wire** (confirmed against the raw transcript line;
not scrubber artifacts).

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
- Prompt count: **7** in lap 1; **0** additional in lap 2 (under the eight-prompt
  ceiling).
