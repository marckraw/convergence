import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SessionAgentMeter } from './session-agent-meter.presentational'

it('R4 the conversation reading shows unavailable and shared usage honestly', () => {
  const view = render(
    <SessionAgentMeter row={{ sessionId: 'a', account: null, usage: null }} />,
  )
  expect(screen.getByTestId('session-agent-meter')).toHaveTextContent('—')
  view.rerender(
    <SessionAgentMeter
      row={{
        sessionId: 'a',
        account: 'Personal',
        usage: { cpu: 5, memoryMb: 120 },
      }}
    />,
  )
  expect(screen.getByTestId('session-agent-meter')).toHaveTextContent(
    '5% · 120 MB · shared · Personal',
  )
})
