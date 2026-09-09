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

export function readEnvelopeSeq(
  lastSeq: number,
  seq: number,
): EnvelopeSeqReading {
  if (seq <= lastSeq) return 'duplicate'
  if (seq > lastSeq + 1) return 'gap'
  return 'accept'
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
  return `gap: expected ${lastSeq + 1}, got ${seq}; reconnecting from ${lastSeq}`
}
