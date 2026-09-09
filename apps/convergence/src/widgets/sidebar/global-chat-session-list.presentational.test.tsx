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
  it.each(['chat', 'space'] as const)(
    'R5 %s reads the same answered count — mutation omit parallel summary from the row turns red',
    (kind) => {
      const session = {
        ...baseSession,
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
    renderList({ sessions: [{ ...baseSession, parallelWork: running }] })
    render(
      <AttentionIndicator
        attention="finished"
        status="completed"
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
