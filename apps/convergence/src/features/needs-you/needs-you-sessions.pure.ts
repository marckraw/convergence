import {
  SESSION_STATE_TONE,
  type NeedsYouDismissals,
  type SessionSummary,
} from '@/entities/session'

/**
 * Whether a conversation waits on you (Marcin's ruling 6, 2 Oct 2026): it
 * asks for an approval or for input, or its run failed. Finished work waiting
 * for review is not counted, and neither is a run on a host the app can't
 * reach: that run is alive on the far machine, whatever its last status said
 * (MAR-3051), as the Needs-you card reads it.
 */
export function waitsOnYou(
  session: Pick<SessionSummary, 'attention' | 'status'>,
): boolean {
  if (session.attention === 'host-unreachable') return false
  return (
    session.attention === 'needs-approval' ||
    session.attention === 'needs-input' ||
    session.attention === 'failed' ||
    session.status === 'failed'
  )
}

/**
 * The conversations "N need you" counts (NAV-32 N1, ruling 6): the one
 * derivation behind the phrase, so the collapsed rail, the status bar and
 * Mission Control can't show three numbers for one sentence again. A
 * conversation snoozed or acknowledged at this very update is left out until
 * it moves; an archived one is out of the queue.
 */
export function needsYouSessions<
  T extends Pick<
    SessionSummary,
    'id' | 'attention' | 'status' | 'archivedAt' | 'updatedAt'
  >,
>(sessions: readonly T[], dismissals: NeedsYouDismissals): T[] {
  return sessions.filter(
    (session) =>
      !session.archivedAt &&
      waitsOnYou(session) &&
      dismissals[session.id]?.updatedAt !== session.updatedAt,
  )
}

/** The two tones what waits on you can wear, from the session's own map. */
export type NeedsYouTone =
  | typeof SESSION_STATE_TONE.waiting
  | typeof SESSION_STATE_TONE.failed

/**
 * The tone of what waits on you (R1, NAV-1): warning while any of it asks for
 * an answer, danger when only failed runs wait, nothing when nothing does.
 * The rail's mark and count, and the status bar's chips, wear it.
 */
export function needsYouTone(
  sessions: readonly Pick<SessionSummary, 'attention' | 'status'>[],
): NeedsYouTone | null {
  const waiting = sessions.filter(waitsOnYou)
  if (waiting.length === 0) return null
  return waiting.some(
    (session) =>
      session.attention === 'needs-approval' ||
      session.attention === 'needs-input',
  )
    ? SESSION_STATE_TONE.waiting
    : SESSION_STATE_TONE.failed
}
