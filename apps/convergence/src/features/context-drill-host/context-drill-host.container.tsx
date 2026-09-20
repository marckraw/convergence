import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useContextDrillStore } from '@/entities/context-drill'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import {
  describeDrillFailureTitle,
  describeDrillSuccess,
} from './context-drill-outcome.pure'

interface ContextDrillHostContainerProps {
  /**
   * How the app focuses a conversation, handed down rather than reached for --
   * the same prop, from the same place, as the context alert's host. Without
   * it the toast still tells; it just has nothing to offer a button for.
   */
  onFocusSession?: (session: SessionSummary) => void
}

/**
 * Turns every ending of the drill into a toast. Renders nothing.
 *
 * Mounted once beside the `<Toaster>` rather than inside the popover that
 * starts the drill, because the seal beat takes minutes and the popover shuts
 * when the pointer leaves it. By the time a run ends, Marcin is somewhere
 * else in the app -- that is the normal case, not the edge one -- and this
 * host is the thing that is still mounted to tell him.
 *
 * It is also the one place that installs the `contextDrill:changed`
 * subscription, so the store has exactly one listener however many popovers
 * open and close.
 */
export function ContextDrillHostContainer({
  onFocusSession,
}: ContextDrillHostContainerProps = {}) {
  const outcomes = useContextDrillStore((s) => s.outcomes)

  useEffect(() => useContextDrillStore.getState().subscribe(), [])

  /**
   * The `seq` of the last ending told, per conversation.
   *
   * Identity, not a count: `outcomes` is a live store slice that survives this
   * component, so a remount finds it already populated with runs that were
   * announced long ago. Without a per-conversation stamp, opening a second
   * window would replay every drill the app has ever run.
   */
  const toldRef = useRef<Map<string, number> | null>(null)

  // No dependency array on purpose. The seq map is what decides whether
  // anything is said, so running on every render is free and cannot
  // double-tell -- and it removes the question of which store slices the
  // effect would have had to list to be sure it never misses one.
  useEffect(() => {
    // The FIRST pass only takes a baseline. An ending that was already in the
    // store when this host mounted is not news: somebody was told about it by
    // the host that was mounted when it happened, and a remount announcing it
    // again would toast the same run twice.
    const seeding = toldRef.current === null
    const told = toldRef.current ?? new Map<string, number>()
    toldRef.current = told

    for (const [sessionId, record] of Object.entries(outcomes)) {
      if (told.get(sessionId) === record.seq) continue
      told.set(sessionId, record.seq)
      if (seeding) continue

      const session = useSessionStore
        .getState()
        .globalSessions.find((entry) => entry.id === sessionId)

      const action =
        onFocusSession && session
          ? {
              action: {
                label: 'Open',
                onClick: () => onFocusSession(session),
              },
            }
          : {}

      if (record.outcome.ok) {
        const contextWindow = session?.contextWindow
        // Read now, not at `run`: this is the figure the compaction left
        // behind, and it only exists once the run is over.
        const after =
          contextWindow && contextWindow.availability !== 'unavailable'
            ? contextWindow.usedPercentage
            : null
        toast.success('The drill finished', {
          description: describeDrillSuccess(record.before, after),
          ...action,
        })
        continue
      }

      const { beat, reason } = record.outcome
      // A run somebody stopped is not a failure to be alarmed about. The
      // backend reports it as one -- it has no way to know who asked -- so
      // the flag the store set when the cancel was ACCEPTED is what tells
      // the two apart here.
      if (useContextDrillStore.getState().cancelRequested[sessionId]) {
        useContextDrillStore.getState().clearCancelRequested(sessionId)
        toast('The drill was cancelled', { description: reason, ...action })
        continue
      }

      toast.error(describeDrillFailureTitle(beat), {
        description: reason,
        ...action,
      })
    }
  })

  return null
}
