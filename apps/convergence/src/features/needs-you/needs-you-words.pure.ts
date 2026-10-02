/**
 * The attention queue's one name, and how it counts (NAV-32; Marcin's ruling
 * 3, 2 Oct 2026). The sidebar's feed and its section, its filter, the
 * collapsed rail, the status bar and Mission Control all say "Needs you", and
 * a count reads "3 need you" or "1 needs you". Kept here, in the feature that
 * owns the queue, because a name is a constant (R10): it had been "Activity",
 * "Needs You (N)", "N need you" even for one, "Needs attention" and "Needs me".
 */
export const NEEDS_YOU = 'Needs you'

/** The count's verb: "needs you" for one, "need you" for any other number. */
export function needsYouVerb(count: number): string {
  return count === 1 ? 'needs you' : 'need you'
}

/** The count phrase: "3 need you", "1 needs you", "0 need you". */
export function needsYouCount(count: number): string {
  return `${count} ${needsYouVerb(count)}`
}

/**
 * A section title as stored before the rename: the sidebar keeps the titles
 * of folded sections, and the queue's section was "Needs attention" until
 * NAV-32. Read through this, a section folded under the old name stays folded.
 */
export function currentSectionTitle(title: string): string {
  return title === 'Needs attention' ? NEEDS_YOU : title
}
