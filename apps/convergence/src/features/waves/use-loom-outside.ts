import { useEffect, useState } from 'react'
import type { TrackerOutsideSnapshot } from '@/shared/types/tracker.types'
import { loomOutsideApi } from './loom-outside.api'

/**
 * The shown crew's issues outside the loop (MAR-3236 R7): its snapshot from
 * the watcher's memory, then every read that replaces it -- and only this
 * crew's. A switch of crew starts from nothing rather than showing the last
 * crew's list under the new crew's name.
 */
export function useLoomOutside(crewId: string): TrackerOutsideSnapshot | null {
  const [held, setHeld] = useState<TrackerOutsideSnapshot | null>(null)

  useEffect(() => {
    let live = true
    setHeld(null)
    const stop = loomOutsideApi.onUpdated((snapshot) => {
      if (snapshot.crewId === crewId) setHeld(snapshot)
    })
    void loomOutsideApi
      .read(crewId)
      .then((snapshot) => {
        // A push that already arrived is at least as new as this answer.
        if (!live || snapshot === null || snapshot.crewId !== crewId) return
        setHeld((was) => (was && was.readAt !== null ? was : snapshot))
      })
      .catch(() => {
        // The door refused; the group says "not read yet", which is true.
      })
    return () => {
      live = false
      stop()
    }
  }, [crewId])

  return held !== null && held.crewId === crewId ? held : null
}
