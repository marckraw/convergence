import type {
  TrackerOutsideIssue,
  TrackerOutsideSnapshot,
} from '@/shared/types/tracker.types'

/**
 * The group at the end of Plan (MAR-3236 R6): the project's open issues that
 * carry no Loom label, as the last outside read saw them.
 *
 * Not preparation -- nobody has asked for any of it -- so it is never counted
 * in `Plan · N in preparation`, and it is not a ledger row: it opens Linear
 * and nothing else.
 */

export const LOOM_OUTSIDE_NAME = 'Not in the loop'

/** Before the watcher has read outside the loop at all. */
export const LOOM_OUTSIDE_NEVER_READ_TITLE = `${LOOM_OUTSIDE_NAME} · not read yet`

/** Read, and every open issue carries a Loom label. */
export const LOOM_OUTSIDE_EMPTY_LINE =
  'Every open issue in this project carries a Loom label.'

/** The read was cut by its bound (R3): the list is not the whole project. */
export const LOOM_OUTSIDE_MORE_LINE = 'More in Linear — showing the newest 300'

/** `Not in the loop · N`, or `N+` when the read was cut short. */
export function loomOutsideTitle(count: number, more: boolean): string {
  return `${LOOM_OUTSIDE_NAME} · ${count}${more ? '+' : ''}`
}

/**
 * Newest `updatedAt` first, ties by identifier so the order never wobbles.
 * String comparison is exact for Linear's fixed-width `Z` timestamps.
 */
export function loomOutsideOrder(
  issues: readonly TrackerOutsideIssue[],
): TrackerOutsideIssue[] {
  return [...issues].sort((a, b) =>
    a.updatedAt === b.updatedAt
      ? a.identifier.localeCompare(b.identifier)
      : a.updatedAt < b.updatedAt
        ? 1
        : -1,
  )
}

/** Everything the group draws, from one snapshot (or none yet). */
export interface LoomOutsideView {
  title: string
  /** Whether there is anything to unfold. */
  foldable: boolean
  rows: TrackerOutsideIssue[]
  /** The line in place of rows, or null when the rows speak. */
  emptyLine: string | null
  /** The cut-short line after the rows, or null. */
  moreLine: string | null
}

export function loomOutsideView(
  snapshot: TrackerOutsideSnapshot | null,
): LoomOutsideView {
  if (snapshot === null || snapshot.readAt === null) {
    return {
      title: LOOM_OUTSIDE_NEVER_READ_TITLE,
      foldable: false,
      rows: [],
      emptyLine: null,
      moreLine: null,
    }
  }
  const rows = loomOutsideOrder(snapshot.issues)
  return {
    title: loomOutsideTitle(rows.length, snapshot.more),
    foldable: rows.length > 0 || snapshot.more,
    rows,
    emptyLine:
      rows.length === 0 && !snapshot.more ? LOOM_OUTSIDE_EMPTY_LINE : null,
    moreLine: snapshot.more ? LOOM_OUTSIDE_MORE_LINE : null,
  }
}
