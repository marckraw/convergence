import type { ExecutionHostEventEnvelope } from '@mrck-labs/execution-host-protocol'

/**
 * What a conversation is on disk, and the only facts stored rather than derived
 * (MAR-2770).
 *
 * Everything a person sees changing — the status dot, the last-updated time,
 * the transcript itself — is folded out of the event log and appears nowhere
 * here. Two encodings of one fact drift, and a status column that disagreed
 * with the events beneath it would be a lie no gate could catch.
 *
 * `id` is also the daemon's session id. One conversation is one remote session
 * (constitution law 4: no projects, just conversations), so a second identifier
 * would only be a second thing to keep in step.
 */
export interface ConversationRecord {
  id: string
  title: string
  createdAt: string
  /** The daemon-namespace provider this conversation was started against. */
  providerId: string
}

/**
 * A lifecycle fact Studio itself owns, because the wire never carries it.
 *
 * These are the three moments the daemon cannot tell us about: a turn we posted
 * (or tried to), a turn it would not take, and a stream we gave up
 * re-establishing. Before they existed they lived only in memory, and a status
 * kept outside the log is a status a restart cannot reproduce — a refused start
 * came back as a permanent "Working" that no composer would ever unlock.
 *
 * `refused` covers a refused start and a refused follow-up alike: both are the
 * daemon declining a turn already recorded as `sent`, and one fact that healed
 * only the start would leave the same zombie behind the other door.
 */
export type LocalConversationFact = 'sent' | 'refused' | 'stream-exhausted'

/**
 * One line of the log: an envelope off the wire, or a fact Studio recorded.
 *
 * They share the log because they share the fold. A local fact kept anywhere
 * else would be a second source of status beside the one the transcript is
 * derived from, and the two would be free to disagree the moment a process
 * died between them.
 *
 * `at` is when the line was written. It is nullable for wire entries alone,
 * and only for lines written before this shape existed: those are bare
 * envelopes with no recorded time, and inventing one for them would date a
 * conversation by when it was read.
 */
export type ConversationLogEntry =
  | { kind: 'wire'; at: string | null; envelope: ExecutionHostEventEnvelope }
  | { kind: 'local'; at: string; fact: LocalConversationFact }

/** What came back off an append-only log, and what could not be read. */
export interface ConversationLogReading {
  entries: ConversationLogEntry[]
  /**
   * Lines after the last readable one, counted rather than skipped.
   *
   * A crash mid-append is the one failure an append-only file has. Reading past
   * a torn line would splice a hole into the middle of a transcript and show it
   * as though it were whole, so the read stops there and reports how much it
   * refused to guess at.
   */
  unreadableTailLines: number
}

/**
 * The local record (constitution law 8), behind the interface that is the
 * actual promise.
 *
 * The implementation this run ships is JSON files. SQLite arrives with the
 * extraction run; the point of naming the seam now is that the swap is a new
 * class and nothing else. Every method is asynchronous for that reason — a
 * synchronous file read would be an interface only a file can satisfy.
 */
export interface ConversationStore {
  list(): Promise<ConversationRecord[]>
  read(id: string): Promise<ConversationRecord | null>
  create(record: ConversationRecord): Promise<void>
  appendEntry(id: string, entry: ConversationLogEntry): Promise<void>
  readLog(id: string): Promise<ConversationLogReading>
}
