# Phase 3: Agent Runtime Core — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 2 (workspaces/worktrees, chaperone rules)

Historical note: this phase doc describes the original transcript-JSON runtime.
The current source of truth is `docs/specs/session-conversation-normalization.md`;
the live schema now persists normalized `session_conversation_items` and no
longer keeps `sessions.transcript` in the live `sessions` table.

## Objective

Build the provider-neutral runtime backbone that all agent integrations will plug into. After this phase, fake sessions can be created, streamed, paused for approval/input, completed, and failed — with full persistence and a minimal UI to prove it works. No real providers yet (Phase 5), but the model is solid enough that Claude Code and Codex adapters can drop in without changing the core.

## Product Context

Convergence is an **orchestrator**. The user manages many concurrent sessions across branches and projects. The app's job is to:

1. Let you spin up sessions quickly across workspaces
2. Tell you which sessions need your attention RIGHT NOW
3. Let you respond and go back to monitoring

The attention model is the core UX concept — not the transcript, not the provider. Everything feeds into: "what needs me?"

## Success Criteria

1. Sessions can be created targeting a project root or a specific workspace
2. Multiple sessions per workspace supported
3. FakeProvider simulates realistic lifecycle: streaming → approval request → approval → completion
4. Session transcript persists to SQLite and survives app restart
5. Attention state updates correctly: `none` → `needs-approval` → `none` → `finished`
6. Sessions can be stopped mid-run
7. Failed sessions surface clearly
8. Provider interface is clean enough that a new provider can be added by implementing one interface
9. Minimal UI shows session list, status badges, and basic transcript
10. Events flow from backend → renderer via IPC in real time

## Scope

### In scope

- Provider interface (`Provider`, `SessionHandle`)
- Provider registry (register/get providers)
- FakeProvider with deterministic simulation
- Session entity with full lifecycle (create, run, respond, stop, complete, fail)
- Session persistence in SQLite (transcript as JSON column)
- Attention state model
- Transcript entry types (user, assistant, tool-use, tool-result, approval-request, input-request, system)
- Event forwarding from backend to renderer via IPC
- Session service (CRUD + lifecycle management)
- Renderer session entity (types, store, API)
- Minimal session list UI on project view
- Minimal transcript display
- Inline approval/input response UI

### Out of scope

- Real providers (Claude Code, Codex) — Phase 5
- Full session UX (dedicated transcript view, composer, sidebar) — Phase 4
- Changed files panel — Phase 6
- Provider capability discovery — Phase 5
- Session search/filter
- Transcript virtualization/performance optimization

## Data Model

### Session States

```
                    ┌──────────┐
          start()   │          │  complete()
    ┌──────────────→│ running  │──────────────→ completed
    │               │          │
    │               └────┬─────┘
    │                    │
  idle            needs-approval    ←── approval requested
    │             needs-input       ←── input requested
    │                    │
    │               └────┴─────┘
    │                    │ approve()/respond()
    │                    ↓
    │               ┌──────────┐
    │               │ running  │ (continues)
    │               └──────────┘
    │
    └──────────────────────────────→ failed (on error)
```

### Attention States

| State            | Meaning                     | User action needed?   |
| ---------------- | --------------------------- | --------------------- |
| `none`           | Session running normally    | No                    |
| `needs-input`    | Agent waiting for user text | Yes — type and send   |
| `needs-approval` | Agent waiting for yes/no    | Yes — approve or deny |
| `finished`       | Agent completed its work    | No (informational)    |
| `failed`         | Agent crashed or errored    | No (inspect error)    |

### SQLite Schema (added to existing)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  attention TEXT NOT NULL DEFAULT 'none',
  working_directory TEXT NOT NULL,
  transcript TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

### TypeScript Types

```typescript
type SessionStatus = 'idle' | 'running' | 'completed' | 'failed'
type AttentionState =
  | 'none'
  | 'needs-input'
  | 'needs-approval'
  | 'finished'
  | 'failed'

interface Session {
  id: string
  projectId: string
  workspaceId: string | null
  providerId: string
  name: string
  status: SessionStatus
  attention: AttentionState
  workingDirectory: string
  transcript: TranscriptEntry[]
  createdAt: string
  updatedAt: string
}

type TranscriptEntry =
  | { type: 'user'; text: string; timestamp: string }
  | { type: 'assistant'; text: string; timestamp: string; streaming?: boolean }
  | { type: 'tool-use'; tool: string; input: string; timestamp: string }
  | { type: 'tool-result'; result: string; timestamp: string }
  | { type: 'approval-request'; description: string; timestamp: string }
  | { type: 'input-request'; prompt: string; timestamp: string }
  | { type: 'system'; text: string; timestamp: string }
```

### Provider Interface

```typescript
interface Provider {
  id: string
  name: string
  start(config: SessionStartConfig): SessionHandle
}

interface SessionStartConfig {
  sessionId: string
  workingDirectory: string
  initialMessage: string
}

interface SessionHandle {
  onTranscriptEntry: (callback: (entry: TranscriptEntry) => void) => void
  onStatusChange: (callback: (status: SessionStatus) => void) => void
  onAttentionChange: (callback: (attention: AttentionState) => void) => void

  sendMessage: (text: string) => void
  approve: () => void
  deny: () => void
  stop: () => void
}
```

Any provider (FakeProvider, ClaudeCodeProvider, CodexProvider) implements `Provider`. The runtime doesn't know or care which provider is running — it just calls `.start()` and subscribes to events.

### Provider Registry

```typescript
interface ProviderRegistry {
  register: (provider: Provider) => void
  get: (id: string) => Provider | undefined
  getAll: () => Provider[]
}
```

## IPC API Contract (additions)

```typescript
interface ElectronAPI {
  // ... existing project, dialog, workspace, git APIs unchanged

  session: {
    create: (input: CreateSessionInput) => Promise<Session>
    getByProjectId: (projectId: string) => Promise<Session[]>
    getById: (id: string) => Promise<Session | null>
    delete: (id: string) => Promise<void>
    start: (id: string, message: string) => Promise<void>
    sendMessage: (id: string, text: string) => Promise<void>
    approve: (id: string) => Promise<void>
    deny: (id: string) => Promise<void>
    stop: (id: string) => Promise<void>

    // Event subscriptions (main → renderer)
    onSessionUpdate: (callback: (session: Session) => void) => () => void
  }

  provider: {
    getAll: () => Promise<Array<{ id: string; name: string }>>
  }
}

interface CreateSessionInput {
  projectId: string
  workspaceId: string | null
  providerId: string
  name: string
}
```

### Event Flow

```
Backend (EventEmitter)           Main Process              Renderer
    │                                │                        │
    ├── transcript entry ──→ webContents.send() ──→ ipcRenderer.on()
    ├── status change   ──→ webContents.send() ──→ ipcRenderer.on()
    ├── attention change ──→ webContents.send() ──→ ipcRenderer.on()
    │                                │                        │
    │                                │                  Zustand store
    │                                │                  updates state
```

## Deliverables

### Backend — provider system

| File                                              | What it does                                             |
| ------------------------------------------------- | -------------------------------------------------------- |
| `electron/backend/provider/provider.types.ts`     | Provider, SessionHandle, SessionStartConfig interfaces   |
| `electron/backend/provider/provider-registry.ts`  | Register and retrieve providers                          |
| `electron/backend/provider/fake-provider.ts`      | FakeProvider: simulates streaming, approvals, completion |
| `electron/backend/provider/fake-provider.test.ts` | Tests fake provider lifecycle                            |

### Backend — session system

| File                                               | What it does                                                   |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `electron/backend/session/session.types.ts`        | Session, TranscriptEntry, status/attention types, row mapper   |
| `electron/backend/session/session.service.ts`      | Session CRUD + lifecycle (start, respond, approve, deny, stop) |
| `electron/backend/session/session.service.test.ts` | Tests session lifecycle with FakeProvider                      |

### Backend — database + IPC

| File                                          | What it does                                                 |
| --------------------------------------------- | ------------------------------------------------------------ |
| `electron/backend/database/database.ts`       | Updated: add sessions table                                  |
| `electron/backend/database/database.types.ts` | Updated: add SessionRow                                      |
| `electron/main/ipc.ts`                        | Updated: add session + provider handlers + event forwarding  |
| `electron/main/index.ts`                      | Updated: init providers, register session handlers           |
| `electron/preload/index.ts`                   | Updated: expose session + provider APIs + event subscription |
| `src/shared/types/electron-api.d.ts`          | Updated: add session + provider types                        |

### Renderer — entities

| File                                    | What it does                                                    |
| --------------------------------------- | --------------------------------------------------------------- |
| `src/entities/session/session.types.ts` | Session, TranscriptEntry, status/attention types (mirrored)     |
| `src/entities/session/session.api.ts`   | Typed wrapper for session IPC calls + event subscription        |
| `src/entities/session/session.model.ts` | Zustand store: sessions list, active session, real-time updates |
| `src/entities/session/index.ts`         | Public API barrel                                               |

### Renderer — minimal UI

| File                                                          | What it does                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/widgets/session-list/session-list.container.tsx`         | Loads sessions, subscribes to updates, shows list          |
| `src/widgets/session-list/session-list.presentational.tsx`    | Session cards with status/attention badges                 |
| `src/widgets/session-list/index.ts`                           | Public API barrel                                          |
| `src/features/session-start/session-start.container.tsx`      | Start a new session (pick provider, enter initial message) |
| `src/features/session-start/session-start.presentational.tsx` | Start session form                                         |
| `src/features/session-start/index.ts`                         | Public API barrel                                          |

### Updated app shell

| File                             | What it does                                              |
| -------------------------------- | --------------------------------------------------------- |
| `src/app/App.presentational.tsx` | Updated: project view shows session list below workspaces |
| `src/app/App.container.tsx`      | Updated: subscribes to session update events              |

## FakeProvider Behavior

The FakeProvider simulates a realistic agent session to prove the runtime works:

```
1. User sends initial message
2. Provider emits: { type: 'user', text: message }
3. Provider streams assistant response (3 chunks, 500ms apart)
4. Provider emits: { type: 'approval-request', description: 'Edit file: src/main.ts' }
5. Attention changes to: 'needs-approval'
6. User approves
7. Provider emits: { type: 'tool-use', tool: 'edit_file', input: 'src/main.ts' }
8. Provider emits: { type: 'tool-result', result: 'File edited successfully' }
9. Provider streams final assistant response
10. Session completes, attention → 'finished'
```

Configurable delays make it useful for UI development in Phase 4.

## Implementation Order

### Step 1: Provider types + registry + FakeProvider

- Create provider types, registry, FakeProvider
- Write FakeProvider tests
- **Verify:** fake provider simulates full lifecycle

### Step 2: Session service + DB schema

- Add sessions table to schema, SessionRow type
- Create session types, service (CRUD + lifecycle)
- Session service wires provider events to DB persistence
- Write session service tests
- **Verify:** sessions persist, transcripts grow, status/attention update

### Step 3: IPC + event forwarding

- Add session + provider IPC handlers
- Add event forwarding (webContents.send on session updates)
- Update preload with session APIs + event subscription
- Update type declarations
- **Verify:** typecheck passes

### Step 4: Renderer entity + minimal UI

- Create session entity (types, API, store with event subscription)
- Create session-list widget (status badges, attention indicators)
- Create session-start feature (provider picker, message input)
- Update app shell
- **Verify:** can start fake session, see transcript grow, approve, see completion

### Step 5: Verification gate

- All tests pass
- Full toolchain check
- Manual test: start fake session → stream → approve → complete

## Verification Gate

```bash
npm install                          # no errors
npm run test:pure                    # passes
npm run test:unit                    # passes
npm run lint                         # no errors
npm run typecheck                    # no type errors
npm run build                        # production build succeeds
chaperone check --fix                # passes
```

Plus manual verification:

- Start a fake session from the UI → see streaming transcript
- Session requests approval → attention badge shows "needs approval"
- Approve → session continues and completes
- Session shows "finished" badge
- Restart app → session and transcript persist

## Risks

| Risk                                    | Mitigation                                                           |
| --------------------------------------- | -------------------------------------------------------------------- |
| Event forwarding leaks if window closes | Clean up listeners on window close                                   |
| Transcript JSON grows large in SQLite   | Fine for Phase 3. Can move to files or paginate later.               |
| FakeProvider timers leak on stop        | Clear all timeouts/intervals in stop()                               |
| Multiple windows receive events         | Currently single-window. Add window targeting if multi-window comes. |
