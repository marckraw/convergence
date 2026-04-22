# Session + Conversation Normalization

> Parent: `docs/specs/project-spec.md`
> Builds on: the current Phase 3-6 runtime, session surface, and provider integrations

## Objective

Make the session model and conversation model explicit, provider-neutral, and
cheap to work with.

Today Convergence has a single `Session` object that mixes:

- session metadata
- runtime state
- a full embedded transcript
- a few side-channel fields (`attention`, `activity`, `contextWindow`,
  `continuationToken`)

That shape was good enough to land the first real providers, but it is now the
thing slowing down the next layer of product work.

The goal of this spec is to normalize two separate concepts:

1. **Session summary state** — the lightweight snapshot the app uses for the
   sidebar, needs-you queues, recents, project trees, and status surfaces.
2. **Conversation items** — the ordered first-class units inside a session:
   user messages, assistant responses, tool calls, tool results, approvals,
   input requests, notes, and future item kinds.

The normalization boundary should sit between provider adapters and the session
service, so Claude Code, Codex, Pi, and future providers all feed the same
canonical model.

## Why now

The current model has four real problems.

### 1. The transcript is flattened too early

Provider adapters currently collapse raw provider output directly into the
`TranscriptEntry` union plus separate status/attention/activity callbacks. That
means:

- provider-specific semantics are lost early
- new provider features require widening the transcript union or inventing more
  side channels
- a tool response is not a stable first-class object with its own identity

### 2. `Session` is carrying too much

`getAll()` and `getByProjectId()` currently return sessions with the full
transcript payload embedded. As conversations get longer, list surfaces start
paying for data they do not need.

This is the exact failure mode we do not want:

- sidebar loads conversations it will never render
- attention surfaces move large transcript JSON around just to show a badge
- every future session feature becomes more expensive than it needs to be

### 3. Session state and conversation state are split across unrelated channels

Right now the provider boundary is effectively:

- transcript entry callback
- status callback
- attention callback
- continuation token callback
- context window callback
- activity callback

This makes the session service responsible for stitching together what is
conceptually one normalized stream of updates.

### 4. We cannot treat every response as a single thing

The product need behind this work is simple:

- every assistant response should be copyable as one thing
- every tool call/result should be inspectable and copyable as one thing
- every approval or input request should be actionable as one thing
- every future feature should be able to react to normalized items without
  knowing which provider produced them

That is difficult when the canonical model is just a small transcript union
plus side channels.

## Actual use cases

This work is justified if it unlocks these concrete flows.

### 1. First-class item actions

From the transcript surface, the user should be able to act on a stable item:

- copy assistant response
- copy tool input
- copy tool output
- quote one item into a follow-up prompt
- fork a session from normalized conversation data instead of ad-hoc transcript
  serialization

### 2. Provider-neutral transcript rendering

The session view should render normalized conversation items without having to
know whether the source was:

- Claude stream-json
- Codex JSON-RPC
- Pi RPC

### 3. Summary/detail split for performance

The sidebar, global status bar, command center, recents, and attention queues
should operate on session summaries only.

The conversation should only load for:

- the active session
- explicit fetches like fork/export/search

### 4. A better base for future features

Normalization should make later work cheaper:

- per-item copy/share actions
- transcript search
- export
- better fork serialization
- changed-file provenance from tool results
- richer provider features like thinking blocks or MCP activity

## Product decision

Convergence moves to a **single canonical runtime model**:

- providers emit **normalized session deltas**
- the session service reduces those deltas into:
  - a lightweight `SessionSummary`
  - an ordered `ConversationItem[]`

We do **not** keep two live models in parallel.

Important nuance:

- using the old `transcript` column as a one-time upgrade input is acceptable
- continuing to treat the old transcript union as a first-class runtime model
  is not

## Non-goals

### Out of scope for this phase

- persisting raw provider event streams by default
- a full event-sourcing architecture
- redesigning the session UI from scratch
- rebuilding every provider-specific debugging surface
- perfect reconstruction of historical streaming boundaries from existing stored
  transcripts
- preserving currently running in-memory subprocesses across upgrade

### Explicitly not allowed

- no dual write path where both `transcript` JSON and normalized conversation
  rows are considered canonical
- no loading full conversation payloads into every session list query
- no append-one-row-per-delta persistence for streaming text

## Canonical models

### Session summary

`SessionSummary` becomes the default session shape used across the app.

```ts
interface SessionSummary {
  id: string
  projectId: string
  workspaceId: string | null
  providerId: string
  model: string | null
  effort: ReasoningEffort | null
  name: string
  status: SessionStatus
  attention: AttentionState
  activity: ActivitySignal
  contextWindow: SessionContextWindow | null
  workingDirectory: string
  archivedAt: string | null
  parentSessionId: string | null
  forkStrategy: ForkStrategy | null
  continuationToken: string | null
  lastSequence: number
  createdAt: string
  updatedAt: string
}
```

Key rule:

- `SessionSummary` does **not** contain the conversation.

### Conversation items

Each user-visible unit inside the session becomes a stable item with an id,
ordering, and optional turn grouping.

```ts
type ConversationItemKind =
  | 'message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'input-request'
  | 'note'

type ConversationItemState = 'streaming' | 'complete' | 'error'

interface ConversationItemBase {
  id: string
  sessionId: string
  sequence: number
  turnId: string | null
  kind: ConversationItemKind
  state: ConversationItemState
  createdAt: string
  updatedAt: string
  providerMeta: {
    providerId: string
    providerItemId?: string | null
    providerEventType?: string | null
  }
}

type ConversationItem =
  | (ConversationItemBase & {
      kind: 'message'
      actor: 'user' | 'assistant'
      text: string
      attachmentIds?: string[]
    })
  | (ConversationItemBase & {
      kind: 'thinking'
      actor: 'assistant'
      text: string
    })
  | (ConversationItemBase & {
      kind: 'tool-call'
      toolName: string
      inputText: string
    })
  | (ConversationItemBase & {
      kind: 'tool-result'
      toolName?: string | null
      relatedItemId?: string | null
      outputText: string
    })
  | (ConversationItemBase & {
      kind: 'approval-request'
      description: string
    })
  | (ConversationItemBase & {
      kind: 'input-request'
      prompt: string
    })
  | (ConversationItemBase & {
      kind: 'note'
      level: 'info' | 'warning' | 'error'
      text: string
    })
```

Key rules:

- every user-visible thing gets a stable item id
- streaming text updates patch an existing item; they do not create new rows
- `turnId` groups all items produced from one user prompt
- copy/export features operate on these items, not on provider payloads

### Normalized provider output

Provider adapters stop emitting `TranscriptEntry` plus multiple unrelated
callbacks. They emit one normalized delta stream.

```ts
type SessionDelta =
  | {
      kind: 'session.patch'
      patch: Partial<
        Pick<
          SessionSummary,
          | 'status'
          | 'attention'
          | 'activity'
          | 'contextWindow'
          | 'continuationToken'
          | 'updatedAt'
        >
      >
    }
  | {
      kind: 'conversation.item.add'
      item: Omit<ConversationItem, 'sessionId' | 'sequence'>
    }
  | {
      kind: 'conversation.item.patch'
      itemId: string
      patch: Partial<ConversationItem>
    }
```

This becomes the only live provider-to-session-service contract.

## Session service responsibilities

The session service becomes a reducer plus persister, not a transcript
assembler.

It owns:

- sequence assignment
- turn id assignment
- applying `SessionDelta`
- persisting session summary fields
- persisting conversation items
- broadcasting summary updates and conversation patches to the renderer

It no longer owns:

- provider-specific interpretation of raw protocol events
- ad-hoc annotation of transcript entries after the fact

## Persistence model

### Sessions table

Keep the existing `sessions` table as the home for summary state.

Add:

```sql
ALTER TABLE sessions ADD COLUMN last_sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN conversation_version INTEGER NOT NULL DEFAULT 2;
```

Notes:

- `continuation_token` already exists today and remains summary/session state
- `last_sequence` is the durable cursor for ordered conversation items
- `conversation_version` prevents repeated migration work and gives us a clean
  cut-over marker

### Conversation items table

Add a dedicated table:

```sql
CREATE TABLE IF NOT EXISTS session_conversation_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  turn_id TEXT,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  provider_item_id TEXT,
  provider_event_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_session_conversation_items_session_sequence
  ON session_conversation_items(session_id, sequence);
```

`payload_json` stores the kind-specific normalized fields. The row shape stays
small and stable; the TypeScript layer rehydrates it into the strong
`ConversationItem` union.

### What we do not persist

We do not persist raw provider event logs by default.

Reason:

- they are noisy
- they would grow much faster than the normalized conversation
- they are not required for the product use cases that justify this work

If raw debug capture is needed later, it should be opt-in and explicitly
separate from the canonical session model.

## Read model and IPC changes

### Read model split

The renderer should stop treating "session" as "session + transcript".

New shape:

- `getAll()` / `getByProjectId()` -> `SessionSummary[]`
- `getById(sessionId)` -> `SessionSummary | null`
- `getConversation(sessionId)` -> `ConversationItem[]`

### Live updates

Split IPC into two streams:

- `session:summaryUpdated` -> `SessionSummary`
- `session:conversationPatched` -> `{ sessionId, op, item }`

Why:

- list surfaces should not receive the whole conversation
- the active session view needs item-level updates for streaming
- this keeps global state cheap even for long conversations

## Provider mapping rules

The provider-specific code is still allowed to understand the provider. It is
not allowed to define app-level storage shapes ad hoc.

### Claude Code examples

- text delta -> patch current assistant `message` item
- `tool_use` block -> add `tool-call` item
- `tool_result` block -> add `tool-result` item
- process/result error -> add `note` item with `level: 'error'`, patch session
  to `failed`

### Codex examples

- `item/agentMessage/delta` -> patch current assistant `message` item
- `item/completed` command/file/mcp completion -> add `tool-result` item
- approval request -> add `approval-request` item and patch session attention
- input request -> add `input-request` item and patch session attention

### Pi examples

- `text_delta` -> patch current assistant `message` item
- `thinking_delta` -> patch current `thinking` item
- `toolcall_end` -> add `tool-call` item
- `tool_execution_end` -> add `tool-result` item

## Migration strategy

We do not care about wire compatibility with the old runtime model, but we do
care about not throwing away the sessions that already exist locally.

### One-time migration

On startup:

1. Create `session_conversation_items` if missing.
2. If the legacy `sessions.transcript` column still exists:
   - for each session where:
     - `conversation_version < 2` or missing, and
     - `session_conversation_items` has no rows
3. Read the existing `sessions.transcript` JSON.
4. Convert each old `TranscriptEntry` into a normalized `ConversationItem`.
5. Infer `turnId` using this rule:
   - new `turnId` on every `user` entry
   - subsequent assistant/tool/note items attach to the current turn when
     present
6. Write the new rows with monotonically increasing `sequence`.
7. Set `last_sequence` and `conversation_version = 2`.
8. Rebuild `sessions` without the legacy `transcript` column once normalized
   rows are confirmed present.

### Important limitations

- we do not attempt to reconstruct exact streaming boundaries
- old transcript rows will not gain provider-native ids retroactively
- currently running in-memory sessions are not resumed across upgrade; persisted
  sessions remain readable and continuable using their existing continuation
  token behavior

### Cut-over rule

After migration:

- all runtime reads come from `session_conversation_items`
- all runtime writes go to `session_conversation_items`
- `sessions.transcript` is used only as a legacy upgrade input when opening
  pre-normalization databases
- the live `sessions` schema no longer retains the `transcript` column after
  successful migration

This is the key "no dual model" rule.

## Regression guardrails

This change is worth doing only if these guardrails are enforced.

### 1. No conversation in summary queries

`SessionSummary` must stay cheap.

- no embedded transcript
- no embedded conversation items
- no hidden "preview blob" large enough to recreate the same problem

### 2. No per-delta row explosion

Streaming assistant text must update one item row, not append a row per chunk.

### 3. No `updatedAt` churn from harmless streaming patches

Session-level `updatedAt` should change for material session changes:

- new completed item
- status change
- attention change
- archive change
- explicit user message send

It should not bump on every small streaming delta, or snoozed/acknowledged
sessions will resurface too aggressively.

Per-item `updatedAt` is the place for streaming churn.

### 4. Active-session hydration only

The app may keep one or a few active conversations in memory, but global
surfaces must not eagerly hydrate every session conversation.

### 5. No raw provider payload persistence by default

If we start storing every raw protocol event, we will recreate the blow-up we
are explicitly trying to avoid.

## Implementation plan

### Step 1: Type and reducer layer

- add normalized `SessionSummary`, `ConversationItem`, and `SessionDelta`
  types
- add a small reducer/writer abstraction in the backend so providers cannot
  bypass the normalized boundary

### Step 2: Database + migration

- add `session_conversation_items`
- add `last_sequence` and `conversation_version`
- implement transcript-to-item migration

### Step 3: Session service cut-over

- replace transcript append logic with normalized item persistence
- keep session summary persistence in `sessions`
- emit split summary/item IPC updates

### Step 4: Provider cut-over

- update Claude Code, Codex, and Pi adapters to emit `SessionDelta`
- remove direct `TranscriptEntry` production from provider adapters

### Step 5: Renderer cut-over

- change the session store to summary/detail split
- active session view subscribes to normalized conversation items
- sidebar, command center, recents, and needs-you use summary state only

### Step 6: Feature cut-over

- update transcript rendering to consume `ConversationItem`
- update fork serialization to read normalized items
- add item-level copy actions once the item ids exist

### Step 7: Delete the old live model

- remove runtime dependence on `TranscriptEntry`
- stop including transcript in `Session` entity types
- leave physical DB cleanup of the old `transcript` column for a follow-up if
  we want to rebuild the table

## Success criteria

This normalization is successful if:

1. `getAll()` and `getByProjectId()` no longer move conversation payloads.
2. The active session transcript is driven by normalized conversation items.
3. Every assistant response, tool call, tool result, approval, and input
   request has a stable item id.
4. Claude Code, Codex, and Pi all use the same provider-to-session-service
   boundary.
5. Existing locally persisted sessions survive migration.
6. There is exactly one canonical live model after the cut-over.

## Open questions

These do not block the normalization itself, but they should stay visible.

### 1. Should `thinking` always be persisted?

Pros:

- richer transcript fidelity
- better future reasoning surfaces

Cons:

- can add noise
- some providers expose it inconsistently

Default recommendation:

- yes, persist it as a first-class item kind when exposed by the provider
- renderer may hide or collapse it by default

### 2. Do we need a separate `turns` table?

Not for the first cut.

`turnId` on items is enough for:

- copy whole turn
- collapse/expand turn groups
- fork/export serialization

Add a dedicated table later only if turn-level metadata becomes complex.

### 3. Should tool results be truncated in persistence?

Default recommendation:

- no truncation in canonical persistence
- UI preview can truncate
- large-output handling, if needed, should be a separate storage concern and
  not an excuse to keep the old transcript blob model
