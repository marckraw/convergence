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

/** What came back off an append-only log, and what could not be read. */
export interface ConversationLogReading {
  envelopes: ExecutionHostEventEnvelope[]
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
  appendEnvelope(
    id: string,
    envelope: ExecutionHostEventEnvelope,
  ): Promise<void>
  readLog(id: string): Promise<ConversationLogReading>
}
