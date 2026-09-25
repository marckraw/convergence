import { useMemo } from 'react'
import type { FC } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useSessionRelayStore } from '@/entities/session-relay'
import { buildRelaySentence } from '@/features/mission-control'
import { SessionWires } from './session-wires.presentational'
import {
  countSessionWires,
  formatSessionWireSummary,
  selectOutgoingWires,
} from './session-wires.pure'

interface SessionWiresContainerProps {
  sessionId: string
}

/**
 * Feeds the session's own view of its outgoing wires (F11, MAR-2538).
 *
 * `relay:list` already returns every wire in the app -- relays are cross-project
 * furniture -- so this needs no IPC of its own. The list is subscribed whole and
 * narrowed in a `useMemo`: narrowing inside the selector would hand zustand a
 * fresh array on every render and spin the app (run 16 hit exactly that).
 */
export const SessionWiresContainer: FC<SessionWiresContainerProps> = ({
  sessionId,
}) => {
  const relays = useSessionRelayStore((s) => s.relays)
  const projects = useProjectStore((s) => s.projects)

  const outgoing = useMemo(
    () => selectOutgoingWires(relays, sessionId),
    [relays, sessionId],
  )

  const sessionIds = useMemo(
    () => [
      ...new Set(
        outgoing.flatMap((relay) => [
          relay.sourceSessionId,
          ...(relay.action === 'hail' && relay.targetSessionId
            ? [relay.targetSessionId]
            : []),
        ]),
      ),
    ],
    [outgoing],
  )
  // Summary traffic must not redraw the disclosure in the composer or header.
  // Only names used by these sentences can change their session-derived text.
  const sessionNames = useSessionStore(
    useShallow((s) =>
      Object.fromEntries(
        sessionIds.map((id) => [
          id,
          s.globalSessions.find((session) => session.id === id)?.name ?? null,
        ]),
      ),
    ),
  )

  const lines = useMemo(
    () =>
      outgoing.map((relay) => ({
        relayId: relay.id,
        armed: relay.armed,
        text: buildRelaySentence(
          relay,
          (id) => sessionNames[id] ?? null,
          (projectId) =>
            projects.find((p) => p.id === projectId)?.name ?? 'a project',
        ).text,
      })),
    [outgoing, sessionNames, projects],
  )

  const { unconditional, conditional, disarmed } = countSessionWires(outgoing)
  const armedCount = unconditional + conditional

  return (
    <SessionWires
      lines={lines}
      armedCount={armedCount}
      summary={formatSessionWireSummary(unconditional, conditional, disarmed)}
    />
  )
}
