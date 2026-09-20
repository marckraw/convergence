import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import {
  formatTokenCap,
  type ContextAlertSettings,
} from '@/shared/lib/context-alert-settings.pure'
import {
  initialCrossingsState,
  nextCrossings,
  type ContextAlertCrossing,
  type CrossingsState,
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

  /**
   * Everything this host remembers between passes: the crossing map and the
   * threshold it was read against.
   *
   * There is no second "have I seen the list yet?" flag. A conversation earns
   * its toast by being seen working and then settling over the line, so the
   * store starting empty, filling in batches, or the settings arriving after
   * the sessions all come out the same way on their own.
   */
  const crossingsRef = useRef<CrossingsState>(initialCrossingsState())

  useEffect(() => {
    const { state, toTell } = nextCrossings(
      crossingsRef.current,
      globalSessions,
      contextAlert,
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
