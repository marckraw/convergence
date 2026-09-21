import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, type Project } from '@/entities/project'
import type { SessionSummary } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import {
  SidebarConversations,
  type SidebarConversationsProps,
} from './sidebar-conversations.container'

beforeEach(() => localStorage.clear())

const baseSession = {
  contextKind: 'project' as const,
  projectId: 'project-1',
  workspaceId: null,
  model: 'sonnet',
  effort: 'medium' as const,
  status: 'completed' as const,
  attention: 'finished' as const,
  activity: null,
  contextWindow: null,
  workingDirectory: '/tmp',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation' as const,
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  providerId: 'codex',
  executionHost: 'local',
}

function session(
  partial: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'name'>,
): SessionSummary {
  return { ...baseSession, ...partial } as SessionSummary
}

const activeProject: Project = {
  id: 'project-1',
  name: 'Project',
  repositoryPath: '/tmp/project',
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  laneOf: null,
  laneName: null,
}

const noop = vi.fn()

function conversationProps(
  overrides: Partial<SidebarConversationsProps> = {},
): SidebarConversationsProps {
  return {
    collapsed: false,
    globalSessions: [],
    sessions: [],
    headerStart: null,
    headerEnd: null,
    projects: [activeProject],
    activeProject,
    endpoints: [],
    cardNow: Date.parse('2026-01-01T00:00:00.000Z'),
    needsYouDismissals: {},
    activeSurface: 'code',
    activeSessionId: null,
    activeGlobalSessionId: null,
    terminalIdleNotices: [],
    onPin: noop,
    onSelectNeedsYou: noop,
    onDismissNeedsYou: noop,
    onArchiveSession: noop,
    onSelectTerminalIdle: noop,
    onDismissTerminalIdle: noop,
    chatSpaces: [],
    ungroupedGlobalChatSessions: [],
    selectedSpaceId: null,
    expandedSpaceIds: new Set(),
    archivedSpacesExpanded: false,
    onNewGlobalSession: noop,
    onNewSpace: noop,
    onSelectSpace: noop,
    onToggleSpace: noop,
    onToggleArchivedSpaces: noop,
    onArchiveSpace: noop,
    onUnarchiveSpace: noop,
    onSelectSpaceAttempt: noop,
    onSelectGlobalSession: noop,
    onManageSessionSpaces: noop,
    onDetachSpaceAttempt: noop,
    onUnarchiveSession: noop,
    onDeleteGlobalChatSession: noop,
    onSelectProject: noop,
    onCreateProject: noop,
    cardContext: {
      projectName: 'Project',
      endpoints: [],
      now: Date.parse('2026-01-01T00:00:00.000Z'),
    },
    baseBranchName: 'master',
    workspaces: [],
    onSelectSession: noop,
    onDeleteSession: noop,
    onRenameSession: noop,
    onRegenerateSessionName: noop,
    onDeleteWorkspace: noop,
    onOpenCreateWorkspace: noop,
    ...overrides,
  }
}

function renderConversations(
  overrides: Partial<SidebarConversationsProps> = {},
) {
  return render(
    <TooltipProvider>
      <SidebarConversations {...conversationProps(overrides)} />
    </TooltipProvider>,
  )
}

describe('SidebarConversations (production search wiring)', () => {
  const pinnedA = session({
    id: 'pin-a',
    name: '-- Fable Mastermind --',
    pinnedAt: '2026-01-01T00:00:00.000Z',
    status: 'running',
    attention: 'none',
  })
  const pinnedB = session({
    id: 'pin-b',
    name: 'Fable Reviewer',
    pinnedAt: '2026-01-01T00:00:00.000Z',
    status: 'running',
    attention: 'none',
  })
  const otherGlobal = session({
    id: 'g-other',
    name: 'Plain agent',
    pinnedAt: '2026-01-01T00:00:00.000Z',
    status: 'running',
    attention: 'none',
  })
  const treeMatch = session({ id: 'tree-fable', name: 'Fable horse' })
  const treeOthers = Array.from({ length: 10 }, (_, index) =>
    session({ id: `tree-${index}`, name: `Other work ${index}` }),
  )

  it('R3 opens a focused search field from the header toggle', () => {
    renderConversations({
      globalSessions: [pinnedA],
      sessions: [treeMatch],
    })
    const toggle = screen.getByRole('button', { name: 'Search conversations' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const field = screen.getByRole('searchbox', {
      name: 'Search conversations',
    })
    expect(field).toHaveFocus()
  })

  it('R2/R7 narrows Activity and the project tree together; clearing restores counts', () => {
    renderConversations({
      globalSessions: [pinnedA, pinnedB, otherGlobal],
      sessions: [treeMatch, ...treeOthers],
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
      { target: { value: 'fable' } },
    )

    expect(
      within(screen.getByRole('region', { name: 'Pinned' })).getByText('2'),
    ).toBeInTheDocument()
    expect(screen.getByText('master (1)')).toBeInTheDocument()
    expect(screen.getByText('-- Fable Mastermind --')).toBeInTheDocument()
    expect(screen.getByText('Fable Reviewer')).toBeInTheDocument()
    expect(screen.getByText('Fable horse')).toBeInTheDocument()
    expect(screen.queryByText('Plain agent')).toBeNull()
    expect(screen.queryByText('Other work 0')).toBeNull()

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
      { target: { value: '' } },
    )
    expect(screen.getByText('Plain agent')).toBeInTheDocument()
    expect(screen.getByText('master (11)')).toBeInTheDocument()
  })

  it('R3 filters live as he types — no Enter required', () => {
    renderConversations({
      globalSessions: [pinnedA, otherGlobal],
      sessions: [treeMatch],
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    const field = screen.getByRole('searchbox', {
      name: 'Search conversations',
    })
    fireEvent.change(field, { target: { value: 'fable' } })
    expect(screen.getByText('-- Fable Mastermind --')).toBeInTheDocument()
    expect(screen.queryByText('Plain agent')).toBeNull()
  })

  it('R4 Escape clears then closes; toggle closes and clears', () => {
    renderConversations({
      globalSessions: [pinnedA],
      sessions: [treeMatch],
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    const field = screen.getByRole('searchbox', {
      name: 'Search conversations',
    })
    fireEvent.change(field, { target: { value: 'fable' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(field).toHaveValue('')
    expect(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
    ).toBeInTheDocument()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(
      screen.queryByRole('searchbox', { name: 'Search conversations' }),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
      { target: { value: 'fable' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    expect(
      screen.queryByRole('searchbox', { name: 'Search conversations' }),
    ).toBeNull()
    expect(screen.getByText('-- Fable Mastermind --')).toBeInTheDocument()
  })

  it('R4 collapse clears on one living instance — field closed and every conversation listed', () => {
    const lists = {
      globalSessions: [pinnedA, otherGlobal],
      sessions: [treeMatch, ...treeOthers],
    }
    function Living({ collapsed }: { collapsed: boolean }) {
      return (
        <TooltipProvider>
          <SidebarConversations
            {...conversationProps({ ...lists, collapsed })}
          />
        </TooltipProvider>
      )
    }

    const view = render(<Living collapsed={false} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
      { target: { value: 'fable' } },
    )
    expect(screen.queryByText('Plain agent')).toBeNull()
    expect(screen.queryByText('Other work 0')).toBeNull()

    view.rerender(<Living collapsed={true} />)
    view.rerender(<Living collapsed={false} />)

    expect(
      screen.queryByRole('searchbox', { name: 'Search conversations' }),
    ).toBeNull()
    expect(screen.getByText('Plain agent')).toBeInTheDocument()
    expect(screen.getByText('Other work 0')).toBeInTheDocument()
    expect(screen.getByText('master (11)')).toBeInTheDocument()
  })

  it('R4 never persists the query in localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderConversations({
      globalSessions: [pinnedA],
      sessions: [treeMatch],
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
      { target: { value: 'fable' } },
    )
    const queryWrites = setItem.mock.calls.filter(([, value]) =>
      String(value).includes('fable'),
    )
    expect(queryWrites).toEqual([])
  })

  it('R6 shows the no-match line and hides empty branches', () => {
    renderConversations({
      globalSessions: [otherGlobal],
      sessions: [...treeOthers],
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
      { target: { value: 'fable' } },
    )
    expect(
      screen.getAllByText('No conversation matches "fable"').length,
    ).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/^master/)).toBeNull()
  })
})
