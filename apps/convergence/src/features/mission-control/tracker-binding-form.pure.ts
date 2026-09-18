import type {
  TrackerProbeReading,
  TrackerProjectResolution,
  TrackerRefusalKind,
} from '@/shared/types/tracker.types'

/** A refusal, named for a person (MAR-3084 R9). */
export const TRACKER_REFUSAL_LABELS: Record<TrackerRefusalKind, string> = {
  unauthorized: 'Linear refused the API key',
  'rate-limited': 'Linear is rate limiting this key',
  unreachable: 'Linear could not be reached',
  'bad-response': 'Linear answered something unreadable',
}

/** What a bound id nothing answers to reads as (MAR-3156 R4). */
export const TRACKER_PROJECT_MISSING_SENTENCE =
  'No project with this id is visible to this key'

/**
 * What the last Test found (MAR-3156 R4).
 *
 * Two things the old sentence got wrong. It said "issues" for a number that
 * only ever counted the issues carrying a SEAT label, and it said
 * `0 issues in project` for an id no project answers to -- the same words a
 * quiet project gets, which is how a mistyped id looked healthy. So the
 * count says what it counted, the project says its name, and a project the
 * key cannot see is its own sentence with no number in it.
 */
export function trackerProbeSentence(reading: TrackerProbeReading): string {
  if (reading.probe.ok) {
    if (reading.probe.projectName === null) {
      return TRACKER_PROJECT_MISSING_SENTENCE
    }
    const n = reading.probe.issues
    return `${n} labeled ${n === 1 ? 'issue' : 'issues'} in ${reading.probe.projectName}`
  }
  return `${TRACKER_REFUSAL_LABELS[reading.probe.refusal.kind]} — ${reading.probe.refusal.message}`
}

/** What the Project field says it takes (MAR-3156 R1). */
export const TRACKER_PROJECT_FIELD_HINT = 'URL, name or id'

/** Asked for a URL or a name with no key stored yet (MAR-3156 R3). */
export const TRACKER_PROJECT_NEEDS_KEY_SENTENCE =
  'Store the API key first to look a project up by URL or name.'

/**
 * What the form says about a lookup that did not settle (MAR-3156 R2).
 *
 * `resolved` is not here on purpose: that answer is a binding, not a
 * sentence, and the caller saves it instead of saying anything.
 */
export function trackerProjectProblem(
  resolution: Exclude<TrackerProjectResolution, { kind: 'resolved' }>,
): string {
  if (resolution.kind === 'not-found') {
    return 'No project answers to that. Paste the project’s URL from Linear.'
  }
  if (resolution.kind === 'ambiguous') {
    const names = resolution.candidates
      .map((candidate) => `${candidate.name} (${candidate.url})`)
      .join(', ')
    return `Several projects answer to that name — paste the URL of the one you mean: ${names}`
  }
  return `${TRACKER_REFUSAL_LABELS[resolution.refusal.kind]} — ${resolution.refusal.message}`
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
