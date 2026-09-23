import type { Project } from '@/entities/project'
import type { NeedsYouDismissals, SessionSummary } from '@/entities/session'
import { needsYouCardModel, type NeedsYouCardModel } from '@/features/needs-you'

/**
 * Summary fields the sidebar reads only against its clock, or never
 * (MAR-3378 F1b).
 *
 * A streaming conversation sends a summary on every 50 ms flush, and each one
 * carries a new `updatedAt`. The sidebar shows that stamp only as "Last moved
 * … ago", as the order inside a group and in the dismissal match; the host
 * stamp only as "host · … ago". All of these are statements about `now`, so
 * they catch up at the next clock tick. The remaining fields are never read
 * by a sidebar row or card.
 *
 * A field belongs here only if no row or card reads it except through the
 * clock. Everything absent from this list redraws the sidebar at once.
 */
const FIELDS_READ_ON_THE_CLOCK_OR_NEVER: ReadonlySet<string> = new Set([
  // Read through the clock: "Last moved", group order, the dismissal match.
  'updatedAt',
  // Read through the clock: "host · … ago".
  'executionHostLastEventAt',
  // Never read by the sidebar.
  'executionHostLastSeq',
  'lastSequence',
  'contextWindow',
])

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((entry, i) => sameValue(entry, b[i]))
    )
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) return false
  }
  return true
}

/**
 * True when two summaries of one conversation differ in nothing a sidebar row
 * or card shows at once. Summaries cross IPC, so nested values (timing,
 * pull request, parallel work) are fresh objects every time and are compared
 * by value, not identity.
 */
export function sameForSidebar(a: SessionSummary, b: SessionSummary): boolean {
  if (a === b) return true
  const left = a as unknown as Record<string, unknown>
  const right = b as unknown as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (FIELDS_READ_ON_THE_CLOCK_OR_NEVER.has(key)) continue
    if (!sameValue(left[key], right[key])) return false
  }
  return true
}

/** Same conversations, same order, and `sameForSidebar` at every position. */
export function sameSidebarList(
  a: readonly SessionSummary[],
  b: readonly SessionSummary[],
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!sameForSidebar(a[i], b[i])) return false
  }
  return true
}

/**
 * The single derivation of Activity cards (MAR-3378 F1b R2): one card per
 * conversation, in `globalSessions` order. The collapsed rail and the
 * expanded feed both read this list; the feed narrows it by search and never
 * builds cards of its own.
 */
export function sidebarCards(
  sessions: readonly SessionSummary[],
  context: {
    projects: readonly Pick<Project, 'id' | 'name'>[]
    endpoints: readonly { id: string; label: string }[]
    now: number
    dismissals: NeedsYouDismissals
  },
): NeedsYouCardModel[] {
  const projectNames = new Map(
    context.projects.map((project) => [project.id, project.name]),
  )
  return sessions.map((session) =>
    needsYouCardModel(session, {
      projectName:
        session.contextKind === 'global'
          ? 'Convergence'
          : ((session.projectId !== null
              ? projectNames.get(session.projectId)
              : undefined) ?? 'Unknown project'),
      endpoints: context.endpoints,
      now: context.now,
      dismissed:
        context.dismissals[session.id]?.updatedAt === session.updatedAt,
    }),
  )
}
