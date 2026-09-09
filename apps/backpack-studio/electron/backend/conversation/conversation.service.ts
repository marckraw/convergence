import { RemoteExecutionHostError } from '@convergence/execution-host-client'
import type { ExecutionHostEventEnvelope } from '@mrck-labs/execution-host-protocol'
import type {
  ConversationSnapshot,
  ConversationSummary,
  SendMessageOutcome,
  StartConversationOutcome,
} from '../../../src/shared/api/studio-api.types'
import type { DaemonClient } from '../daemon/daemon-client'
import { describeDaemonFailure } from '../daemon/daemon-wire.pure'
import {
  applyEntry,
  conversationTitleFrom,
  emptyFold,
  foldEntries,
  type ConversationFold,
} from '../record/conversation-fold.pure'
import type {
  ConversationLogEntry,
  ConversationRecord,
  ConversationStore,
  LocalConversationFact,
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
  /**
   * Set while `streamError` is a gap the resume has not filled yet.
   *
   * A gap is the one loss that undoes itself: the reconnect asks from the last
   * contiguous sequence and the daemon replays what was missed, so the first
   * envelope that lands afterwards is the proof the hole is gone. An unreadable
   * frame has no such proof and keeps its sentence (MAR-2779 round 2).
   */
  gapAwaitingResume: boolean
  /**
   * Why the record last refused a write, while it is still refusing.
   *
   * A refused append ends the stream, and the reconnect meets the same disk and
   * ends the same way until the budget runs out — so the sentence the person is
   * finally left with would be "the stream dropped", which is true and useless.
   * The cause is kept so the last word names the disk that caused it.
   */
  recordFailure: string | null
  abort: AbortController | null
  /** The follow, so shutdown can wait for the writes it still owes. */
  following: Promise<void> | null
  /**
   * A send that has been let through and has not finished yet.
   *
   * Set in the same turn the guard reads it, which is the whole of it. The
   * fold cannot do this job: it only turns `running` after `sent` has been
   * written, and the write is an await — so two sends arriving inside that
   * window both read an idle fold, both post a command, and the person's two
   * sentences race each other into one turn the daemon never agreed to take.
   */
  recordWritten: boolean
  sending: boolean
}

export class ConversationService {
  private readonly conversations = new Map<string, LiveConversation>()
  private readonly now: () => string
  private readonly newId: () => string
  /** Set once, by `dispose`, so a shutting-down app never re-attaches. */
  private disposing = false

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
      const { entries, unreadableTailLines } = await this.deps.store.readLog(
        record.id,
      )
      const live: LiveConversation = {
        record,
        fold: foldEntries(emptyFold(record.createdAt), entries),
        unreadableTailLines,
        streamError: null,
        gapAwaitingResume: false,
        recordFailure: null,
        abort: null,
        following: null,
        recordWritten: true,
        sending: false,
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
    const live: LiveConversation = {
      record,
      fold: emptyFold(record.createdAt),
      unreadableTailLines: 0,
      streamError: null,
      gapAwaitingResume: false,
      recordFailure: null,
      abort: null,
      following: null,
      recordWritten: false,
      sending: false,
    }
    this.conversations.set(id, live)

    // The record's own write goes through the same door as every other one it
    // owes: a disk that will not take it is a sentence, not a bare rejection
    // escaping into the window with nothing on screen to explain it.
    try {
      await this.deps.store.create(record)
      live.recordWritten = true
    } catch (error) {
      return {
        kind: 'refused',
        conversationId: id,
        reason: this.reportDiskFailure(live, error),
      }
    }

    // The turn is recorded before the daemon is asked, for the same reason the
    // record is: a process that dies between the post and the writing of it
    // leaves a session running on the VPS that this app comes back believing
    // never happened.
    try {
      await this.recordLocal(live, 'sent')
    } catch (error) {
      return {
        kind: 'refused',
        conversationId: id,
        reason: this.reportDiskFailure(live, error),
      }
    }
    this.publish(live)

    try {
      await this.startOrContinue(live, text)
    } catch (error) {
      const reason = describeDaemonFailure(error)
      live.streamError = reason
      await this.recordRefusal(live, reason)
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
   *
   * The busy answer is decided and taken in ONE turn. Reading the fold and then
   * awaiting the write that moves it is check-then-act: a second send arriving
   * inside that await reads the same idle fold and is let through as well. The
   * renderer's own `sending` flag covers one window, and IPC already broadcasts
   * to as many windows as are open. `start` needs no such guard — every start
   * makes its own id, so two of them are two conversations rather than two
   * turns in one.
   */
  async send(id: string, text: string): Promise<SendMessageOutcome> {
    const live = this.conversations.get(id)
    if (!live) return { kind: 'refused', reason: 'That conversation is gone.' }
    if (live.fold.status === 'running' || live.sending) return { kind: 'busy' }
    live.sending = true
    try {
      return await this.sendInto(live, text)
    } finally {
      live.sending = false
    }
  }

  /** The send itself, once this conversation is known to be free to take it. */
  private async sendInto(
    live: LiveConversation,
    text: string,
  ): Promise<SendMessageOutcome> {
    const id = live.record.id
    if (!live.recordWritten) {
      try {
        await this.deps.store.create(live.record)
        live.recordWritten = true
      } catch (error) {
        return { kind: 'refused', reason: this.reportDiskFailure(live, error) }
      }
    }

    // Recorded before the wire, exactly as a start is: a restart between the
    // two comes back running and re-attaches, rather than showing a
    // conversation that quietly swallowed the sentence someone typed.
    try {
      await this.recordLocal(live, 'sent')
    } catch (error) {
      return { kind: 'refused', reason: this.reportDiskFailure(live, error) }
    }
    live.streamError = null
    this.publish(live)

    try {
      try {
        await this.deps.client.sendMessage(id, text)
      } catch (error) {
        if (
          !(
            error instanceof RemoteExecutionHostError &&
            error.kind === 'http' &&
            error.status === 404
          )
        )
          throw error
        if (await this.startOrContinue(live, text)) {
          await this.recordLocal(live, 'restarted')
          this.publish(live)
        }
      }
    } catch (error) {
      const reason = describeDaemonFailure(error)
      live.streamError = reason
      await this.recordRefusal(live, reason)
      this.publish(live)
      return { kind: 'refused', reason }
    }

    // The daemon answers a follow-up by running again and by echoing the
    // person's own words back as a conversation item, so nothing is invented
    // here: the transcript grows from the stream, as it does for a start.
    if (!this.disposing && !live.abort) this.follow(live)
    return { kind: 'sent' }
  }

  /** A conflict is the daemon saying this session already exists, so continue it. */
  private async startOrContinue(
    live: LiveConversation,
    text: string,
  ): Promise<boolean> {
    try {
      await this.deps.client.startSession({
        sessionId: live.record.id,
        providerId: this.deps.providerId,
        workingDirectory: this.deps.workingDirectory,
        initialMessage: text,
      })
      return true
    } catch (error) {
      if (
        !(
          error instanceof RemoteExecutionHostError &&
          error.kind === 'http' &&
          error.status === 409
        )
      )
        throw error
      await this.deps.client.sendMessage(live.record.id, text)
      return false
    }
  }

  /**
   * Stops following every conversation and waits for the appends already owed.
   *
   * The wait is the point. Aborting a stream mid-envelope and quitting would
   * leave the log missing what the snapshot on screen had already shown.
   */
  async dispose(): Promise<void> {
    this.disposing = true
    const following: Promise<void>[] = []
    for (const live of this.conversations.values()) {
      live.abort?.abort()
      if (live.following) following.push(live.following)
    }
    await Promise.all(following)
    await this.deps.store.drain()
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
          onDroppedFrame: (reason, loss) => {
            // A frame that did not reach the record is a hole in the
            // transcript. It never reaches the log — it is not this session's
            // to store — so the conversation carries the reason instead.
            live.streamError = reason
            // Said while it is true, and only until it stops being true: a gap
            // is answered by the resume, and `record` retires the sentence the
            // moment the replayed frames land.
            live.gapAwaitingResume = loss === 'gap'
            this.publish(live)
          },
        },
        abort.signal,
      )
      .catch(async (error: unknown) => {
        if (abort.signal.aborted) return
        // A stream that died is not a conversation that finished, and the dot
        // alone cannot say which happened. The giving-up is written down as
        // well as shown: a conversation whose stream we abandoned must not
        // come back from the next restart looking like one still at work.
        // A record that would not take the writes is why this stream kept
        // ending; saying "the stream dropped" would name the symptom and bury
        // the cause the person can actually do something about.
        const reason = live.recordFailure ?? describeDaemonFailure(error)
        live.streamError = reason
        await this.recordExhaustion(live, reason)
        this.publish(live)
      })
      .finally(() => {
        if (live.abort === abort) live.abort = null
        // One read can carry a whole conversation: after a torn log the resume
        // asks from an earlier sequence and the daemon replays several turns
        // coalesced, so the `completed` that ended the follow can sit in the
        // MIDDLE of the batch. The settled fold is the only honest reading, and
        // it is only settled once the stream has drained — a conversation still
        // running here has nothing streaming it, which is the zombie in a
        // different costume.
        // Only after an abort WE took. A stream that ended by failing must not
        // be re-opened from here — the budget it just spent is the decision,
        // and re-following on the strength of a `running` fold would reconnect
        // forever against a host that is not answering.
        if (
          abort.signal.aborted &&
          !this.disposing &&
          live.abort === null &&
          live.fold.status === 'running'
        ) {
          this.follow(live)
        }
      })
  }

  /** Ends the follow now, rather than when the aborted stream notices. */
  private stopFollowing(live: LiveConversation): void {
    live.abort?.abort()
    // Cleared eagerly as well as in the follow's `finally`, which runs a turn
    // later. `send` decides whether to re-attach by reading this, so a caller
    // arriving inside that turn would find an aborted controller and start no
    // stream. Nothing in the app is that caller today — a follow-up crosses
    // IPC, which is always a turn away — so this narrows a window the suite
    // cannot observe rather than fixing a reachable defect.
    live.abort = null
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
    const entry: ConversationLogEntry = {
      kind: 'wire',
      at: this.now(),
      envelope,
    }
    try {
      await this.appendAndFold(live, entry)
    } catch (error) {
      this.reportDiskFailure(live, error)
      // Thrown rather than swallowed: returning here would let the stream carry
      // on past an envelope that reached no disk, and the reader's high-water
      // mark would advance over it — a hole in the log that no resume ever asks
      // for again. The throw ends this stream at the last sequence actually
      // written, so the reconnect re-requests exactly what was lost.
      throw error
    }
    live.recordFailure = null
    // The envelope the resume was asking for. Nothing retired this sentence
    // before, so a conversation whose record came back whole — 1, 2, 3, 4, in
    // order — kept showing "gap: expected 3..." until the person typed their
    // next message: the recovery worked and the app said it had not.
    if (live.gapAwaitingResume) {
      live.gapAwaitingResume = false
      live.streamError = null
    }
    // A conversation that has stopped running has nothing left to stream. The
    // follow is ended here rather than left open for the app's lifetime — one
    // idle SSE per conversation is a connection the daemon holds for nobody.
    if (live.fold.status !== 'running') this.stopFollowing(live)
    this.publish(live)
  }

  /**
   * A local fact onto the record and then onto the fold, in that order.
   *
   * Disk first, exactly as a wire envelope: a fold that has run ahead of the
   * log is a status the next launch cannot reproduce. Throws when the record
   * would not take it, and the callers decide what that means for them.
   */
  private async recordLocal(
    live: LiveConversation,
    fact: LocalConversationFact,
  ): Promise<void> {
    await this.appendAndFold(live, { kind: 'local', at: this.now(), fact })
  }

  /**
   * The one door every entry goes through: the disk, then the fold.
   *
   * It is also where the warning about unreadable lines is retired. That count
   * is taken once, at hydrate, and the FIRST append of a process heals the log
   * it describes — so leaving it alone made the window warn for the rest of the
   * session about bytes that are no longer on disk.
   */
  private async appendAndFold(
    live: LiveConversation,
    entry: ConversationLogEntry,
  ): Promise<void> {
    await this.deps.store.appendEntry(live.record.id, entry, {
      accept: () =>
        entry.kind === 'local' || entry.envelope.seq > live.fold.lastSeq,
      apply: () => {
        live.unreadableTailLines = 0
        live.fold = applyEntry(live.fold, entry)
      },
    })
  }

  /**
   * Records that the daemon would not take a turn already written as `sent`.
   *
   * A disk that cannot take the refusal is reported rather than swallowed: the
   * conversation would otherwise be left reading `running` in memory with
   * nothing on disk to correct it, and the person deserves the sentence that
   * says why the window and the record disagree.
   */
  private async recordRefusal(
    live: LiveConversation,
    reason: string,
  ): Promise<void> {
    try {
      await this.recordLocal(live, 'refused')
    } catch (error) {
      live.streamError = `${reason} (and that could not be written to the record: ${describeDaemonFailure(error)})`
    }
  }

  /** The same, for a stream this app gave up re-establishing. */
  private async recordExhaustion(
    live: LiveConversation,
    reason: string,
  ): Promise<void> {
    try {
      await this.recordLocal(live, 'stream-exhausted')
    } catch (error) {
      live.streamError = `${reason} (and that could not be written to the record: ${describeDaemonFailure(error)})`
    }
  }

  /** One sentence for a record that would not take a write, said out loud. */
  private reportDiskFailure(live: LiveConversation, error: unknown): string {
    const sentence = `The conversation could not be written to disk: ${describeDaemonFailure(error)}`
    live.streamError = sentence
    live.recordFailure = sentence
    this.publish(live)
    return sentence
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
