import { useCallback, useEffect, useState } from 'react'
import { useFeedClock } from '@/shared/hooks/use-feed-clock'
import { LoomRefreshView } from './loom-refresh.presentational'
import { laterReadAt, loomRefreshView } from './loom-refresh.pure'
import { trackerRefreshApi } from './tracker-refresh.api'

/**
 * Refresh for the crew Loom shows (MAR-3227 R6, re-grounded by MAR-3225): it
 * asks the watcher to read THAT crew's tracker, and says when that crew's
 * tracker last answered.
 *
 * Two sources for "last answered", the later wins: the snapshot's
 * `lastOkAt`, and the `tracker:read` push. The snapshot alone would lie --
 * it is only re-sent when something changed, and most reads change nothing.
 *
 * Its own clock, not the board's: the board's ticks once a minute for the
 * rows, and this label counts seconds only while it has seconds to count.
 */
export function LoomRefresh({
  crewId,
  lastOkAt,
}: {
  crewId: string
  lastOkAt: string | null
}) {
  const [heard, setHeard] = useState<{
    lastOkAt: string | null
    refreshableAt: string | null
  }>({ lastOkAt: null, refreshableAt: null })
  const [now, setNow] = useState(() => Date.now())

  useEffect(
    () =>
      trackerRefreshApi.onRead((event) => {
        if (event.crewId !== crewId) return
        setHeard({
          lastOkAt: event.lastOkAt,
          refreshableAt: event.refreshableAt,
        })
        setNow(Date.now())
      }),
    [crewId],
  )

  const view = loomRefreshView({
    lastOkAt: laterReadAt(lastOkAt, heard.lastOkAt),
    refreshableAt: heard.refreshableAt,
    now,
  })
  useFeedClock(view.ticking, setNow, view.live)

  const onRefresh = useCallback(() => {
    void trackerRefreshApi
      .refresh(crewId)
      .then((reply) => {
        // Only the floor's answer changes what the control says; a read
        // asked for is answered by its own push, and a crew backing off is
        // already the header's outage line.
        if (reply.outcome !== 'just-read') return
        setHeard((was) => ({ ...was, refreshableAt: reply.refreshableAt }))
        setNow(Date.now())
      })
      .catch(() => {
        // The door refused; the age on screen is still true.
      })
  }, [crewId])

  return (
    <LoomRefreshView
      label={view.label}
      blocked={view.blocked}
      onRefresh={onRefresh}
    />
  )
}
