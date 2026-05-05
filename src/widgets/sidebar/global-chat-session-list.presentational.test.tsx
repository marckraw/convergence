import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { GlobalChatSessionList } from './global-chat-session-list.presentational'

const baseSession: SessionSummary = {
  id: 'global-session-1',
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Planning chat',
  status: 'completed',
  attention: 'finished',
  activity: null,
  workingDirectory: '/tmp/convergence/global',
  contextWindow: null,
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('GlobalChatSessionList', () => {
  it('selects a global chat session from the list', () => {
    const onSelectSession = vi.fn()

    render(
      <TooltipProvider>
        <GlobalChatSessionList
          sessions={[baseSession]}
          activeSessionId={null}
          onNewSession={vi.fn()}
          onSelectSession={onSelectSession}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /open chat session planning chat/i,
      }),
    )

    expect(onSelectSession).toHaveBeenCalledWith('global-session-1')
  })

  it('starts a new chat draft', () => {
    const onNewSession = vi.fn()

    render(
      <TooltipProvider>
        <GlobalChatSessionList
          sessions={[]}
          activeSessionId={null}
          onNewSession={onNewSession}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /new chat/i }))

    expect(onNewSession).toHaveBeenCalled()
  })
})
