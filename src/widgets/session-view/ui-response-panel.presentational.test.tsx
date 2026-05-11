import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UiResponsePanel } from './ui-response-panel.presentational'

describe('UiResponsePanel', () => {
  it('renders a sandboxed iframe with the artifact HTML', () => {
    render(
      <UiResponsePanel
        artifact={{
          id: 'artifact-1',
          sessionId: 'session-1',
          conversationItemId: 'item-1',
          title: 'Preview panel',
          kind: 'html',
          html: '<main>Generated UI</main>',
          createdAt: '2026-05-10T00:00:00.000Z',
        }}
      />,
    )

    const iframe = screen.getByTestId('ui-response-iframe')
    const srcDoc = iframe.getAttribute('srcdoc') ?? ''

    expect(screen.getByText('Preview panel')).toBeInTheDocument()
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
    expect(srcDoc).toContain('Content-Security-Policy')
    expect(srcDoc).toContain('<main>Generated UI</main>')
  })

  it('renders an empty state instead of an iframe when artifact HTML is blank', () => {
    render(
      <UiResponsePanel
        artifact={{
          id: 'artifact-1',
          sessionId: 'session-1',
          conversationItemId: 'item-1',
          title: 'Preview panel',
          kind: 'html',
          html: '   ',
          createdAt: '2026-05-10T00:00:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('UI response is empty')).toBeInTheDocument()
    expect(screen.queryByTestId('ui-response-iframe')).not.toBeInTheDocument()
  })

  it('renders an error state instead of an iframe when artifact HTML is malformed', () => {
    render(
      <UiResponsePanel
        artifact={{
          id: 'artifact-1',
          sessionId: 'session-1',
          conversationItemId: 'item-1',
          title: 'Preview panel',
          kind: 'html',
          html: '<main><section>Generated UI</main>',
          createdAt: '2026-05-10T00:00:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('UI response could not render')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The UI response artifact closes </main> before closing <section>.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('ui-response-iframe')).not.toBeInTheDocument()
  })
})
