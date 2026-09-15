/**
 * What one envelope's sequence number means, given the last one this client
 * actually kept (MAR-2779).
 *
 * The wire protocol states the rule and neither client obeyed it:
 * "a gap in received seq numbers means events were missed and the client must
 * reconnect with its last contiguous seq rather than continue"
 * (`docs/architecture/execution-host-wire-protocol.md`). Both readers dropped
 * anything at or below the high-water mark and then took ANY higher sequence as
 * the new mark -- so a lost `3` was not a detected loss, it was a transcript
 * that quietly skipped an event and a cursor that had moved past the hole
 * forever. Studio's record is append-only, so the hole was permanent there.
 *
 * One organ rather than two `if`s, because the two clients had already drifted
 * once: Convergence traced its duplicate drop and Studio silently `continue`d,
 * and the third case was missing from both. A rule that lives in one function
 * cannot be half-implemented in one app and not the other -- and the daemon
 * serves both, so a disagreement about what its sequence numbers mean is a
 * disagreement about what its sessions said.
 *
 * Pure and total: three readings, no IO, no policy. What to DO about a gap --
 * close the stream, resume from `lastSeq`, spend an attempt from the reconnect
 * budget -- is each client's reconnect loop, which is the only thing that knows
 * its own budget.
 */

/**
 * `accept` — the next contiguous envelope; keep it and advance the mark.
 * `duplicate` — at or below the mark. A replay re-delivers what a resume
 * already holds, which is normal and must not be written twice.
 * `gap` — above the next expected sequence. Events were missed in transit; the
 * daemon still holds them and will replay them from the mark on reconnect.
 */
export type EnvelopeSeqReading = 'accept' | 'duplicate' | 'gap'

/**
 * Where in a stream's life this envelope arrived, which is what decides
 * whether a hole under it is a loss or a prune (MAR-3051).
 *
 * `live` — the strict reading: the next number is the only number, and
 * anything higher means frames went missing in transit (MAR-2779).
 * `resumed` — the first envelope of a stream opened with `Last-Event-ID`. The
 * daemon has just answered "everything above your cursor is this", so a hole
 * below it is not a loss: it is the daemon's own pruned history. Nothing else
 * can heal a gap, and this IS that something else having spoken.
 * `replay` — inside a replay the daemon has marked as such, where the same
 * argument holds for every frame until it says it is caught up.
 */
export type EnvelopeSeqPhase = 'live' | 'resumed' | 'replay'

/**
 * The daemon deletes superseded streaming patches out of the middle of its own
 * log (`envelope-pruning.pure.ts`, MAR-2218a): "Deleting them leaves gaps in
 * `seq`, which the resume contract already tolerates." Read strictly, every
 * such hole was an unhealable loss — the client resumed from its cursor, the
 * daemon replayed the same hole, and ten attempts later a live run was marked
 * failed (MAR-3051, seat `0baa87b8`: 6,337 of 18,369 sequences pruned).
 *
 * So the phase is part of the reading. A hole seen on the first frame of a
 * resume, or inside a marked replay, is the daemon confirming there is nothing
 * to fetch; a hole on any later live frame is still a gap, and the reconnect
 * that follows is still what tells the two apart.
 */
export function readEnvelopeSeq(
  lastSeq: number,
  seq: number,
  phase: EnvelopeSeqPhase = 'live',
): EnvelopeSeqReading {
  if (seq <= lastSeq) return 'duplicate'
  if (seq > lastSeq + 1 && phase === 'live') return 'gap'
  return 'accept'
}

/**
 * The phase a stream is in after it has read one envelope.
 *
 * Only the FIRST envelope after a resume is forgiven: the daemon answered the
 * cursor once, and a second hole further down the same stream is a frame lost
 * in transit like any other. A marked replay keeps its phase until the
 * `caught-up` frame ends it, and a live stream never leaves `live`.
 */
export function nextEnvelopeSeqPhase(
  phase: EnvelopeSeqPhase,
  reading: EnvelopeSeqReading,
): EnvelopeSeqPhase {
  if (phase === 'resumed' && reading === 'accept') return 'live'
  return phase
}

/**
 * The SSE event names the daemon may put on the replay boundary (MAR-3051 S1).
 *
 * The two names are not the same kind of frame. `replay` is the name ON a
 * replayed envelope -- `event: replay`, `id`, `data` -- so a client that reads
 * it moves its phase and then decodes the frame like any other; skipping it
 * drops the replay itself. `caught-up` is the only standalone frame, carrying
 * no envelope. That is the deployed daemon's shape (`414f7403`). A daemon that
 * sends neither leaves the `resumed` phase above to carry the whole rule, and
 * absence is not an error: a client reads the names when they are there and
 * reads the stream exactly as before when they are not.
 */
export const EXECUTION_HOST_REPLAY_EVENT = 'replay'
export const EXECUTION_HOST_CAUGHT_UP_EVENT = 'caught-up'

/**
 * `data: {"throughSeq": N}` on a `caught-up` frame, or null when the frame
 * says something this client cannot read.
 *
 * Null is deliberately not zero: a frame whose payload is unreadable must
 * leave the cursor alone rather than move it to the start of the log.
 */
export function readCaughtUpThroughSeq(data: string): number | null {
  try {
    const parsed: unknown = JSON.parse(data)
    const value =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { throughSeq?: unknown }).throughSeq
        : undefined
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : null
  } catch {
    return null
  }
}

/**
 * What a client writes when it steps over a hole because the daemon's own
 * replay put the next frame there.
 *
 * Said out loud for the same reason `describeSeqGap` is: a remote session's
 * debug log is the only place its wire can be inspected, and "accepted 15841
 * after 15838" with no sentence under it is indistinguishable from the silent
 * skipping this rule replaced (MAR-2779).
 */
export function describeConfirmedPrune(lastSeq: number, seq: number): string {
  return `pruned history confirmed by the daemon's replay: ${describeSeqHole(
    lastSeq,
    seq,
  )}`
}

/**
 * The one sentence both clients write when they see a gap.
 *
 * A remote session's debug log is the only place its wire can be inspected at
 * all, and a reconnect that leaves no trace is indistinguishable from a daemon
 * that simply went quiet. Shared with the reading itself so the two apps cannot
 * describe the same event differently -- someone reading a Studio log and a
 * Convergence log about one daemon is reading about one daemon.
 */
export function describeSeqGap(lastSeq: number, seq: number): string {
  return `gap: ${describeSeqHole(lastSeq, seq)}; reconnecting from ${lastSeq}`
}

/**
 * The hole alone: what was expected, and what arrived instead.
 *
 * Split out of the sentence above because the two are said at different
 * moments. `describeSeqGap` is said while the resume is still coming — it ends
 * with where the reconnect will start, which is the useful half of it — and
 * this one is said afterwards, by a client that has stopped reconnecting.
 * Telling someone a stream gave up and then that it is "reconnecting from 2"
 * in the same breath is the sentence contradicting itself.
 */
export function describeSeqHole(lastSeq: number, seq: number): string {
  return `expected ${lastSeq + 1}, got ${seq}`
}

/**
 * The last word on a stream that spent its reconnect budget with a hole still
 * open.
 *
 * "The stream could not be re-established" is true of every exhausted budget
 * and says nothing about what was lost. A gap is the one loss whose own
 * sentence the exhaustion supersedes — the resume it promised never came — so
 * the hole travels into the last word rather than being replaced by it
 * (MAR-2779 round 3).
 *
 * The trailing full stop is moved rather than doubled: both callers pass a
 * finished sentence, and `…re-established.: expected 3, got 4` is not one.
 */
export function describeStreamEndAboveHole(
  sentence: string,
  hole: string,
): string {
  return `${sentence.replace(/\.$/, '')}: ${hole}.`
}
