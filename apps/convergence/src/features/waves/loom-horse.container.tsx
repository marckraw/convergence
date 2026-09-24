import { SessionAgentMeter, useAgentMeterStore } from '@/entities/agent-meter'
import { useSessionStore } from '@/entities/session'
import { isRemoteExecutionHost } from '@/entities/execution-host'
import {
  LoomHorseCard,
  type LoomHorseCardProps,
} from './loom-horse.presentational'

export function LoomHorseCardContainer(props: LoomHorseCardProps) {
  const id = props.horse.sessionId
  const row = useAgentMeterStore((state) =>
    state.snapshot.rows.find((entry) => entry.sessionId === id),
  )
  const host = useSessionStore(
    (state) =>
      state.globalSessions.find((session) => session.id === id)?.executionHost,
  )
  return (
    <LoomHorseCard
      {...props}
      meterSlot={
        id ? (
          <SessionAgentMeter row={row} remote={isRemoteExecutionHost(host)} />
        ) : undefined
      }
    />
  )
}
