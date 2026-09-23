import { Profiler } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@/entities/project'
import { useProjectStore } from '@/entities/project'
import {
  sessionApi,
  useSessionStore,
  type SessionSummary,
} from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { Sidebar } from './sidebar.container'

/**
 * MAR-3378 F1b — the sidebar redraws only when something it shows changes.
 *
 * Counters, each read by the rule it proves:
 * - `commits`: React <Profiler> commits of the whole sidebar (R1), phases
 *   `mount` and `update`;
 * - `nestedCommits`: the Profiler's `nested-update` phase, kept apart. Every
 *   render of a Radix `asChild` trigger (tooltips, the tools dropdown)
 *   re-attaches its composed ref, and that ref callback's setState commits
 *   once more inside the same act (a bail-out, ~0.07 ms). It follows every
 *   render, on master and here, so it is counted and reported, not hidden;
 * - `conversationRenders`: renders of `SidebarConversations`, counted through
 *   the search hook it calls exactly once per render (the memo boundary);
 * - `cardModels`: calls of `needsYouCardModel` (R2).
 */
const counts = vi.hoisted(() => ({
  commits: 0,
  nestedCommits: 0,
  conversationRenders: 0,
  cardModels: 0,
}))

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

vi.mock('./sidebar-search.container', async (original) => {
  const real = await original<typeof import('./sidebar-search.container')>()
  return {
    ...real,
    useSidebarConversationSearch: (
      options: Parameters<typeof real.useSidebarConversationSearch>[0],
    ) => {
      counts.conversationRenders++
      return real.useSidebarConversationSearch(options)
    },
  }
})

vi.mock('@/features/needs-you', async (original) => {
  const real = await original<typeof import('@/features/needs-you')>()
  return {
    ...real,
    needsYouCardModel: (...args: Parameters<typeof real.needsYouCardModel>) => {
      counts.cardModels++
      return real.needsYouCardModel(...args)
    },
  }
})

const T0 = Date.parse('2026-09-24T10:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

const project = {
  id: 'p1',
  name: 'Convergence repo',
} as unknown as Project

function conversation(
  id: string,
  partial: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id,
    name: `Conversation ${id}`,
    contextKind: 'project',
    projectId: 'p1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'opus',
    effort: null,
    status: 'completed',
    attention: 'finished',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    executionHost: 'local',
    continuationToken: null,
    lastSequence: 0,
    createdAt: iso(T0 - 60 * 60_000),
    updatedAt: iso(T0 - 10 * 60_000),
    ...partial,
  } as SessionSummary
}

function running(id: string, partial: Partial<SessionSummary> = {}) {
  return conversation(id, {
    status: 'running',
    attention: 'none',
    activity: 'streaming',
    hasActiveHandle: true,
    turnTiming: {
      turnId: `turn-${id}`,
      startedAt: iso(T0 - 30_000),
      endedAt: null,
      status: 'running',
    },
    ...partial,
  })
}

/** Twelve conversations, six streaming; B streams and moves (R1). */
function twelve(): SessionSummary[] {
  return [
    running('B', { updatedAt: iso(T0 - 5 * 60_000) }),
    ...['C', 'D', 'E', 'F', 'G'].map((id) => running(id)),
    ...['H', 'I', 'J', 'K', 'L', 'M'].map((id, index) =>
      conversation(id, { updatedAt: iso(T0 - (20 + index) * 60_000) }),
    ),
  ]
}

function summarize(session: SessionSummary) {
  act(() => {
    useSessionStore.getState().handleSessionSummaryUpdate(session)
  })
}

function tick(ms = 1000) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const noop = () => undefined

/** Re-rendering this harness with the same props is the "parent render". */
function Harness({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <TooltipProvider>
      <Profiler
        id="sidebar-root"
        onRender={(_id, phase) => {
          if (phase === 'nested-update') counts.nestedCommits++
          else counts.commits++
        }}
      >
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
          onCollapse={noop}
          onExpand={noop}
          onPeek={noop}
          onPinPeek={noop}
        />
      </Profiler>
    </TooltipProvider>
  )
}

function resetCounts() {
  counts.commits = 0
  counts.nestedCommits = 0
  counts.conversationRenders = 0
  counts.cardModels = 0
}

function seed(globalSessions: SessionSummary[]) {
  useProjectStore.setState({ projects: [project], activeProject: null })
  useSessionStore.setState({
    sessions: [],
    globalSessions,
    globalChatSessions: [],
    needsYouDismissals: {},
    currentProjectId: null,
  })
}

function lastMovedStamps(): string[] {
  return [...document.querySelectorAll('time[datetime]')].map(
    (node) => node.getAttribute('datetime') ?? '',
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ now: T0 })
  resetCounts()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MAR-3378 F1b R1 — another conversation’s word does not redraw the sidebar', () => {
  it('30 updatedAt-only summaries → 0 commits; the tick → at most 1; a status change → exactly 1 at once — mutations: equality includes updatedAt, drop memo on SidebarConversations', () => {
    const sessions = twelve()
    seed(sessions)
    const view = render(<Harness />)
    const B = sessions[0]
    resetCounts()

    // 30 words from B: only `updatedAt` moves.
    for (let i = 1; i <= 30; i++) {
      summarize({ ...B, updatedAt: iso(T0 + i * 10) })
    }
    expect(counts.commits).toBe(0)
    expect(counts.nestedCommits).toBe(0)
    expect(counts.conversationRenders).toBe(0)
    expect(lastMovedStamps()).not.toContain(iso(T0 + 300))

    // The clock's tick releases the held lists: at most one commit, and
    // "Last moved" catches up to B's latest word (R3).
    tick()
    expect(counts.commits).toBeLessThanOrEqual(1)
    expect(lastMovedStamps()).toContain(iso(T0 + 300))

    // A parent render that changes nothing the conversations show: the memo
    // boundary holds (mutation: drop `memo` on SidebarConversations → 1).
    resetCounts()
    view.rerender(<Harness />)
    expect(counts.conversationRenders).toBe(0)

    // Something a card SHOWS: B finishes → exactly one commit, immediately,
    // and B is in review before any tick.
    resetCounts()
    summarize({
      ...B,
      updatedAt: iso(T0 + 400),
      status: 'completed',
      attention: 'finished',
      activity: null,
      hasActiveHandle: false,
      turnTiming: {
        turnId: 'turn-B',
        startedAt: iso(T0 - 30_000),
        endedAt: iso(T0 + 400),
        status: 'completed',
      },
    })
    expect(counts.commits).toBe(1)
    expect(
      within(screen.getByRole('region', { name: 'Review' })).getByText(
        'Conversation B',
      ),
    ).toBeInTheDocument()
  })
})

describe('MAR-3378 F1b R2 — one card derivation', () => {
  it('builds one card per conversation per change, not two — mutation: build the cards in the feed again', () => {
    const sessions = twelve()
    seed(sessions)
    render(<Harness />)
    expect(counts.cardModels).toBe(sessions.length)

    resetCounts()
    summarize({ ...sessions[0], status: 'completed', attention: 'finished' })
    expect(counts.cardModels).toBe(sessions.length)

    resetCounts()
    tick()
    expect(counts.cardModels).toBe(sessions.length)
  })
})

describe('MAR-3378 F1b R3 — the features still move', () => {
  it('a dismissed card comes back within one tick after its conversation moves', () => {
    vi.spyOn(sessionApi, 'setNeedsYouDismissals').mockResolvedValue()
    const reviewed = conversation('R', { updatedAt: iso(T0 - 3 * 60_000) })
    seed([running('B'), reviewed])
    useSessionStore.setState({
      needsYouDismissals: {
        R: { updatedAt: reviewed.updatedAt, disposition: 'acknowledged' },
      },
    })
    render(<Harness />)
    expect(screen.queryByText('Conversation R')).toBeNull()

    summarize({ ...reviewed, updatedAt: iso(T0 + 50) })
    tick()
    expect(
      within(screen.getByRole('region', { name: 'Review' })).getByText(
        'Conversation R',
      ),
    ).toBeInTheDocument()
  })

  it('dismissing a card that has moved since the last tick hides it at once', () => {
    vi.spyOn(sessionApi, 'setNeedsYouDismissals').mockResolvedValue()
    const reviewed = conversation('R', { updatedAt: iso(T0 - 3 * 60_000) })
    seed([running('B'), reviewed])
    render(<Harness />)
    // R moves without anything shown changing: the sidebar holds the old copy.
    summarize({ ...reviewed, updatedAt: iso(T0 + 50) })
    act(() => {
      void useSessionStore.getState().dismissNeedsYouSession('R')
    })
    expect(screen.queryByText('Conversation R')).toBeNull()
  })

  it('order inside a group follows movement after the tick (Updated order)', () => {
    localStorage.setItem(
      'convergence:sidebar-activity-view:v1',
      JSON.stringify({
        version: 3,
        activities: [],
        hosts: [],
        providers: [],
        order: 'updated',
      }),
    )
    const first = conversation('A', { updatedAt: iso(T0 - 60_000) })
    const second = conversation('Z', { updatedAt: iso(T0 - 2 * 60_000) })
    seed([running('B'), first, second])
    render(<Harness />)
    const reviewOrder = () =>
      within(screen.getByRole('region', { name: 'Review' }))
        .getAllByText(/^Conversation [AZ]$/)
        .map((node) => node.textContent)
    expect(reviewOrder()).toEqual(['Conversation A', 'Conversation Z'])

    summarize({ ...second, updatedAt: iso(T0 + 50) })
    expect(reviewOrder()).toEqual(['Conversation A', 'Conversation Z'])
    tick()
    expect(reviewOrder()).toEqual(['Conversation Z', 'Conversation A'])
  })

  it('the collapsed rail’s badge still counts, and a real change updates it at once', () => {
    const sessions = [
      running('B'),
      conversation('R1'),
      conversation('R2'),
      conversation('W', { attention: 'needs-input', status: 'running' }),
    ]
    seed(sessions)
    render(<Harness collapsed />)
    expect(
      screen.getByRole('button', { name: 'Needs You (3)' }),
    ).toBeInTheDocument()

    summarize({ ...sessions[0], status: 'completed', attention: 'finished' })
    expect(
      screen.getByRole('button', { name: 'Needs You (4)' }),
    ).toBeInTheDocument()
  })

  it('a rename shows at once, before any tick', () => {
    const sessions = twelve()
    seed(sessions)
    render(<Harness />)
    resetCounts()
    summarize({ ...sessions[0], name: 'Renamed B', updatedAt: iso(T0 + 10) })
    expect(counts.commits).toBe(1)
    expect(
      within(screen.getByRole('region', { name: 'Working' })).getByText(
        'Renamed B',
      ),
    ).toBeInTheDocument()
  })
})
