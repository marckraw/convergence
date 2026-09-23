import { Sidebar } from './sidebar.container'
import { useState } from 'react'
import { useSidebarSearchShortcut } from './sidebar-search.container'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, type Project } from '@/entities/project'
import type { SessionSummary } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import {
  SidebarConversations,
  type SidebarConversationsProps,
} from './sidebar-conversations.container'
import { sidebarCards } from './sidebar-sessions.pure'

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
  // The root builds the cards once (MAR-3378 F1b); this harness stands in for
  // it with the same derivation over the same list.
  const globalSessions = overrides.globalSessions ?? []
  const projects = overrides.projects ?? [activeProject]
  return {
    collapsed: false,
    globalSessions,
    sessions: [],
    headerStart: null,
    headerEnd: null,
    projects,
    activeProject,
    cards: sidebarCards(globalSessions, {
      projects,
      endpoints: [],
      now: Date.parse('2026-01-01T00:00:00.000Z'),
      dismissals: {},
    }),
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

function ShortcutSidebar({ initiallyCollapsed = false, expand = vi.fn() }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const [searchRequest, setSearchRequest] = useState(0)
  useSidebarSearchShortcut({
    collapsed,
    expand: () => {
      expand()
      setCollapsed(false)
    },
    onRequest: () => setSearchRequest((n) => n + 1),
  })
  return (
    <TooltipProvider>
      <textarea aria-label="Composer" />
      {!collapsed && (
        <SidebarConversations {...conversationProps({ searchRequest })} />
      )}
    </TooltipProvider>
  )
}

function cmdF(target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', {
    key: 'f',
    metaKey: true,
    bubbles: true,
    cancelable: true,
  })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

describe('Sidebar search shortcut requests', () => {
  it('Cmd+F on a focused dialog button does not expand or request search', () => {
    const expand = vi.fn()
    const onRequest = vi.fn()
    function DialogShortcut() {
      useSidebarSearchShortcut({ collapsed: true, expand, onRequest })
      return (
        <div role="dialog">
          <button>Dialog action</button>
        </div>
      )
    }
    render(<DialogShortcut />)
    const button = screen.getByRole('button', { name: 'Dialog action' })
    button.focus()
    expect(cmdF(button).defaultPrevented).toBe(false)
    expect(button).toHaveFocus()
    expect(expand).not.toHaveBeenCalled()
    expect(onRequest).not.toHaveBeenCalled()
  })
  it('Cmd+F closed opens and focuses; open search selects text inside its marked field', () => {
    render(<ShortcutSidebar />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(cmdF().defaultPrevented).toBe(true)
    const field = screen.getByRole('searchbox') as HTMLInputElement
    expect(field).toHaveFocus()
    fireEvent.change(field, { target: { value: 'Fable' } })
    field.setSelectionRange(5, 5)
    expect(cmdF(field).defaultPrevented).toBe(true)
    expect(field).toHaveFocus()
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(5)
  })
  it('Cmd+F while the target is the composer textarea does nothing', () => {
    render(<ShortcutSidebar />)
    const composer = screen.getByRole('textbox', { name: 'Composer' })
    composer.focus()
    expect(cmdF(composer).defaultPrevented).toBe(false)
    expect(composer).toHaveFocus()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
  it('collapsed calls expand once and mounts the field open and focused', () => {
    const expand = vi.fn()
    render(<ShortcutSidebar initiallyCollapsed expand={expand} />)
    expect(
      screen.queryByRole('button', { name: 'Search conversations' }),
    ).toBeNull()
    cmdF()
    expect(expand).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })
  it('Escape closes the field and the next render keeps it closed', () => {
    const view = render(<ShortcutSidebar />)
    cmdF()
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(screen.queryByRole('searchbox')).toBeNull()
    view.rerender(<ShortcutSidebar />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    cmdF()
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })
  it.each([
    ['meta', { metaKey: true }, true],
    ['ctrl', { ctrlKey: true }, true],
    ['shift-blocked', { metaKey: true, shiftKey: true }, false],
    ['alt-blocked', { metaKey: true, altKey: true }, false],
  ] as const)(
    'shortcut shape %s and defaultPrevented',
    (_name, modifiers, handled) => {
      const onRequest = vi.fn()
      const { unmount } = renderHook(() =>
        useSidebarSearchShortcut({
          collapsed: false,
          expand: vi.fn(),
          onRequest,
        }),
      )
      const event = new KeyboardEvent('keydown', {
        key: 'f',
        cancelable: true,
        ...modifiers,
      })
      act(() => {
        window.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(handled)
      expect(onRequest).toHaveBeenCalledTimes(handled ? 1 : 0)
      unmount()
      cmdF()
      expect(onRequest).toHaveBeenCalledTimes(handled ? 1 : 0)
    },
  )
})

vi.mock('@/features', () => {
  const Dialog = ({ trigger }: { trigger?: import('react').ReactNode }) =>
    trigger ?? null
  return {
    AppSettingsDialogContainer: Dialog,
    SpaceWorkboardDialogContainer: Dialog,
    McpServersDialogContainer: Dialog,
    ProjectContextSettings: Dialog,
    ProjectCreateDialogContainer: Dialog,
    ProjectSettingsDialogContainer: Dialog,
    PromptLibraryBrowserDialogContainer: Dialog,
    ProviderStatusDialogContainer: Dialog,
    ReleaseNotesDialogContainer: Dialog,
    SkillsBrowserDialogContainer: Dialog,
    SpaceCreateDialogContainer: Dialog,
    ThemeToggleButton: Dialog,
    WorkspaceCreateDialogContainer: Dialog,
    LaneCreateDialogContainer: Dialog,
  }
})

it('real Sidebar keeps one keydown listener across three unrelated prop re-renders', () => {
  const addListener = vi.spyOn(window, 'addEventListener')
  const removeListener = vi.spyOn(window, 'removeEventListener')
  function LivingSidebar({
    activeSessionId,
  }: {
    activeSessionId: string | null
  }) {
    return (
      <TooltipProvider>
        <Sidebar
          activeSurface="code"
          onSelectSurface={noop}
          onSelectSession={noop}
          activeSessionId={activeSessionId}
          onSelectGlobalSession={noop}
          onNewGlobalSession={noop}
          selectedSpaceId={null}
          onSelectSpace={noop}
          activeGlobalSessionId={null}
          collapsed
          peek={false}
          onCollapse={noop}
          onExpand={noop}
          onPeek={noop}
          onPinPeek={noop}
        />
      </TooltipProvider>
    )
  }
  const view = render(<LivingSidebar activeSessionId={null} />)
  for (const activeSessionId of ['one', 'two', 'three']) {
    view.rerender(<LivingSidebar activeSessionId={activeSessionId} />)
  }
  expect(
    addListener.mock.calls.filter(([type]) => type === 'keydown'),
  ).toHaveLength(1)
  expect(
    removeListener.mock.calls.filter(([type]) => type === 'keydown'),
  ).toHaveLength(0)
  view.unmount()
  expect(
    removeListener.mock.calls.filter(([type]) => type === 'keydown'),
  ).toHaveLength(1)
})

it('real Sidebar passes the collapsed shortcut request through to the mounted field', () => {
  const expand = vi.fn()
  function LivingSidebar() {
    const [collapsed, setCollapsed] = useState(true)
    return (
      <TooltipProvider>
        <Sidebar
          activeSurface="code"
          onSelectSurface={noop}
          onSelectSession={noop}
          activeSessionId={null}
          onSelectGlobalSession={noop}
          onNewGlobalSession={noop}
          selectedSpaceId={null}
          onSelectSpace={noop}
          activeGlobalSessionId={null}
          collapsed={collapsed}
          peek={false}
          onCollapse={() => setCollapsed(true)}
          onExpand={() => {
            expand()
            setCollapsed(false)
          }}
          onPeek={noop}
          onPinPeek={noop}
        />
      </TooltipProvider>
    )
  }
  render(<LivingSidebar />)
  expect(screen.queryByRole('searchbox')).toBeNull()
  cmdF()
  expect(expand).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('searchbox')).toHaveFocus()
})
