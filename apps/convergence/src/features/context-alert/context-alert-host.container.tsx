import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import {
  formatTokenCap,
  type ContextAlertSettings,
} from '@/shared/lib/context-alert-settings.pure'
import {
  nextCrossings,
  type ContextAlertCrossing,
  type CrossingState,
} from './context-alert-crossings.pure'

interface ContextAlertHostContainerProps {
  /**
   * How the app focuses a conversation, handed down rather than reached for:
   * the notifications toast host takes the same prop from `App.container`, and
   * one feature may not import another's helper. Without it the toast still
   * tells, it just has nothing to offer a button for.
   */
  onFocusSession?: (session: SessionSummary) => void
}

/**
 * Raises the context alert's toast. Renders nothing.
 *
 * Mounted once beside the `<Toaster>` and watching every conversation, not
 * just the open one, because the conversation that fills up is often not the
 * one being looked at.
 */
export function ContextAlertHostContainer({
  onFocusSession,
}: ContextAlertHostContainerProps = {}) {
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const contextAlert = useAppSettingsStore((s) => s.settings.contextAlert)

  const crossingsRef = useRef<Map<string, CrossingState>>(new Map())
  /**
   * Whether the conversations that existed before this host started are still
   * unaccounted for.
   *
   * Not "is this the first effect run": the session store begins empty and
   * fills asynchronously, so the first run is an empty list that proves
   * nothing, and consuming it as the first observation would leave the real
   * list to raise a toast for every old conversation. An empty list can hold
   * nobody over the line, so it is not an observation at all.
   */
  const awaitingFirstObservationRef = useRef(true)

  useEffect(() => {
    if (globalSessions.length === 0) return

    const firstObservation = awaitingFirstObservationRef.current
    awaitingFirstObservationRef.current = false

    const { state, toTell } = nextCrossings(
      crossingsRef.current,
      globalSessions,
      contextAlert,
      firstObservation,
    )
    crossingsRef.current = state

    for (const crossing of toTell) {
      const { session, usedPercentage, by } = crossing
      toast(`Context at ${usedPercentage} % — ${session.name}`, {
        description: `${describeLimit(by, contextAlert)} · time to seal and compact`,
        ...(onFocusSession
          ? {
              action: {
                label: 'Open',
                onClick: () => onFocusSession(session),
              },
            }
          : {}),
      })
    }
  }, [globalSessions, contextAlert, onFocusSession])

  return null
}

/**
 * Which limit this crossing passed, in the toast's words.
 *
 * `by` is not re-derived here: it was decided by the same predicate that
 * colours the dot, so the toast and the popover cannot name different limits
 * for one conversation.
 */
function describeLimit(
  by: ContextAlertCrossing['by'],
  alert: ContextAlertSettings,
): string {
  return by === 'tokens' && alert.tokens !== null
    ? `over your ${formatTokenCap(alert.tokens)}-token alert`
    : `over your ${alert.percent} % alert`
}
