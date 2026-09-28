import { useEffect, useState } from 'react'
import { SessionAgentMeter, useAgentMeterStore } from '@/entities/agent-meter'
import { useSessionStore } from '@/entities/session'
import { isRemoteExecutionHost } from '@/entities/execution-host'
import {
  providerAccountApi,
  useConnectionsOverviewStore,
} from '@/entities/provider-account'
import {
  LoomHorseCard,
  type LoomHorseCardProps,
} from './loom-horse.presentational'
import { loomHorseAccessLine } from './loom-horse-access.pure'
import { LoomHorseAccessLine } from './loom-horse-access.presentational'

/**
 * The account the seat's next automatic turn runs on (MAR-3519), resolved in
 * the main process by the rule relay hops and dispatch use: undefined until
 * it is known, null for the ambient default. Read again when the session
 * changes, since a new turn may have moved the seat to another account.
 */
function useAutomaticTurnAccountId(
  sessionId: string | null,
  revision: string | undefined,
  skip: boolean,
): string | null | undefined {
  const [known, setKnown] = useState<{
    sessionId: string
    accountId: string | null
  } | null>(null)
  useEffect(() => {
    if (!sessionId || skip) return
    let live = true
    // A lookup that can't run leaves the account unknown: no line, no claim.
    Promise.resolve()
      .then(() => providerAccountApi.automaticTurnAccount(sessionId))
      .then((accountId) => {
        if (live) setKnown({ sessionId, accountId })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [sessionId, revision, skip])
  return known && known.sessionId === sessionId ? known.accountId : undefined
}

export function LoomHorseCardContainer(props: LoomHorseCardProps) {
  const id = props.horse.sessionId
  const row = useAgentMeterStore((state) =>
    state.snapshot.rows.find((entry) => entry.sessionId === id),
  )
  const session = useSessionStore((state) =>
    state.globalSessions.find((entry) => entry.id === id),
  )
  const remote = isRemoteExecutionHost(session?.executionHost)
  const accountId = useAutomaticTurnAccountId(id, session?.updatedAt, remote)
  const rows = useConnectionsOverviewStore((state) => state.rows)
  const checkedAt = useConnectionsOverviewStore((state) => state.checkedAt)
  const access = id
    ? loomHorseAccessLine({ remote, accountId, rows, checkedAt })
    : null
  return (
    <LoomHorseCard
      {...props}
      meterSlot={
        id ? <SessionAgentMeter row={row} remote={remote} /> : undefined
      }
      accessSlot={access ? <LoomHorseAccessLine line={access} /> : undefined}
    />
  )
}
