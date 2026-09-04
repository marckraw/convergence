/**
 * The contract between Backpack Studio's main process and its window
 * (MAR-2770).
 *
 * One module, imported by all three sides — the IPC handlers, the preload
 * bridge and the renderer's API wrapper — rather than an ambient `.d.ts` in the
 * renderer transcribing what the backend exposes. Two encodings of one fact
 * drift, and the drift lands at the boundary where nothing typechecks it: a
 * renderer whose hand-written declaration says `string` for a field main has
 * started sending as `null` compiles green on both sides and fails on a user's
 * machine.
 *
 * Nothing secret appears here, and that is a rule rather than a coincidence:
 * the daemon's URL and token live in the main process alone (constitution law
 * 6, and the run's own boundary). What crosses is what the window has to draw.
 */

/** Conversation states the list is allowed to show (kickoff: the Inbox's seed). */
export type ConversationStatus = 'running' | 'idle' | 'failed'

/**
 * Studio's state at launch: either it knows where to work, or it says exactly
 * what it is missing.
 *
 * A missing variable is a configuration answer, not a crash — the app opens
 * either way and the window explains itself.
 */
export type StudioStartup =
  | { kind: 'misconfigured'; missing: string[] }
  | {
      kind: 'ready'
      providerId: string
      /**
       * What the handshake made of the daemon, or null while it is still
       * asking.
       *
       * Nullable on purpose: startup resolves as soon as the RECORD is
       * readable, because the conversations already on disk are what the
       * window is for and they do not depend on a machine answering. A
       * black-holed host used to hold the whole window shut for half a minute.
       * `null` means "not yet", never "fine" — the banner says nothing until
       * there is something true to say, and the answer arrives by push.
       */
      daemon: DaemonStatusView | null
    }

/**
 * What the startup handshake made of the daemon, in the window's vocabulary.
 *
 * `advertisedProviders` is here for one failure this run expects to meet: the
 * configured provider id is a name the daemon either has or does not, and a
 * start refused for that reason is unreadable unless the app can say which
 * names the machine actually offers.
 */
export interface DaemonStatusView {
  status: 'connected' | 'unreachable' | 'unauthorized' | 'incompatible'
  headline: string
  detail: string | null
  /** Provider ids the daemon advertises; empty when it never answered. */
  advertisedProviders: string[]
  /** The configured provider is not among the ones the daemon advertises. */
  providerMissing: boolean
}

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  status: ConversationStatus
}

/** Every conversation-item kind the wire carries, projected one for one. */
export type TranscriptItemKind =
  | 'message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'input-request'
  | 'note'

/**
 * One row of the raw transcript.
 *
 * Raw on purpose: this run has no Narrator (constitution law 3), so a row says
 * what the wire said and the label names where it came from. Nothing here is
 * summarised, and nothing is invented — every row is a conversation item the
 * daemon sent, including the user's own message, which the daemon echoes back
 * as an item of its own.
 */
export interface TranscriptItem {
  id: string
  kind: TranscriptItemKind
  /** The person or the Entity; null for rows that are neither. */
  actor: 'user' | 'assistant' | null
  /** The row's heading: an actor, a tool name, or a note's level. */
  label: string
  text: string
  state: 'streaming' | 'complete' | 'error'
}

export interface ConversationSnapshot {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  status: ConversationStatus
  items: TranscriptItem[]
  /**
   * Why Studio stopped following this conversation, when it did — a stream that
   * could not be re-established, or a start the daemon refused.
   *
   * A conversation whose stream died is not the same thing as one that finished,
   * and a status dot alone cannot tell them apart.
   */
  streamError: string | null
  /**
   * Events on disk that could not be read back, counted rather than swallowed.
   *
   * `unreadableTailLines` is a torn append at the end of the log — the one
   * failure an append-only file has. `orphanPatches` is a patch naming an item
   * no add ever introduced. Both are zero in every healthy run; a reader who
   * sees one is looking at an incomplete transcript and deserves to know.
   */
  unreadableTailLines: number
  orphanPatches: number
}

export type StartConversationOutcome =
  | { kind: 'started'; conversationId: string }
  | { kind: 'refused'; conversationId: string; reason: string }

export type SendMessageOutcome =
  | { kind: 'sent' }
  /** The Entity is still working. Studio does not queue input yet, and says so. */
  | { kind: 'busy' }
  | { kind: 'refused'; reason: string }

export interface ConversationEvent {
  conversationId: string
  snapshot: ConversationSnapshot
}

/** The whole of `window.backpackStudio`. */
export interface StudioApi {
  platform: string
  getStartup(): Promise<StudioStartup>
  listConversations(): Promise<ConversationSummary[]>
  startConversation(text: string): Promise<StartConversationOutcome>
  sendMessage(conversationId: string, text: string): Promise<SendMessageOutcome>
  getTranscript(conversationId: string): Promise<ConversationSnapshot | null>
  /** Subscribes to snapshot pushes. Returns the unsubscribe. */
  onConversationEvent(listener: (event: ConversationEvent) => void): () => void
  /** Subscribes to the daemon handshake landing. Returns the unsubscribe. */
  onDaemonStatus(listener: (daemon: DaemonStatusView) => void): () => void
}
