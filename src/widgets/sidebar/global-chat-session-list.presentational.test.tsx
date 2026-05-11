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
          spaces={[]}
          sessions={[baseSession]}
          activeSessionId={null}
          selectedSpaceId={null}
          expandedSpaceIds={new Set()}
          onNewSession={vi.fn()}
          onNewSpace={vi.fn()}
          onSelectSpace={vi.fn()}
          onToggleSpace={vi.fn()}
          onSelectSpaceAttempt={vi.fn()}
          onSelectSession={onSelectSession}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
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
          spaces={[]}
          sessions={[]}
          activeSessionId={null}
          selectedSpaceId={null}
          expandedSpaceIds={new Set()}
          onNewSession={onNewSession}
          onNewSpace={vi.fn()}
          onSelectSpace={vi.fn()}
          onToggleSpace={vi.fn()}
          onSelectSpaceAttempt={vi.fn()}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /new chat/i }))

    expect(onNewSession).toHaveBeenCalled()
  })

  it('deletes a global chat session from the actions menu', async () => {
    const onDeleteSession = vi.fn()

    render(
      <TooltipProvider>
        <GlobalChatSessionList
          spaces={[]}
          sessions={[baseSession]}
          activeSessionId={null}
          selectedSpaceId={null}
          expandedSpaceIds={new Set()}
          onNewSession={vi.fn()}
          onNewSpace={vi.fn()}
          onSelectSpace={vi.fn()}
          onToggleSpace={vi.fn()}
          onSelectSpaceAttempt={vi.fn()}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={onDeleteSession}
        />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: /chat session actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Delete session'))

    expect(onDeleteSession).toHaveBeenCalledWith('global-session-1')
  })

  it('selects and expands Spaces with linked attempts', () => {
    const onSelectSpace = vi.fn()
    const onToggleSpace = vi.fn()
    const onSelectSpaceAttempt = vi.fn()

    render(
      <TooltipProvider>
        <GlobalChatSessionList
          spaces={[
            {
              id: 'space-1',
              title: 'Launch plan',
              attempts: [
                {
                  attemptId: 'attempt-1',
                  sessionId: baseSession.id,
                  sessionName: baseSession.name,
                  role: 'seed',
                  session: baseSession,
                },
              ],
            },
          ]}
          sessions={[]}
          activeSessionId={baseSession.id}
          selectedSpaceId="space-1"
          expandedSpaceIds={new Set(['space-1'])}
          onNewSession={vi.fn()}
          onNewSpace={vi.fn()}
          onSelectSpace={onSelectSpace}
          onToggleSpace={onToggleSpace}
          onSelectSpaceAttempt={onSelectSpaceAttempt}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /open space launch/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /collapse space launch/i }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /open space attempt planning chat/i,
      }),
    )

    expect(onSelectSpace).toHaveBeenCalledWith('space-1')
    expect(onToggleSpace).toHaveBeenCalledWith('space-1')
    expect(onSelectSpaceAttempt).toHaveBeenCalledWith(baseSession.id)
  })
})
