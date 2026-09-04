import type {
  ExecutionConversationItem,
  ExecutionHostEventEnvelope,
  ExecutionSessionStatus,
} from '@mrck-labs/execution-host-protocol'
import type {
  ConversationStatus,
  TranscriptItem,
} from '../../../src/shared/studio-api/studio-api.types'
import type {
  ConversationLogEntry,
  LocalConversationFact,
} from './conversation-store.types'

/**
 * The event log, folded into the conversation a person sees (MAR-2770).
 *
 * ONE function does it, and it is the same one for both readings. An entry
 * arriving live and an entry replayed off disk after a restart go through
 * `applyEntry`; `foldEntries` is that function reduced over a log. Two folds —
 * one for live, one for replay — is how a transcript comes back from a restart
 * looking subtly different from the one that was on screen when the window
 * closed, and there is no way to notice until somebody does.
 *
 * The log is the truth and this is the only derivation of it. Nothing here is
 * stored: status, items and `updatedAt` are all read out of the log, so there
 * is no second copy of any of them to drift. That includes the facts the wire
 * never carries — a turn we posted, a turn the daemon refused, a stream we gave
 * up on — which is exactly why they are log entries and not fields somewhere:
 * a status kept in memory alone cannot survive the restart that has to
 * reproduce it.
 */
export interface ConversationFold {
  status: ConversationStatus
  items: TranscriptItem[]
  /** The highest sequence this fold has seen; where a resume asks from. */
  lastSeq: number
  updatedAt: string
  /** Patches naming an item no add ever introduced. Zero in a healthy log. */
  orphanPatches: number
  /**
   * The last lifecycle fact Studio recorded, or null when it has recorded none.
   *
   * Kept because `refused` and `stream-exhausted` fold to the same `failed`
   * status while meaning opposite things about the daemon: a refused start
   * means no session was ever created there, and an exhausted stream means one
   * was. `send` has to tell them apart — a command posted to a session the
   * daemon never made can only 404 — and the status alone cannot.
   */
  lastFact: LocalConversationFact | null
}

/**
 * The fold of a conversation whose log says nothing at all.
 *
 * `idle` rather than `running`, and the difference is the whole of H2. An empty
 * log means the record exists and no turn was ever recorded against it, which
 * is a conversation nobody is waiting on. Seeding `running` here made every
 * silence look like work in progress: a start the daemon refused came back from
 * a restart as a permanent "Working" with the composer locked against it, and
 * nothing in the log would ever contradict that, because the reason it failed
 * had never been written down. A turn now says so itself — `sent` is a line in
 * the log before the daemon is asked — so the fold no longer has to guess.
 */
export function emptyFold(createdAt: string): ConversationFold {
  return {
    status: 'idle',
    items: [],
    lastSeq: 0,
    updatedAt: createdAt,
    orphanPatches: 0,
    lastFact: null,
  }
}

export function foldEntries(
  seed: ConversationFold,
  entries: readonly ConversationLogEntry[],
): ConversationFold {
  return entries.reduce(applyEntry, seed)
}

/**
 * One log entry onto a fold, whichever kind it is.
 *
 * The single door both readings go through — live and replay — so a local fact
 * and a wire envelope can never be ordered differently by the two paths.
 */
export function applyEntry(
  fold: ConversationFold,
  entry: ConversationLogEntry,
): ConversationFold {
  return entry.kind === 'local'
    ? applyLocalFact(fold, entry.fact, entry.at)
    : applyEnvelope(fold, entry.envelope, entry.at)
}

/**
 * A fact Studio recorded about itself.
 *
 * Each one moves the status to something a person can act on, and `refused` and
 * `stream-exhausted` both land on `failed` deliberately: a conversation the
 * daemon would not take and one whose stream we could not rebuild are both
 * broken, both honest to show as broken, and both sendable again — `send`
 * refuses only what is running.
 */
function applyLocalFact(
  fold: ConversationFold,
  fact: Extract<ConversationLogEntry, { kind: 'local' }>['fact'],
  at: string,
): ConversationFold {
  switch (fact) {
    case 'sent':
      return { ...fold, status: 'running', updatedAt: at, lastFact: fact }
    case 'refused':
    case 'stream-exhausted':
      return { ...fold, status: 'failed', updatedAt: at, lastFact: fact }
  }
}

/**
 * One envelope onto a fold, returning the next fold.
 *
 * Envelopes at or below the fold's high-water mark are ignored: a daemon replay
 * re-delivers what a resume already holds, and applying an add twice would
 * double a row of the transcript.
 *
 * `recordedAt` is when the log line was written, which is the only clock this
 * wire has: the protocol's envelope carries no timestamp.
 */
export function applyEnvelope(
  fold: ConversationFold,
  envelope: ExecutionHostEventEnvelope,
  recordedAt: string | null = null,
): ConversationFold {
  if (envelope.seq <= fold.lastSeq) return fold
  const next: ConversationFold = { ...fold, lastSeq: envelope.seq }
  const event = envelope.event

  switch (event.kind) {
    case 'status':
      // A status event changes what the list row says, so it changes when the
      // row was last updated. The protocol's envelope carries no time of its
      // own, so the log line's own is used; a line written before entries had
      // one leaves the time where it was rather than inventing a new one.
      return {
        ...next,
        status: conversationStatusFrom(event.status),
        updatedAt: recordedAt ?? next.updatedAt,
      }
    case 'delta':
      return applyDelta(next, event.delta)
    // Everything else is a signal this beat has no reader for. `attention`,
    // `activity`, `context-window` and `continuation-token` belong to surfaces
    // Studio has not built (the Inbox's richer states, the Narrator's cadence),
    // and `heartbeat` is the wire keeping itself warm. They are counted into
    // `lastSeq` above and otherwise left alone, so a resume never re-reads them.
    default:
      return next
  }
}

function applyDelta(
  fold: ConversationFold,
  delta: Extract<
    ExecutionHostEventEnvelope['event'],
    { kind: 'delta' }
  >['delta'],
): ConversationFold {
  switch (delta.kind) {
    case 'session.patch': {
      const status =
        delta.patch.status === undefined
          ? fold.status
          : conversationStatusFrom(delta.patch.status)
      return {
        ...fold,
        status,
        updatedAt: delta.patch.updatedAt ?? fold.updatedAt,
      }
    }
    case 'conversation.item.add': {
      const item = projectItem(delta.item)
      const existing = fold.items.findIndex((row) => row.id === item.id)
      // An add for an id already held replaces rather than appends: a replay
      // that overlaps what we have must leave the transcript identical, not
      // twice as long.
      const items =
        existing === -1
          ? [...fold.items, item]
          : fold.items.map((row, index) => (index === existing ? item : row))
      return { ...fold, items, updatedAt: delta.item.updatedAt }
    }
    case 'conversation.item.patch': {
      const index = fold.items.findIndex((row) => row.id === delta.itemId)
      if (index === -1) {
        // A patch for an item nothing introduced. It cannot be applied and it
        // must not be silent, so it is counted; the window shows the count.
        return { ...fold, orphanPatches: fold.orphanPatches + 1 }
      }
      const current = fold.items[index]
      const patch = delta.patch as Record<string, unknown>
      const updated: TranscriptItem = {
        ...current,
        text: patchedText(current, patch),
        state: isItemState(patch.state) ? patch.state : current.state,
      }
      return {
        ...fold,
        items: fold.items.map((row, at) => (at === index ? updated : row)),
        updatedAt:
          typeof patch.updatedAt === 'string'
            ? patch.updatedAt
            : fold.updatedAt,
      }
    }
    // Turns and their file changes describe work, not conversation. Studio's
    // transcript is the conversation; the Narrator and any future work view are
    // what would read these.
    default:
      return fold
  }
}

/**
 * The text a patch leaves on a row.
 *
 * A patch is read by NAME rather than structurally, and the name depends on the
 * row: the protocol's patch type is a union across item kinds, and the field
 * carrying a tool call's text is `inputText` while a tool result's is
 * `outputText`. Reading only `text` would have applied a message patch and
 * silently dropped every update to a tool row — the row would sit at whatever
 * the `add` first carried, looking complete.
 *
 * `text` and its siblings are alternatives to `textAppend`, never a pair to
 * merge: the protocol says that when both arrive the full text is
 * authoritative and the append is redundant. Merging them doubles the tail of
 * a reply.
 */
function patchedText(
  row: TranscriptItem,
  patch: Record<string, unknown>,
): string {
  const full = patch[FULL_TEXT_FIELD[row.kind]]
  if (typeof full === 'string') return full
  const append = patch.textAppend
  if (typeof append === 'string') return `${row.text}${append}`
  return row.text
}

/** Which wire field `projectItem` read this row's text out of. */
const FULL_TEXT_FIELD: Record<TranscriptItem['kind'], string> = {
  message: 'text',
  thinking: 'text',
  note: 'text',
  'tool-call': 'inputText',
  'tool-result': 'outputText',
  'approval-request': 'description',
  'input-request': 'prompt',
}

function isItemState(value: unknown): value is TranscriptItem['state'] {
  return value === 'streaming' || value === 'complete' || value === 'error'
}

/**
 * The daemon's four session statuses in the three the list can show.
 *
 * `completed` becomes `idle` deliberately: a conversation whose turn has
 * finished is one a person can talk to again, and that is the only thing the
 * status dot is for. `failed` stays its own answer — a conversation that broke
 * must never look like one that is merely waiting.
 */
export function conversationStatusFrom(
  status: ExecutionSessionStatus,
): ConversationStatus {
  switch (status) {
    case 'running':
      return 'running'
    case 'failed':
      return 'failed'
    case 'idle':
    case 'completed':
      return 'idle'
  }
}

/**
 * One wire item as one transcript row.
 *
 * A projection, not a summary: every kind the protocol carries gets a row, the
 * text is the wire's text, and the label says where the row came from. The
 * Narrator (constitution law 3) is the beat that compresses this; until it
 * exists, nothing may pretend to.
 */
export function projectItem(item: ExecutionConversationItem): TranscriptItem {
  const base = { id: item.id, state: item.state } as const
  switch (item.kind) {
    case 'message':
      return {
        ...base,
        kind: 'message',
        actor: item.actor,
        label: item.actor === 'user' ? 'You' : 'Assistant',
        text: item.text,
      }
    case 'thinking':
      return {
        ...base,
        kind: 'thinking',
        actor: 'assistant',
        label: 'Thinking',
        text: item.text,
      }
    case 'tool-call':
      return {
        ...base,
        kind: 'tool-call',
        actor: null,
        label: `Tool · ${item.toolName}`,
        text: item.inputText,
      }
    case 'tool-result':
      return {
        ...base,
        kind: 'tool-result',
        actor: null,
        label: `Result · ${item.toolName ?? 'tool'}`,
        text: item.outputText,
      }
    case 'approval-request':
      return {
        ...base,
        kind: 'approval-request',
        actor: null,
        label: 'Approval requested',
        text: item.description,
      }
    case 'input-request':
      return {
        ...base,
        kind: 'input-request',
        actor: null,
        label: 'Input requested',
        text: item.prompt,
      }
    case 'note':
      return {
        ...base,
        kind: 'note',
        actor: null,
        label: `Note · ${item.level}`,
        text: item.text,
      }
  }
}

/** How much of a first message becomes the conversation's name in the list. */
const TITLE_LIMIT = 80

/**
 * A conversation's title: the first sentence a person typed.
 *
 * Their words, shortened, never generated — the list has to be recognisable at
 * a glance by the person who wrote the thing, and a model-written title is a
 * different sentence about the same conversation.
 */
export function conversationTitleFrom(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed === '') return 'Untitled conversation'
  const sentence = /^(.*?[.!?])(\s|$)/.exec(collapsed)?.[1] ?? collapsed
  return sentence.length <= TITLE_LIMIT
    ? sentence
    : `${sentence.slice(0, TITLE_LIMIT - 1).trimEnd()}…`
}
