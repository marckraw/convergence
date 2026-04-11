# Phase 5: Real Provider Integrations — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 4 (session UX with sidebar, transcript, composer)
> Research: Divergence (Claude Code adapter), T3 Code (Codex app-server adapter)

## Objective

Connect real AI coding agents — Claude Code CLI and Codex app-server — while keeping the session model provider-neutral. After this phase, users can run actual agent sessions against their repos through Convergence.

## Provider Protocols

### Claude Code — Streaming JSON over stdin/stdout

```
Spawn: claude -p --output-format stream-json --verbose [--resume <id>]
Write prompt to stdin → Read newline-delimited JSON events from stdout

Events:
  { "type": "system", "session_id": "..." }          → session started
  { "type": "stream_event", "event": { "type": "content_block_delta", "delta": { "text": "..." } } }
                                                       → streaming text
  { "type": "assistant", "message": { "content": [...] } }
                                                       → full message (may contain tool_use blocks)
  { "type": "user", "message": { "content": [...] } } → tool results
  { "type": "result", "is_error": false }              → turn complete
```

Simple protocol. One prompt per process invocation. For multi-turn, use `--resume`.

### Codex — JSON-RPC 2.0 over stdin/stdout

```
Spawn: codex app-server
Protocol: Line-delimited JSON-RPC 2.0

Handshake:
  Client → { "id": 1, "method": "initialize", "params": { "clientInfo": {...} } }
  Server → { "id": 1, "result": { "serverInfo": {...} } }
  Client → { "method": "initialized" }

Start thread:
  Client → { "id": 2, "method": "thread/start", "params": { "instructions": "..." } }
  Server → { "id": 2, "result": { "threadId": "..." } }

Send turn:
  Client → { "id": 3, "method": "turn/start", "params": { "threadId": "...", "message": "..." } }

Events (notifications, no id):
  { "method": "item/agentMessage/delta", "params": { "textDelta": "..." } }
  { "method": "turn/complete", "params": { ... } }

Approval requests (server requests WITH id — need response):
  { "id": 100, "method": "item/commandExecution/requestApproval", "params": { ... } }
  Client → { "id": 100, "result": { "decision": "accept" } }
```

Bidirectional JSON-RPC. Long-lived process with multiple turns per session.

## Success Criteria

1. Claude Code adapter starts a real session, streams responses, and completes
2. Codex adapter connects via app-server, handles JSON-RPC handshake, streams turns
3. Codex approvals flow through our attention system (needs-approval → approve → continue)
4. Both providers detected at startup (check PATH), only available ones shown
5. Provider selection in session creation UI
6. Sessions against real repos produce real code changes
7. Errors (CLI not found, auth failure, process crash) surface clearly
8. FakeProvider still available for development
9. All Phase 0-4 verification commands pass

## Scope

### In scope

- Claude Code adapter implementing `Provider` interface
- Codex adapter implementing `Provider` interface with JSON-RPC 2.0 client
- Provider detection (binary exists in PATH)
- Provider selection in UI (dropdown when multiple available)
- Streaming transcript from real providers
- Approval handling for Codex
- Error handling (process crashes, auth failures, timeouts)
- Session stop (kill child process)

### Out of scope

- Claude Code approval mode (start with `--dangerously-skip-permissions`, add later)
- Session resume (`--resume` for Claude, `thread/resume` for Codex) — add later
- Model selection per provider — use defaults for Phase 5
- Provider capability discovery beyond basic detection
- Attachments (images, files)
- Plan mode

## Tech Decisions

| Decision           | Choice                                                                    | Rationale                                                                  |
| ------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Process spawning   | `child_process.spawn` with piped stdio                                    | Need stdin/stdout access for both protocols                                |
| Claude Code flags  | `-p --output-format stream-json --verbose --dangerously-skip-permissions` | Simplest working mode. Add approval mode later.                            |
| Codex command      | `codex app-server`                                                        | T3 Code's proven approach. JSON-RPC 2.0 gives bidirectional communication. |
| JSON-RPC client    | Custom minimal implementation                                             | Only need request/response/notification. No need for a library.            |
| Provider detection | `which` / `where` lookup at startup                                       | Simple, reliable                                                           |
| Line parsing       | Split stdout on newlines, parse each as JSON                              | Both protocols use newline-delimited JSON                                  |

## Deliverables

### Backend — shared utilities

| File                                       | What it does                                         |
| ------------------------------------------ | ---------------------------------------------------- |
| `electron/backend/provider/detect.ts`      | Check if `claude` and `codex` binaries exist in PATH |
| `electron/backend/provider/line-parser.ts` | Shared newline-delimited JSON stream parser          |

### Backend — Claude Code adapter

| File                                                                 | What it does                                        |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| `electron/backend/provider/claude-code/claude-code-provider.ts`      | Implements `Provider` interface for Claude Code CLI |
| `electron/backend/provider/claude-code/claude-code-provider.test.ts` | Tests with mock child process                       |

### Backend — Codex adapter

| File                                                     | What it does                                                |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `electron/backend/provider/codex/codex-provider.ts`      | Implements `Provider` interface for Codex app-server        |
| `electron/backend/provider/codex/jsonrpc.ts`             | Minimal JSON-RPC 2.0 client (request/response/notification) |
| `electron/backend/provider/codex/codex-provider.test.ts` | Tests with mock child process                               |

### Backend — registration

| File                     | What it does                                           |
| ------------------------ | ------------------------------------------------------ |
| `electron/main/index.ts` | Updated: detect and register real providers at startup |

### Renderer updates

| File                                                          | What it does                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `src/features/session-start/session-start.presentational.tsx` | Updated: show provider dropdown when multiple available |

## Claude Code Adapter Design

```typescript
class ClaudeCodeProvider implements Provider {
  id = 'claude-code'
  name = 'Claude Code'

  start(config: SessionStartConfig): SessionHandle {
    // 1. Spawn: claude -p --output-format stream-json --verbose --dangerously-skip-permissions
    // 2. Write initial message to stdin, close stdin
    // 3. Read stdout line by line
    // 4. Parse each JSON line and emit appropriate events:
    //    - "system" → emit system transcript entry
    //    - "stream_event" with content_block_delta → accumulate text, emit assistant entry
    //    - "assistant" with tool_use in content → emit tool-use entries
    //    - "user" with tool results → emit tool-result entries
    //    - "result" → emit completion, set status to completed
    // 5. On process exit: check exit code, handle errors
  }
}
```

### Event mapping

| Claude Code event                                                     | Convergence TranscriptEntry                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `{ type: "system" }`                                                  | `{ type: "system", text: "Session started" }`                    |
| `{ type: "stream_event", delta.text }`                                | Accumulate → `{ type: "assistant", text: accumulated }`          |
| `{ type: "assistant", content: [{ type: "tool_use", name, input }] }` | `{ type: "tool-use", tool: name, input: JSON.stringify(input) }` |
| `{ type: "user", content: [{ type: "tool_result", content }] }`       | `{ type: "tool-result", result: content }`                       |
| `{ type: "result", is_error: false }`                                 | Status → completed, attention → finished                         |
| `{ type: "result", is_error: true }`                                  | Status → failed, attention → failed                              |

## Codex Adapter Design

```typescript
class CodexProvider implements Provider {
  id = 'codex'
  name = 'Codex'

  start(config: SessionStartConfig): SessionHandle {
    // 1. Spawn: codex app-server
    // 2. Send initialize request, await response
    // 3. Send initialized notification
    // 4. Send thread/start with initial instructions
    // 5. Send turn/start with user message
    // 6. Listen for notifications and requests:
    //    - "item/agentMessage/delta" → accumulate text, emit assistant entry
    //    - "turn/complete" → emit completion
    //    - "item/commandExecution/requestApproval" → emit approval-request, set attention
    //    - "item/fileChange/requestApproval" → emit approval-request, set attention
    // 7. On approve: send JSON-RPC response with decision: "accept"
    // 8. On deny: send JSON-RPC response with decision: "deny"
    // 9. On stop: kill process
  }
}
```

### JSON-RPC client

```typescript
class JsonRpcClient {
  private nextId = 1
  private pending = new Map<number, { resolve, reject }>()

  constructor(private stdin: Writable, private stdout: Readable) {
    // Parse stdout lines, route responses to pending map, emit notifications
  }

  request(method: string, params?: unknown): Promise<unknown> { ... }
  notify(method: string, params?: unknown): void { ... }
  onRequest(callback: (method: string, params: unknown, id: number) => void): void { ... }
  respond(id: number, result: unknown): void { ... }
}
```

## Implementation Order

### Step 1: Provider detection + line parser

- Create `detect.ts` — check PATH for `claude` and `codex`
- Create `line-parser.ts` — shared newline-delimited JSON parser from readable stream
- Write tests
- **Verify:** detection finds binaries on your machine

### Step 2: Claude Code adapter

- Create `claude-code-provider.ts` implementing `Provider`
- Map Claude Code JSON events to TranscriptEntry
- Handle process lifecycle (spawn, stream, exit, error)
- Write tests with mock process
- **Verify:** can start a real Claude Code session (manual test)

### Step 3: Codex adapter + JSON-RPC client

- Create `jsonrpc.ts` — minimal JSON-RPC 2.0 client
- Create `codex-provider.ts` implementing `Provider`
- Handle handshake, thread management, turn flow
- Map Codex events to TranscriptEntry
- Handle approval requests via JSON-RPC responses
- Write tests with mock process
- **Verify:** can start a real Codex session (manual test)

### Step 4: Registration + UI

- Update `electron/main/index.ts` — detect and register real providers
- Update session start UI — show provider dropdown
- **Verify:** both providers appear in dropdown (if installed)

### Step 5: Verification gate

- All tests pass
- Manual test: run Claude Code session against a real repo
- Manual test: run Codex session against a real repo

## Verification Gate

```bash
npm install
npm run test:pure
npm run test:unit
npm run lint
npm run typecheck
npm run build
chaperone check --fix
```

Plus manual verification:

- Claude Code: start session → see real streaming → see tool uses → session completes
- Codex: start session → see streaming → approve tool use → session completes
- Provider dropdown shows only installed providers
- Missing provider shows clear message

## Risks

| Risk                              | Mitigation                                              |
| --------------------------------- | ------------------------------------------------------- |
| Claude Code CLI not installed     | Detect at startup, hide from provider list              |
| Codex CLI not installed           | Same detection approach                                 |
| Auth failures                     | Catch and surface as session error with clear message   |
| Process hangs                     | Add timeout + kill on stop                              |
| JSON parsing errors               | Log and skip malformed lines, don't crash               |
| Codex app-server protocol changes | Pin to known-working protocol, test against real binary |
