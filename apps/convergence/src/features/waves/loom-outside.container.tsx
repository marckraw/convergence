import { useState } from 'react'
import type { TrackerOutsideSnapshot } from '@/shared/types/tracker.types'
import { LoomOutsideGroupView } from './loom-outside.presentational'
import { loomOutsideView } from './loom-outside.pure'

/**
 * "Not in the loop" for the crew Loom shows (MAR-3236), handed to Plan the
 * way Refresh is handed to the header.
 *
 * The snapshot is a PROP (MAR-3234): the panel reads it once, because the
 * search's summary needs the same list -- two subscriptions would be two
 * reads of one fact that could land at different moments.
 *
 * The fold is this component's own state, deliberately: it lives only as
 * long as Plan is on screen, so the group is closed on every mount and
 * nothing about it is saved. While a search matches inside it the group is
 * OPEN by itself (MAR-3234 R5) -- a match folded away is not an answer --
 * and when the search clears it goes back to whatever the person left it as.
 * The person can still fold it during that search; the choice lasts as long
 * as that query does.
 */
export function LoomOutside({
  snapshot,
  query,
}: {
  snapshot: TrackerOutsideSnapshot | null
  query: string | null
}) {
  const [open, setOpen] = useState(false)
  const [forQuery, setForQuery] = useState<{
    query: string
    open: boolean
  } | null>(null)
  const view = loomOutsideView(snapshot, query)
  const searched = query !== null && view.rows.length > 0
  const shownOpen = searched
    ? forQuery?.query === query
      ? forQuery.open
      : true
    : open
  return (
    <LoomOutsideGroupView
      view={view}
      open={shownOpen}
      onToggle={() => {
        if (searched) setForQuery({ query, open: !shownOpen })
        else setOpen((was) => !was)
      }}
    />
  )
}
