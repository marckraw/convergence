import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import {
  GlobalChatSessionList,
  type ChatSidebarSpace,
} from './global-chat-session-list.presentational'

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

const linkedSpace: ChatSidebarSpace = {
  id: 'space-1',
  title: 'Launch plan',
  archivedAt: null,
  attempts: [
    {
      attemptId: 'attempt-1',
      sessionId: baseSession.id,
      sessionName: baseSession.name,
      role: 'seed',
      session: baseSession,
    },
  ],
}

function renderList(
  props: Partial<Parameters<typeof GlobalChatSessionList>[0]> = {},
) {
  const defaults: Parameters<typeof GlobalChatSessionList>[0] = {
    spaces: [],
    sessions: [],
    activeSessionId: null,
    selectedSpaceId: null,
    expandedSpaceIds: new Set(),
    archivedSpacesExpanded: false,
    onNewSession: vi.fn(),
    onNewSpace: vi.fn(),
    onSelectSpace: vi.fn(),
    onToggleSpace: vi.fn(),
    onToggleArchivedSpaces: vi.fn(),
    onArchiveSpace: vi.fn(),
    onUnarchiveSpace: vi.fn(),
    onSelectSpaceAttempt: vi.fn(),
    onSelectSession: vi.fn(),
    onManageSessionSpaces: vi.fn(),
    onDetachSpaceAttempt: vi.fn(),
    onArchiveSession: vi.fn(),
    onUnarchiveSession: vi.fn(),
    onDeleteSession: vi.fn(),
  }

  return render(
    <TooltipProvider>
      <GlobalChatSessionList {...defaults} {...props} />
    </TooltipProvider>,
  )
}

describe('GlobalChatSessionList', () => {
  it('selects a global chat session from the list', () => {
    const onSelectSession = vi.fn()

    renderList({ sessions: [baseSession], onSelectSession })

    fireEvent.click(
      screen.getByRole('button', {
        name: /open chat session planning chat/i,
      }),
    )

    expect(onSelectSession).toHaveBeenCalledWith('global-session-1')
  })

  it('starts a new chat draft', () => {
    const onNewSession = vi.fn()

    renderList({ onNewSession })

    fireEvent.click(screen.getByRole('button', { name: /new chat/i }))

    expect(onNewSession).toHaveBeenCalled()
  })

  it('deletes a global chat session from the actions menu', async () => {
    const onDeleteSession = vi.fn()

    renderList({ sessions: [baseSession], onDeleteSession })

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: /chat session actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Delete session'))

    expect(onDeleteSession).toHaveBeenCalledWith('global-session-1')
  })

  it('opens Space linking from an ungrouped chat actions menu', async () => {
    const onManageSessionSpaces = vi.fn()

    renderList({ sessions: [baseSession], onManageSessionSpaces })

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: /chat session actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Add to Space...'))

    expect(onManageSessionSpaces).toHaveBeenCalledWith('global-session-1')
  })

  it('selects and expands Spaces with linked attempts', () => {
    const onSelectSpace = vi.fn()
    const onToggleSpace = vi.fn()
    const onSelectSpaceAttempt = vi.fn()

    renderList({
      spaces: [linkedSpace],
      activeSessionId: baseSession.id,
      selectedSpaceId: 'space-1',
      expandedSpaceIds: new Set(['space-1']),
      onSelectSpace,
      onToggleSpace,
      onSelectSpaceAttempt,
    })

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

  it('archives and unarchives Spaces from Space actions', async () => {
    const onArchiveSpace = vi.fn()
    const onUnarchiveSpace = vi.fn()

    renderList({
      spaces: [
        linkedSpace,
        { ...linkedSpace, id: 'space-2', title: 'Old plan', archivedAt: 'now' },
      ],
      archivedSpacesExpanded: true,
      onArchiveSpace,
      onUnarchiveSpace,
    })

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /space actions launch plan/i }),
    )
    fireEvent.click(await screen.findByText('Archive Space...'))
    expect(onArchiveSpace).toHaveBeenCalledWith('space-1')

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /archived space actions old plan/i }),
    )
    fireEvent.click(await screen.findByText('Unarchive Space'))
    expect(onUnarchiveSpace).toHaveBeenCalledWith('space-2')
  })

  it('detaches a linked Space attempt from the attempt actions menu', async () => {
    const onDetachSpaceAttempt = vi.fn()
    const onArchiveSession = vi.fn()
    const onDeleteSession = vi.fn()

    renderList({
      spaces: [linkedSpace],
      selectedSpaceId: 'space-1',
      expandedSpaceIds: new Set(['space-1']),
      onDetachSpaceAttempt,
      onArchiveSession,
      onDeleteSession,
    })

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: /space attempt actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Detach from Space'))

    expect(onDetachSpaceAttempt).toHaveBeenCalledWith(
      'attempt-1',
      'space-1',
      baseSession.id,
    )

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: /space attempt actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Archive session'))
    expect(onArchiveSession).toHaveBeenCalledWith(baseSession.id)

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: /space attempt actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Delete session'))
    expect(onDeleteSession).toHaveBeenCalledWith(baseSession.id)
  })
})
