import {
  getDatabase,
  closeDatabase,
  resetDatabase,
} from '../../../electron/backend/database/database'
import { HarnessEvidenceService } from '../../../electron/backend/session/harness-evidence.service'
import { AttentionIndicator } from '@/entities/session'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { TooltipProvider } from '@convergence/ui'
import {
  ARCHIVED_CHATS_STAY_OPEN_WHILE_YOU_SEARCH,
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
    archivedChatsExpanded: false,
    onNewSession: vi.fn(),
    onNewSpace: vi.fn(),
    onSelectSpace: vi.fn(),
    onToggleSpace: vi.fn(),
    onToggleArchivedSpaces: vi.fn(),
    onToggleArchivedChats: vi.fn(),
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
  it('MAR-3288 R5 badges a compacting chat as busy, not finished — mutation drop the compacting prop turns red', () => {
    renderList({
      sessions: [{ ...baseSession, activity: 'compacting' }],
    })
    expect(screen.getByLabelText('Compacting context…')).toBeInTheDocument()
  })

  it.each(['chat', 'space'] as const)(
    'R5 %s reads the same answered count — mutation omit parallel summary from the row turns red',
    (kind) => {
      const session = {
        ...baseSession,
        status: 'answered' as const,
        attention: 'none' as const,
        parallelWork: { running: 2, unknown: 1, failed: 0, stopped: 0 },
      }
      renderList(
        kind === 'chat'
          ? { sessions: [session] }
          : {
              spaces: [
                {
                  ...linkedSpace,
                  attempts: [{ ...linkedSpace.attempts[0], session }],
                },
              ],
              expandedSpaceIds: new Set([linkedSpace.id]),
            },
      )
      expect(
        screen.getByText('answered · 2 tasks running · 1 unknown'),
      ).toBeInTheDocument()
    },
  )
  it('NAV-21 a notification pulses the chat row and the Space attempt row, as the code tree does — mutation drop data-pulse turns red', () => {
    const other = { ...baseSession, id: 'quiet', name: 'Quiet chat' }
    renderList({
      sessions: [baseSession, other],
      spaces: [linkedSpace],
      expandedSpaceIds: new Set([linkedSpace.id]),
      pulsingSessionIds: { [baseSession.id]: true },
    })
    expect(
      screen.getByRole('button', { name: /open chat session planning chat/i }),
    ).toHaveAttribute('data-pulse', 'true')
    expect(
      screen.getByRole('button', { name: /open space attempt planning chat/i }),
    ).toHaveAttribute('data-pulse', 'true')
    expect(
      screen.getByRole('button', { name: /open chat session quiet chat/i }),
    ).not.toHaveAttribute('data-pulse')
  })

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

    fireEvent.click(
      screen.getByRole('button', {
        name: /chat session actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Delete session…'))

    expect(onDeleteSession).toHaveBeenCalledWith('global-session-1')
  })

  it('opens Space linking from an ungrouped chat actions menu', async () => {
    const onManageSessionSpaces = vi.fn()

    renderList({ sessions: [baseSession], onManageSessionSpaces })

    fireEvent.click(
      screen.getByRole('button', {
        name: /chat session actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Add to Space…'))

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

    fireEvent.click(
      screen.getByRole('button', { name: /space actions launch plan/i }),
    )
    fireEvent.click(await screen.findByText('Archive Space…'))
    expect(onArchiveSpace).toHaveBeenCalledWith('space-1')

    fireEvent.click(
      screen.getByRole('button', { name: /archived space actions old plan/i }),
    )
    fireEvent.click(await screen.findByText('Unarchive Space'))
    expect(onUnarchiveSpace).toHaveBeenCalledWith('space-2')
  })

  it('lets archived Spaces collapse even when an archived Space is selected', () => {
    renderList({
      spaces: [
        {
          ...linkedSpace,
          id: 'space-2',
          title: 'Old plan',
          archivedAt: 'now',
        },
      ],
      selectedSpaceId: 'space-2',
      archivedSpacesExpanded: false,
    })

    expect(screen.queryByText('Old plan')).toBeNull()
    expect(
      screen.getByRole('button', { name: /expand archived spaces/i }),
    ).toBeInTheDocument()
  })

  it('NAV-13 folds the archived chats as the code tree folds its archive, held open by a search — mutation draw them under a plain header turns red', () => {
    const archived = {
      ...baseSession,
      id: 'old-chat',
      name: 'Old taxes',
      archivedAt: '2026-01-02T00:00:00.000Z',
    }
    const onToggleArchivedChats = vi.fn()
    const row = () =>
      screen.queryByRole('button', { name: 'Open chat session Old taxes' })
    const first = renderList({ sessions: [archived], onToggleArchivedChats })
    const fold = screen.getByRole('button', { name: 'Expand archived chats' })
    const folded = { expanded: fold.getAttribute('aria-expanded'), row: row() }
    fireEvent.click(fold)
    first.unmount()
    const second = renderList({
      sessions: [archived],
      archivedChatsExpanded: true,
    })
    const open = Boolean(row())
    second.unmount()
    renderList({ sessions: [archived], nameSearchQuery: 'taxes' })
    const searchFold = screen.getByRole('button', {
      name: 'Collapse archived chats',
    })
    expect({
      folded,
      toggled: onToggleArchivedChats.mock.calls.length,
      open,
      search: {
        row: Boolean(row()),
        locked: searchFold.getAttribute('aria-disabled'),
        reason: searchFold.getAttribute('aria-description'),
      },
    }).toEqual({
      folded: { expanded: 'false', row: null },
      toggled: 1,
      open: true,
      search: {
        row: true,
        locked: 'true',
        reason: ARCHIVED_CHATS_STAY_OPEN_WHILE_YOU_SEARCH,
      },
    })
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

    fireEvent.click(
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

    fireEvent.click(
      screen.getByRole('button', {
        name: /space attempt actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Archive session'))
    expect(onArchiveSession).toHaveBeenCalledWith(baseSession.id)

    fireEvent.click(
      screen.getByRole('button', {
        name: /space attempt actions planning chat/i,
      }),
    )
    fireEvent.click(await screen.findByText('Delete session…'))
    expect(onDeleteSession).toHaveBeenCalledWith(baseSession.id)
  })
})

it('RUN64 round2 alive is current in header and sidebar — mutations window running or unwindow failures turn red', () => {
  const db = getDatabase()
  try {
    db.prepare(
      "INSERT INTO sessions(id,context_kind,provider_id,name,working_directory) VALUES ('window','global','claude-code','window','/tmp')",
    ).run()
    db.prepare(
      "INSERT INTO session_turns(id,session_id,sequence,started_at,status) VALUES ('first','window',1,'2026-09-09T10:00:00Z','completed'),('second','window',2,'2026-09-09T11:00:00Z','completed')",
    ).run()
    const service = new HarnessEvidenceService(db)
    for (const taskId of ['old-a', 'old-b'])
      service.apply('window', 'first', {
        kind: 'task.changed',
        taskId,
        at: '2026-09-09T10:00:00Z',
        patch: { status: 'failed', startedAt: '2026-09-09T10:00:00Z' },
      })
    const parallelWork = service.countParallelWork(['window']).get('window')!
    const sidebar = renderList({ sessions: [{ ...baseSession, parallelWork }] })
    const header = render(
      <AttentionIndicator
        attention="finished"
        status="completed"
        parallelWork={parallelWork}
      />,
    )
    const oldLabels = screen.queryAllByText('answered · 2 failed').length
    sidebar.unmount()
    header.unmount()
    service.apply('window', 'first', {
      kind: 'task.changed',
      taskId: 'older-monitor',
      at: '2026-09-09T10:00:00Z',
      patch: { status: 'running', startedAt: '2026-09-09T10:00:00Z' },
    })
    const running = service.countParallelWork(['window']).get('window')!
    renderList({
      sessions: [
        {
          ...baseSession,
          status: 'answered',
          attention: 'none',
          parallelWork: running,
        },
      ],
    })
    render(
      <AttentionIndicator
        attention="none"
        status="answered"
        parallelWork={running}
      />,
    )
    expect({
      oldLabels,
      newLabels: screen.queryAllByText('answered · 1 tasks running').length,
    }).toEqual({ oldLabels: 0, newLabels: 2 })
  } finally {
    closeDatabase()
    resetDatabase()
  }
})

it('R5 narrows sessions by name and spaces by title or matching attempt', () => {
  const matching = { ...baseSession, id: 'match', name: 'Fable chat' }
  const other = { ...baseSession, id: 'other', name: 'Other chat' }
  const spaceWithMatch: ChatSidebarSpace = {
    id: 'space-match',
    title: 'Launch plan',
    archivedAt: null,
    attempts: [
      {
        attemptId: 'a1',
        sessionId: matching.id,
        sessionName: matching.name,
        role: 'seed',
        session: matching,
      },
      {
        attemptId: 'a2',
        sessionId: other.id,
        sessionName: other.name,
        role: 'seed',
        session: other,
      },
    ],
  }
  const spaceByTitle: ChatSidebarSpace = {
    id: 'space-title',
    title: 'Fable board',
    archivedAt: null,
    attempts: [
      {
        attemptId: 'a3',
        sessionId: 'plain',
        sessionName: 'Plain attempt',
        role: 'seed',
        session: { ...baseSession, id: 'plain', name: 'Plain attempt' },
      },
    ],
  }

  renderList({
    spaces: [spaceWithMatch, spaceByTitle],
    sessions: [matching, other],
    nameSearchQuery: 'fable',
    expandedSpaceIds: new Set(['space-match', 'space-title']),
  })

  expect(screen.getAllByText('Fable chat').length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('Fable board')).toBeInTheDocument()
  expect(screen.getByText('Launch plan')).toBeInTheDocument()
  expect(screen.getByText('Plain attempt')).toBeInTheDocument()
  expect(screen.queryByText('Other chat')).toBeNull()
})

it('R5 mutation: matching spaces only would hide a matching chat session → red', () => {
  renderList({
    spaces: [],
    sessions: [{ ...baseSession, name: 'Fable chat' }],
    nameSearchQuery: 'fable',
  })
  expect(screen.getByText('Fable chat')).toBeInTheDocument()
})

it('R6 shows the no-match line on the chat list', () => {
  renderList({
    spaces: [linkedSpace],
    sessions: [baseSession],
    nameSearchQuery: 'zzzz',
  })
  expect(screen.getByText('No conversation matches "zzzz"')).toBeInTheDocument()
  expect(screen.queryByText('Planning chat')).toBeNull()
})
