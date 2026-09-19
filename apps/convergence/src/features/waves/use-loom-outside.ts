import { useEffect, useState } from 'react'
import type { TrackerOutsideSnapshot } from '@/shared/types/tracker.types'
import { loomOutsideApi } from './loom-outside.api'

/**
 * The shown crew's issues outside the loop (MAR-3236 R7): its snapshot from
 * the watcher's memory, then every read that replaces it -- and only this
 * crew's. A switch of crew starts from nothing rather than showing the last
 * crew's list under the new crew's name.
 *
 * `null` when no crew is on screen: nothing is read, nothing is held
 * (MAR-3234 -- the panel reads this once, before it knows it has a crew).
 */
export function useLoomOutside(
  crewId: string | null,
): TrackerOutsideSnapshot | null {
  const [held, setHeld] = useState<TrackerOutsideSnapshot | null>(null)

  useEffect(() => {
    if (crewId === null) return
    let live = true
    const stop = loomOutsideApi.onUpdated((snapshot) => {
      if (snapshot.crewId === crewId) setHeld(snapshot)
    })
    void loomOutsideApi
      .read(crewId)
      .then((snapshot) => {
        // A push for THIS crew that already arrived is at least as new as
        // this answer; anything held for another crew is not.
        if (!live || snapshot === null || snapshot.crewId !== crewId) return
        setHeld((was) =>
          was && was.crewId === crewId && was.readAt !== null ? was : snapshot,
        )
      })
      .catch(() => {
        // The door refused; the group says "not read yet", which is true.
      })
    return () => {
      live = false
      stop()
    }
  }, [crewId])

  // The one guard against another crew's list (R7): what is held may still
  // be the last crew's until this crew's read lands, and it never shows.
  return held !== null && held.crewId === crewId ? held : null
}
