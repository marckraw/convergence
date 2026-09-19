# Cursor ACP surface (measured)

**Status:** observed · CP0 (MAR-3141) + probe 2 (MAR-3239)  
**CLI:** `cursor-agent` `2026.06.03-0bbb28e` at `~/.local/bin/cursor-agent`  
**Date:** 2026-09-17 (CP0) · 2026-09-20 (probe 2)  
**OS:** macOS (darwin 25)  
**Probe (throwaway, not committed):** Node JSON-RPC client speaking Convergence’s
`initialize` / `authenticate` / `session/new` shape, then additional methods.
Transcript scrubbed in memory before any write. Default model; **7** one-line
`session/prompt` calls in lap 1; lap 2 spent **0** further prompts (transcript
still on disk).  
**Committed probe tool:** `apps/convergence/tools/probe-cursor-acp.mjs`, with its
side-effect-free half in `probe-cursor-acp.pure.mjs` (message builders, arg
parsing, redaction, the transcript). Since MAR-3239 it sends `session/cancel` as
a **notification**, takes a repeatable `--prompt` that runs every prompt in order
on one process and one session, and writes a scrubbed transcript with `--out`.
The tool spawns a real `cursor-agent` at import time — never import it from a
test; import the `.pure.mjs` half instead.

This document states what was **seen on the wire**, not what the app currently
assumes. Anything inferred is labeled _inferred_.

## Six answers (CP0, 2026-09-17)

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

## Probe 2 — five answers (MAR-3239)

**Date:** 2026-09-20 · same CLI build `2026.06.03-0bbb28e` · **default model** ·
**7** one-line prompts (ceiling 8), across two ACP processes, plus one
**zero-prompt** run that only read the command catalog. Workspace was a
throwaway git repo under `/tmp`, never a real checkout. Permission requests were
auto-approved with the new `--permission-response first-allow`.

| #   | Question                                      | Answer                                                                                                                                                                                                                                                 | Wire evidence (scrubbed)                                                                                                                                                                                      |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The dying turn (`WritableIterable is closed`) | **not reproduced** in 3 attempts. All 7 turns ended `stopReason: "end_turn"`, the process stayed alive after every one, and the next prompt always worked. Zero bytes on stderr.                                                                       | No `WritableIterable`, no `"stopReason":"error"`, no `child-exit` entry in either transcript. Long chained `sleep`/`echo` command, permission allowed ~1 ms after the request, 3 times.                       |
| 2   | `/compress` on a live session                 | **no** — it is not a server-side command. Sent as `session/prompt` it round-trips as ordinary user text: the model wrote a prose "Conversation summary" and the turn ended `end_turn`. No compaction signal on the wire. The next prompt still worked. | Full `available_commands_update` catalog (**86** entries, read with **0** prompts) has no `compress` / `compact` / `summar*` / `context*` entry. Result: `{"stopReason":"end_turn"}`.                         |
| 3   | The permission `options`                      | **yes, there is an allow-always.** Three options, identical on all 7 requests: `allow-once` (`allow_once`), `allow-always` (`allow_always`), `reject-once` (`reject_once`).                                                                            | `[{"optionId":"allow-once","name":"Allow once","kind":"allow_once"},{"optionId":"allow-always","name":"Allow always","kind":"allow_always"},{"optionId":"reject-once","name":"Reject","kind":"reject_once"}]` |
| 4   | Todos and tasks                               | **yes** — both, as JSON-RPC **server requests** (they carry an `id`), not `session/update` payloads. `cursor/update_todos` ×3 and `cursor/task` ×1 on one turn. No `plan` update.                                                                      | See [Todos and tasks](#todos-and-tasks). Inbound methods across probe 2: `session/update`, `session/request_permission`, `cursor/update_todos`, `cursor/task`.                                                |
| 5   | `cursor-agent status` shape (logged in)       | exit **0**, stderr empty, stdout a single 35-byte line: `✓ Logged in as <account-email>\n`.                                                                                                                                                            | Captured through a masker; the identifier was never printed, logged or written. Logged-out behaviour remains **unknown**.                                                                                     |

### The dying turn (question 1)

The provocation from the brief — one long chained shell command
(`sleep 1 && echo a && … && echo d`), permission answered _allow_ immediately,
as the app's auto-approve does — did **not** kill the turn. Three attempts:
one on a fresh session, two more on a second fresh process. Every attempt:

- `session/request_permission` arrived with `kind: "execute"` and the content
  `"Not in allowlist: sleep 1, echo a, …"`;
- the probe answered `allow-once` within ~1 ms;
- the tool ran, the agent printed `a b c d`, and the prompt resolved
  `{"stopReason":"end_turn"}`;
- the child process was still alive afterwards, and the following prompt
  succeeded.

_Inferred for MAR-3159:_ the reported death is **not** a plain consequence of
allowing a long chained command on this CLI build. Something else in the app's
path — how it writes to the child, or a teardown racing the answer — remains the
likely cause. `WritableIterable` is a name from the **Cursor CLI's own**
internals, and it never surfaced when a minimal client drove the same shape.

### `/compress` (question 2)

Not in the catalog, so nothing server-side consumes it. The interesting part is
the failure mode: because the CLI forwards it as plain text, the **model** tries
to honour it. In this probe it searched the machine for a `compress` skill and
then improvised a summary in chat. A client that shows `/compress` as a working
command would be showing a model's improvisation, not a compacted context.

_Inferred for MAR-3153:_ there is no `/compress` to forward. Compaction for
Cursor has to be built, or the command has to be absent from the UI.

### Permission options (question 3)

`allow-always` exists as a real option id. MAR-3146 does not need a client-side
simulation of "always allow": it can send `allow-always` and let the CLI keep
the allowlist. The `toolCall.content` text names exactly which command segments
were not in the allowlist, which is usable as the reason shown to the user.

### Todos and tasks

Both are `cursor/*` **server requests**. The probe answered every one with
`-32601 Method not found` and **the turns still completed `end_turn`** — the CLI
does not require a client to implement them, so adopting them is optional and
safe to do incrementally.

`cursor/update_todos` params:

```json
{
  "toolCallId": "…",
  "todos": [{ "id": "1", "content": "…", "status": "in_progress" }],
  "merge": false
}
```

`merge` is load-bearing. The first call of a turn carried `merge: false` and the
**complete** list; the two later calls carried `merge: true` and **only the
todos that changed**. Rendering a `merge: true` payload as the whole list would
silently drop every unchanged item. Statuses seen: `pending`, `in_progress`,
`completed`.

`cursor/task` params:

```json
{
  "toolCallId": "…",
  "description": "Write repo README",
  "prompt": "…full subagent instruction…",
  "subagentType": { "custom": { "unspecified": {} } },
  "model": "default",
  "agentId": "…",
  "durationMs": 15976
}
```

It arrived **once, after** the subagent had finished (it carries `durationMs`),
so it is a completion record, not a start event — a UI cannot use it to show a
task running. `prompt` carries the full subagent instruction, including
workspace content: treat it as sensitive.

No top-level `plan` `sessionUpdate` appeared, and `user_message_chunk` — seen in
CP0 — did **not** recur in probe 2.

## Not checked / STOP notes

- Logged-out `authenticate` behaviour: **unknown** (STOP on that sub-question
  only — would require logging the machine out).
- No credential files under `~/.cursor` were read; status output that can include
  an account identifier was not persisted into the transcript or this doc.
- Prompt count: **7** in lap 1; **0** additional in lap 2 (under the eight-prompt
  ceiling).
- Probe 2 prompt count: **7** of a ceiling of 8 (3 dying-turn attempts, 1 todo /
  subagent prompt, `/compress`, and 2 "reply with exactly: …" follow-ups). The
  86-command catalog read and `cursor-agent status` cost **0** prompts.
- Probe 2's `cursor-agent status` was captured through a masker: the account
  identifier was never printed, logged or written anywhere.
- Probe 2 transcripts live under `/tmp` and are **not** committed. The committed
  record is `cursor-acp.recorded.fixture.ts`, pinned by its test.
