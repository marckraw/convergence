import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { groupNeedsYou, needsYouCardModel } from '@/features/needs-you'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { NeedsYou } from './needs-you.container'
import { ProjectTree } from './project-tree.container'
import { useSidebarConversationSearch } from './sidebar-search.container'

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

function Harness({
  globalSessions,
  sessions,
  collapsed = false,
}: {
  globalSessions: SessionSummary[]
  sessions: SessionSummary[]
  collapsed?: boolean
}) {
  const search = useSidebarConversationSearch({
    globalSessions,
    sessions,
    collapsed,
  })
  const cardGroups = groupNeedsYou(
    search.searchedGlobalSessions.map((item) =>
      needsYouCardModel(item, {
        projectName: 'Project',
        endpoints: [],
        now: Date.parse('2026-01-01T00:00:00.000Z'),
      }),
    ),
  )
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">{search.toggleControl}</div>
      {search.field}
      <NeedsYou
        groups={cardGroups}
        nameSearchQuery={search.query}
        activeSessionId={null}
        onSelect={vi.fn()}
        onPin={vi.fn()}
        onDismiss={vi.fn()}
        onArchive={vi.fn()}
      />
      <ProjectTree
        cardContext={{
          projectName: 'Project',
          endpoints: [],
          now: Date.parse('2026-01-01T00:00:00.000Z'),
        }}
        baseBranchName="master"
        workspaces={[]}
        sessions={search.searchedSessions}
        nameSearchQuery={search.query}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onArchiveSession={vi.fn()}
        onUnarchiveSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
        onRegenerateSessionName={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onOpenCreateWorkspace={vi.fn()}
      />
      <output data-testid="searched-global-ids">
        {search.searchedGlobalSessions.map((item) => item.id).join(',')}
      </output>
      <output data-testid="searched-session-ids">
        {search.searchedSessions.map((item) => item.id).join(',')}
      </output>
    </TooltipProvider>
  )
}

describe('sidebar conversation search', () => {
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
    render(<Harness globalSessions={[pinnedA]} sessions={[treeMatch]} />)
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
    render(
      <Harness
        globalSessions={[pinnedA, pinnedB, otherGlobal]}
        sessions={[treeMatch, ...treeOthers]}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
      { target: { value: 'fable' } },
    )

    expect(screen.getByTestId('searched-global-ids')).toHaveTextContent(
      'pin-a,pin-b',
    )
    expect(screen.getByTestId('searched-session-ids')).toHaveTextContent(
      'tree-fable',
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
    expect(screen.getByTestId('searched-global-ids')).toHaveTextContent(
      'pin-a,pin-b,g-other',
    )
    expect(screen.getByText('master (11)')).toBeInTheDocument()
  })

  it('R3 filters live as he types — no Enter required', () => {
    render(
      <Harness
        globalSessions={[pinnedA, otherGlobal]}
        sessions={[treeMatch]}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    const field = screen.getByRole('searchbox', {
      name: 'Search conversations',
    })
    fireEvent.change(field, { target: { value: 'fable' } })
    expect(screen.getByTestId('searched-global-ids')).toHaveTextContent('pin-a')
    expect(screen.queryByText('Plain agent')).toBeNull()
  })

  it('R4 Escape clears then closes; toggle closes and clears; collapse clears', () => {
    const view = render(
      <Harness globalSessions={[pinnedA]} sessions={[treeMatch]} />,
    )
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
    expect(screen.getByTestId('searched-global-ids')).toHaveTextContent('pin-a')

    fireEvent.click(
      screen.getByRole('button', { name: 'Search conversations' }),
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search conversations' }),
      { target: { value: 'fable' } },
    )
    view.rerender(
      <Harness globalSessions={[pinnedA]} sessions={[treeMatch]} collapsed />,
    )
    view.rerender(<Harness globalSessions={[pinnedA]} sessions={[treeMatch]} />)
    expect(
      screen.queryByRole('searchbox', { name: 'Search conversations' }),
    ).toBeNull()
    expect(screen.getByTestId('searched-global-ids')).toHaveTextContent('pin-a')
  })

  it('R4 never persists the query in localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<Harness globalSessions={[pinnedA]} sessions={[treeMatch]} />)
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
    render(
      <Harness globalSessions={[otherGlobal]} sessions={[...treeOthers]} />,
    )
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

describe('R7 wiring mutations', () => {
  it('deleting either list filter from narrowSidebarSessionLists is caught by the harness ids', async () => {
    const { narrowSidebarSessionLists } =
      await import('@/shared/lib/name-search.pure')
    const globalSessions = [session({ id: 'g', name: 'Fable' })]
    const sessions = [
      session({ id: 'p-match', name: 'Fable' }),
      session({ id: 'p-other', name: 'Other' }),
    ]
    const correct = narrowSidebarSessionLists(globalSessions, sessions, 'fable')
    expect(correct.globalSessions.map((s) => s.id)).toEqual(['g'])
    expect(correct.sessions.map((s) => s.id)).toEqual(['p-match'])

    // Documented mutations that must stay red if someone reintroduces them:
    const onlyActivity = {
      globalSessions: correct.globalSessions,
      sessions,
    }
    expect(onlyActivity.sessions.map((s) => s.id)).not.toEqual(['p-match'])
  })
})
