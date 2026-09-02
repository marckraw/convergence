import type { ExecutionHostEventEnvelope } from '@mrck-labs/execution-host-protocol'
import type {
  ConversationSnapshot,
  ConversationSummary,
  SendMessageOutcome,
  StartConversationOutcome,
} from '../../../src/shared/studio-api/studio-api.types'
import type { DaemonClient } from '../daemon/daemon-client'
import { describeDaemonFailure } from '../daemon/daemon-wire.pure'
import {
  applyEnvelope,
  conversationTitleFrom,
  emptyFold,
  foldEnvelopes,
  type ConversationFold,
} from '../record/conversation-fold.pure'
import type {
  ConversationRecord,
  ConversationStore,
} from '../record/conversation-store.types'

/**
 * The one thing that knows both the daemon and the record (MAR-2770).
 *
 * @pattern Application service. It owns the sequence a conversation actually
 * has — create the record, post the start, follow the stream, append every
 * envelope, hand the window a snapshot — and it is the only place that sequence
 * exists. The client below it knows the wire and nothing about conversations;
 * the store beside it knows files and nothing about daemons.
 *
 * THE LOG IS THE TRUTH. Every snapshot here is folded out of envelopes, live
 * and replayed alike, by the same function. The in-memory folds are a cache of
 * that derivation and never a second source of it: on the next launch they are
 * rebuilt from the files, and if they were ever to disagree the files win by
 * construction, because they are all there is.
 */
export interface ConversationServiceDeps {
  store: ConversationStore
  client: DaemonClient
  /** The daemon-namespace provider id every conversation is started against. */
  providerId: string
  /** The directory on the daemon the Entity works in. */
  workingDirectory: string
  /** Pushed to every window whenever a conversation changes. */
  onSnapshot: (snapshot: ConversationSnapshot) => void
  now?: () => string
  newId?: () => string
}

interface LiveConversation {
  record: ConversationRecord
  fold: ConversationFold
  unreadableTailLines: number
  streamError: string | null
  abort: AbortController | null
  /** The follow, so shutdown can wait for the writes it still owes. */
  following: Promise<void> | null
}

export class ConversationService {
  private readonly conversations = new Map<string, LiveConversation>()
  private readonly now: () => string
  private readonly newId: () => string

  constructor(private readonly deps: ConversationServiceDeps) {
    this.now = deps.now ?? (() => new Date().toISOString())
    this.newId = deps.newId ?? (() => crypto.randomUUID())
  }

  /**
   * Reads every conversation back off disk and re-attaches to the ones that
   * were still running.
   *
   * The re-attach is what makes constitution law 5 true: the session runs on
   * the VPS, so closing the window does not end it, and re-opening has to
   * continue the conversation rather than replay it. It resumes from the fold's
   * own high-water mark, so the daemon sends only what happened while Studio
   * was not looking.
   */
  async hydrate(): Promise<void> {
    for (const record of await this.deps.store.list()) {
      const { envelopes, unreadableTailLines } = await this.deps.store.readLog(
        record.id,
      )
      const live: LiveConversation = {
        record,
        fold: foldEnvelopes(emptyFold(record.createdAt), envelopes),
        unreadableTailLines,
        streamError: null,
        abort: null,
        following: null,
      }
      this.conversations.set(record.id, live)
      if (live.fold.status === 'running') this.follow(live)
    }
  }

  list(): ConversationSummary[] {
    return [...this.conversations.values()]
      .map(({ record, fold }) => ({
        id: record.id,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: fold.updatedAt,
        status: fold.status,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  snapshot(id: string): ConversationSnapshot | null {
    const live = this.conversations.get(id)
    return live ? snapshotOf(live) : null
  }

  /**
   * Starts a conversation: the record first, then the daemon.
   *
   * The record is written before the start is posted, and that order is the
   * whole point. A start that succeeds and a record that was never written
   * leaves a session running on the VPS that this app has no name for and will
   * never re-attach to — a conversation nobody can find is worse than one that
   * failed to begin. The other order costs nothing: a start the daemon refuses
   * leaves a conversation in the list saying exactly why.
   */
  async start(text: string): Promise<StartConversationOutcome> {
    const id = this.newId()
    const record: ConversationRecord = {
      id,
      title: conversationTitleFrom(text),
      createdAt: this.now(),
      providerId: this.deps.providerId,
    }
    await this.deps.store.create(record)

    const live: LiveConversation = {
      record,
      fold: emptyFold(record.createdAt),
      unreadableTailLines: 0,
      streamError: null,
      abort: null,
      following: null,
    }
    this.conversations.set(id, live)
    this.publish(live)

    try {
      await this.deps.client.startSession({
        sessionId: id,
        providerId: this.deps.providerId,
        workingDirectory: this.deps.workingDirectory,
        initialMessage: text,
      })
    } catch (error) {
      const reason = describeDaemonFailure(error)
      live.fold = { ...live.fold, status: 'failed' }
      live.streamError = reason
      this.publish(live)
      return { kind: 'refused', conversationId: id, reason }
    }

    this.follow(live)
    return { kind: 'started', conversationId: id }
  }

  /**
   * Sends a follow-up into a conversation that is waiting.
   *
   * A running conversation is refused rather than queued, and refused by name:
   * the protocol has a queue and the daemon honours it, but Studio has no
   * surface that shows a queued message, no way to cancel one, and nothing that
   * says where it went. Half a queue is worse than none, so this beat says
   * `busy` and the composer says so too.
   */
  async send(id: string, text: string): Promise<SendMessageOutcome> {
    const live = this.conversations.get(id)
    if (!live) return { kind: 'refused', reason: 'That conversation is gone.' }
    if (live.fold.status === 'running') return { kind: 'busy' }

    try {
      await this.deps.client.sendMessage(id, text)
    } catch (error) {
      return { kind: 'refused', reason: describeDaemonFailure(error) }
    }

    // The daemon answers a follow-up by running again and by echoing the
    // person's own words back as a conversation item, so nothing is invented
    // here: the transcript grows from the stream, as it does for a start.
    live.fold = { ...live.fold, status: 'running' }
    live.streamError = null
    this.publish(live)
    if (!live.abort) this.follow(live)
    return { kind: 'sent' }
  }

  /**
   * Stops following every conversation and waits for the appends already owed.
   *
   * The wait is the point. Aborting a stream mid-envelope and quitting would
   * leave the log missing what the snapshot on screen had already shown.
   */
  async dispose(): Promise<void> {
    const following: Promise<void>[] = []
    for (const live of this.conversations.values()) {
      live.abort?.abort()
      if (live.following) following.push(live.following)
    }
    await Promise.all(following)
  }

  /**
   * Follows one conversation's stream until it ends or the app stops.
   *
   * Deliberately not awaited by its callers: a start returns as soon as the
   * daemon has accepted the session, and the transcript arrives afterwards. The
   * promise is kept so `dispose` can wait for the writes it still owes.
   */
  private follow(live: LiveConversation): void {
    const abort = new AbortController()
    live.abort = abort
    live.following = this.deps.client
      .followSession(
        live.record.id,
        live.fold.lastSeq,
        {
          onEnvelope: (envelope) => this.record(live, envelope),
          onDroppedFrame: (reason) => {
            // A frame that could not become an envelope is a hole in the
            // transcript. It never reaches the log — it is not this session's
            // to store — so the conversation carries the reason instead.
            live.streamError = reason
            this.publish(live)
          },
        },
        abort.signal,
      )
      .catch((error: unknown) => {
        if (abort.signal.aborted) return
        // A stream that died is not a conversation that finished, and the dot
        // alone cannot say which happened.
        live.streamError = describeDaemonFailure(error)
        this.publish(live)
      })
      .finally(() => {
        if (live.abort === abort) live.abort = null
      })
  }

  /**
   * One envelope onto the record and then onto the fold, in that order.
   *
   * Disk first: a snapshot that has run ahead of the log is a transcript the
   * next launch cannot reproduce. If the append fails the fold is left alone,
   * so what the window shows is exactly what a restart would rebuild.
   */
  private async record(
    live: LiveConversation,
    envelope: ExecutionHostEventEnvelope,
  ): Promise<void> {
    try {
      await this.deps.store.appendEnvelope(live.record.id, envelope)
    } catch (error) {
      live.streamError = `The conversation could not be written to disk: ${describeDaemonFailure(error)}`
      this.publish(live)
      return
    }
    live.fold = applyEnvelope(live.fold, envelope)
    this.publish(live)
  }

  private publish(live: LiveConversation): void {
    this.deps.onSnapshot(snapshotOf(live))
  }
}

function snapshotOf(live: LiveConversation): ConversationSnapshot {
  return {
    id: live.record.id,
    title: live.record.title,
    createdAt: live.record.createdAt,
    updatedAt: live.fold.updatedAt,
    status: live.fold.status,
    items: live.fold.items,
    streamError: live.streamError,
    unreadableTailLines: live.unreadableTailLines,
    orphanPatches: live.fold.orphanPatches,
  }
}
