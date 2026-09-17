import type {
  TrackerProbeReading,
  TrackerRefusalKind,
} from '@/shared/types/tracker.types'

/** A refusal, named for a person (MAR-3084 R9). */
export const TRACKER_REFUSAL_LABELS: Record<TrackerRefusalKind, string> = {
  unauthorized: 'Linear refused the API key',
  'rate-limited': 'Linear is rate limiting this key',
  unreachable: 'Linear could not be reached',
  'bad-response': 'Linear answered something unreadable',
}

/** What the last Test found: the count, or the refusal by name. */
export function trackerProbeSentence(reading: TrackerProbeReading): string {
  if (reading.probe.ok) {
    const n = reading.probe.issues
    return `${n} ${n === 1 ? 'issue' : 'issues'} in project`
  }
  return `${TRACKER_REFUSAL_LABELS[reading.probe.refusal.kind]} — ${reading.probe.refusal.message}`
}

/** A refused key is the one refusal a person fixes by entering it again. */
export function probeAsksForKey(reading: TrackerProbeReading | null): boolean {
  return (
    reading !== null &&
    !reading.probe.ok &&
    reading.probe.refusal.kind === 'unauthorized'
  )
}

/** `08:04` from an ISO time, in the viewer's zone. */
export function probeTimeLabel(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
