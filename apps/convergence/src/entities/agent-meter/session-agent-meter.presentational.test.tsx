import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SessionAgentMeter } from './session-agent-meter.presentational'

it('R4 the conversation reading shows unavailable and shared usage honestly', () => {
  const view = render(
    <SessionAgentMeter row={{ sessionId: 'a', account: null, usage: null }} />,
  )
  expect(screen.queryByTestId('session-agent-meter')).not.toBeInTheDocument()
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

it('CH1 R3 no row renders no element and remote keeps its text', () => {
  const view = render(<SessionAgentMeter />)
  expect(view.container).toBeEmptyDOMElement()
  view.rerender(<SessionAgentMeter row={null} />)
  expect(view.container).toBeEmptyDOMElement()
  view.rerender(<SessionAgentMeter remote />)
  expect(screen.getByTestId('session-agent-meter')).toHaveTextContent('remote')
})
