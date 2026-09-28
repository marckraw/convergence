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
 * it is known, null for the ambient default. Read again when `revision`
 * changes (the card's runtime), since a new turn may move the seat to
 * another account.
 */
function useAutomaticTurnAccountId(
  sessionId: string | null,
  revision: string,
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
  // Only the host, never the whole summary: Loom commits when a shown fact
  // changes, not on every activity tick (MAR-3379).
  const host = useSessionStore(
    (state) =>
      state.globalSessions.find((entry) => entry.id === id)?.executionHost,
  )
  const remote = isRemoteExecutionHost(host)
  // A new turn is when the account can change, and a new turn moves the card's
  // runtime: that shown fact is the trigger.
  const accountId = useAutomaticTurnAccountId(id, props.horse.runtime, remote)
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
