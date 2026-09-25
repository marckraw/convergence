import { SessionAgentMeter, useAgentMeterStore } from '@/entities/agent-meter'
import { useSessionStore } from '@/entities/session'
import { isRemoteExecutionHost } from '@/entities/execution-host'
import {
  LoomMastermindCard,
  type LoomMastermindCardProps,
} from './loom-mastermind.presentational'

export function LoomMastermindCardContainer(props: LoomMastermindCardProps) {
  const id = props.mastermind.sessionId
  const row = useAgentMeterStore((state) =>
    state.snapshot.rows.find((entry) => entry.sessionId === id),
  )
  const host = useSessionStore(
    (state) =>
      state.globalSessions.find((session) => session.id === id)?.executionHost,
  )
  return (
    <LoomMastermindCard
      {...props}
      meterSlot={
        id ? (
          <SessionAgentMeter row={row} remote={isRemoteExecutionHost(host)} />
        ) : undefined
      }
    />
  )
}
