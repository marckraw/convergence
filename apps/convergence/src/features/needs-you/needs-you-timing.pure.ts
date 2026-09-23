import type { SessionSummary } from '@/entities/session'

function elapsedSeconds(start: string, end: number): number | null {
  const begin = Date.parse(start)
  if (!Number.isFinite(begin) || !Number.isFinite(end) || begin > end)
    return null
  return Math.floor((end - begin) / 1000)
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function elapsed(start: string, end: number): string | null {
  const seconds = elapsedSeconds(start, end)
  return seconds === null ? null : formatElapsed(seconds)
}

export interface NeedsYouTiming {
  label: string | null
  live: boolean
  tooltip: string
  /**
   * A live timing's running duration, as a number and as the card prints it
   * (MAR-3366 R4): a folded section names its longest turn by comparing the
   * seconds and showing the text, so it cannot say a different duration
   * from the card it summarises.
   */
  running?: { seconds: number; text: string }
}

function live(start: string, now: number, tooltip: string) {
  const seconds = elapsedSeconds(start, now)
  if (seconds === null) return null
  const text = formatElapsed(seconds)
  return { label: `· ${text}`, live: true, tooltip, running: { seconds, text } }
}

export function needsYouTiming(
  session: SessionSummary,
  now: number,
): NeedsYouTiming {
  const unknown = {
    label: null,
    live: false,
    tooltip: 'Timing unavailable: no reliable lifecycle timestamps recorded.',
  }
  if (
    session.attention === 'needs-approval' ||
    session.attention === 'needs-input'
  ) {
    return {
      ...unknown,
      tooltip:
        'Waiting on you. Waiting time is not recorded separately from turn time.',
    }
  }
  if (
    session.status !== 'running' &&
    session.status !== 'failed' &&
    session.parallelWork?.running &&
    session.attention !== 'failed'
  ) {
    const start = session.parallelWork.runningStartedAt
    return (
      (start &&
        live(
          start,
          now,
          'Elapsed since the oldest currently running background task started. Parallel task durations are not added together.',
        )) ||
      unknown
    )
  }
  const turn = session.turnTiming
  if (session.status !== 'running' && session.parallelWork?.unknown)
    return unknown
  if (!turn) return unknown
  if (session.status === 'running') {
    if (
      turn.status !== 'running' ||
      turn.endedAt ||
      session.hasActiveHandle !== true
    )
      return unknown
    return (
      live(
        turn.startedAt,
        now,
        'Elapsed wall time of the current turn, including tool execution. Not total conversation time.',
      ) ?? unknown
    )
  }
  const failed = session.attention === 'failed' || session.status === 'failed'
  const finished =
    session.attention === 'finished' || session.status === 'completed'
  if (
    !turn.endedAt ||
    (failed
      ? turn.status !== 'errored'
      : !finished || turn.status !== 'completed')
  )
    return unknown
  const end = Date.parse(turn.endedAt)
  const duration = end <= now ? elapsed(turn.startedAt, end) : null
  return duration
    ? {
        label: `${failed ? 'after' : 'in'} ${duration}`,
        live: false,
        tooltip:
          'Recorded wall time of the latest turn. This duration stops at the observed end of the turn.',
      }
    : unknown
}
