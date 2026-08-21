import { useMemo } from 'react'
import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useSessionRelayStore } from '@/entities/session-relay'
import { buildRelaySentence } from '@/features/mission-control'
import { SessionWires } from './session-wires.presentational'
import {
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
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const projects = useProjectStore((s) => s.projects)

  const outgoing = useMemo(
    () => selectOutgoingWires(relays, sessionId),
    [relays, sessionId],
  )

  const lines = useMemo(
    () =>
      outgoing.map((relay) => ({
        relayId: relay.id,
        armed: relay.armed,
        text: buildRelaySentence(
          relay,
          (id) => globalSessions.find((s) => s.id === id)?.name ?? null,
          (projectId) =>
            projects.find((p) => p.id === projectId)?.name ?? 'a project',
        ).text,
      })),
    [outgoing, globalSessions, projects],
  )

  const armedCount = outgoing.filter((relay) => relay.armed).length

  return (
    <SessionWires
      lines={lines}
      armedCount={armedCount}
      summary={formatSessionWireSummary(lines.length, armedCount)}
    />
  )
}
