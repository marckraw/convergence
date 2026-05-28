import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { TerminalIdleSection } from './terminal-idle-section.presentational'

const notice = {
  id: 'terminal-1',
  sessionId: 'session-1',
  terminalId: 'terminal-1',
  processName: 'npm',
  busySince: '2026-01-01T00:00:00.000Z',
  idleAt: '2026-01-01T00:00:05.000Z',
  sessionName: 'Terminal - Convergence',
  projectName: 'Convergence',
  receivedAt: '2026-01-01T00:00:05.000Z',
}

describe('TerminalIdleSection', () => {
  it('renders idle terminal notices and selects them', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()

    render(
      <TooltipProvider>
        <TerminalIdleSection
          notices={[notice]}
          onSelect={onSelect}
          onDismiss={onDismiss}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('Terminals Idle')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Terminal - Convergence'))

    expect(onSelect).toHaveBeenCalledWith(notice)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses notices without selecting them', () => {
    const onSelect = vi.fn()
    const onDismiss = vi.fn()

    render(
      <TooltipProvider>
        <TerminalIdleSection
          notices={[notice]}
          onSelect={onSelect}
          onDismiss={onDismiss}
        />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /dismiss idle terminal terminal - convergence/i,
      }),
    )

    expect(onDismiss).toHaveBeenCalledWith('terminal-1')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
