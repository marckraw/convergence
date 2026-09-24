import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useAgentMeterStore } from '@/entities/agent-meter'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { LoomHorseCardContainer } from './loom-horse.container'
import { loomHorses } from './loom-horses.pure'
import { loomSheets } from './loom-sheets.pure'
import { boundCrewWith, residentSeat } from './wave-rows.fixture'

it('R4 a horse card reads its own conversation meter and labels a remote seat', () => {
  const id = 'session-opus-mac'
  const horse = loomHorses({
    crews: [boundCrewWith('crew-1', 'Loom', [residentSeat('opus-mac')])],
    sessionsById: new Map([[id, { status: 'running' }]]),
    sheets: loomSheets([], 0),
    hostLabelOf: () => 'This Mac',
  })[0]
  useAgentMeterStore.setState({
    snapshot: {
      agents: null,
      convergence: null,
      rows: [
        {
          sessionId: 'different',
          account: null,
          usage: { cpu: 99, memoryMb: 990 },
        },
        { sessionId: id, account: null, usage: { cpu: 12, memoryMb: 450 } },
      ],
    },
  })
  useSessionStore.setState({
    globalSessions: [{ id, executionHost: 'local' } as SessionSummary],
  })
  const view = render(<LoomHorseCardContainer horse={horse} />)
  expect(screen.getByTestId('session-agent-meter')).toHaveTextContent(
    '12% · 450 MB',
  )
  view.unmount()
  useSessionStore.setState({
    globalSessions: [{ id, executionHost: 'endpoint-1' } as SessionSummary],
  })
  render(<LoomHorseCardContainer horse={horse} />)
  expect(screen.getByTestId('session-agent-meter')).toHaveTextContent('remote')
})
