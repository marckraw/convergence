import { useState } from 'react'
import { LoomOutsideGroupView } from './loom-outside.presentational'
import { loomOutsideView } from './loom-outside.pure'
import { useLoomOutside } from './use-loom-outside'

/**
 * "Not in the loop" for the crew Loom shows (MAR-3236), handed to Plan the
 * way Refresh is handed to the header.
 *
 * The fold is this component's own state, deliberately: it lives only as
 * long as Plan is on screen, so the group is closed on every mount and
 * nothing about it is saved.
 */
export function LoomOutside({ crewId }: { crewId: string }) {
  const snapshot = useLoomOutside(crewId)
  const [open, setOpen] = useState(false)
  return (
    <LoomOutsideGroupView
      view={loomOutsideView(snapshot)}
      open={open}
      onToggle={() => setOpen((was) => !was)}
    />
  )
}
