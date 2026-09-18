import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useSessionStore } from '@/entities/session'
import { useSessionCrewStore, type SessionCrew } from '@/entities/session-crew'
import { useWorkLedgerStore } from '@/entities/work-ledger'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { AppShell } from './App.layout'

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}))

/**
 * The wave column's wiring, through the real shell (MAR-3148 R4).
 *
 * The panel's own tests render the container; this one is about the two
 * decisions `App.layout` makes for it -- whether the column exists at all,
 * and whether it steps aside for Mission Control's own Waves tab. Neither is
 * visible from inside the feature, and both are one prop wide, which is
 * exactly the kind of wiring that disappears in a refactor with every gate
 * still green.
 */

const AT = '2026-09-18T00:00:00.000Z'

function crew(overrides: Partial<SessionCrew> = {}): SessionCrew {
  return {
    id: 'crew-1',
    name: 'Loom',
    emoji: null,
    accentColor: null,
    position: 0,
    roundCap: null,
    stallMinutes: null,
    createdAt: AT,
    updatedAt: AT,
    sessionIds: [],
    members: [],
    trackerBinding: {
      kind: 'linear',
      projectId: 'project-1',
      labelPrefix: 'horse:',
      wavePrefix: 'wave:',
      statusMap: {},
    },
    ...overrides,
  }
}

const noop = () => {}

function shellProps() {
  return {
    activeSessionId: null,
    activeGlobalSessionId: null,
    onSelectSession: noop,
    onSelectGlobalSession: noop,
    selectedChatSpaceId: null,
    draftChatSpaceId: null,
    onSelectChatSession: noop,
    loading: false,
    hasProject: true,
    showDevelopmentRibbon: false,
  }
}

function stubBridge(crews: SessionCrew[]) {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    crew: {
      list: vi.fn(async () => crews),
      onUpdated: vi.fn(() => () => {}),
    },
    workLedger: {
      list: vi.fn(async (crewId: string) => ({
        crewId,
        entries: [],
        trackerHealth: {
          state: 'ok',
          since: AT,
          lastOkAt: AT,
          backoffUntil: null,
        },
      })),
      onUpdated: vi.fn(() => () => {}),
    },
    session: { getAllSummaries: vi.fn(async () => []) },
    relay: {
      list: vi.fn(async () => []),
      listHops: vi.fn(async () => []),
      listRuns: vi.fn(async () => ({
        runs: [],
        unattributedHails: [],
        outcomes: {},
        hasMore: false,
      })),
      onUpdated: vi.fn(() => () => {}),
      onHopAppended: vi.fn(() => () => {}),
      onHopSettled: vi.fn(() => () => {}),
      onHopsCleared: vi.fn(() => () => {}),
    },
    crewHail: {
      listOpen: vi.fn(async () => []),
      acknowledge: vi.fn(),
      acknowledgeCrew: vi.fn(),
      onUpdated: vi.fn(() => () => {}),
    },
    providerAccounts: { list: vi.fn(async () => []) },
  }
}

const waveLandmarks = () =>
  document.querySelectorAll('aside[aria-label="Waves"]')

/** Loom in its column: the shell's own slot beside the conversation. */
const loomLandmarks = () => document.querySelectorAll('[aria-label="Loom"]')

const mainPanel = () =>
  document.querySelector('.app-main-panel') as HTMLElement | null

async function renderShell(props: Record<string, unknown> = {}) {
  await act(async () => {
    // The shell's own container provides this; the test provides it here so
    // the tree under test is the real layout and nothing else.
    render(
      <TooltipProvider>
        <AppShell {...shellProps()} {...props} />
      </TooltipProvider>,
    )
  })
  // The crew list and the first ledger read both resolve on microtasks.
  await act(async () => {
    await Promise.resolve()
  })
}

describe('MAR-3148 R4: the wave column’s wiring in the shell', () => {
  beforeEach(() => {
    // Stated, not inherited (lap 2, E): jsdom's default width sits a few
    // pixels above the column's floor, so these cases would have turned on
    // the environment rather than on the wiring under test.
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1600,
    })
    localStorage.clear()
    useSessionStore.setState({ globalSessions: [] })
    useSessionCrewStore.setState({ crews: [] })
    useWorkLedgerStore.setState({
      snapshots: {},
      broadcastCount: {},
      error: null,
      unsubscribeBroadcast: null,
    })
  })

  afterEach(() => {
    cleanup()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('no crew reads a tracker: no column at all', async () => {
    stubBridge([crew({ trackerBinding: null })])

    await renderShell()

    expect(loomLandmarks()).toHaveLength(0)
    expect(screen.queryByLabelText('Loom strip')).toBeNull()
  })

  it('a bound crew: exactly one column beside the conversation', async () => {
    stubBridge([crew()])

    await renderShell()

    expect(loomLandmarks()).toHaveLength(1)
    // Beside it, not inside it: compact Loom is a sibling of the content
    // area. Mutation: mount the panel inside `app-main-panel` -> red.
    expect(mainPanel()?.contains(loomLandmarks()[0] ?? null)).toBe(false)
  })

  it('MAR-3189 R5: expanded fills the content area, and folding puts it back', async () => {
    stubBridge([crew()])
    const onSelectAnySession = vi.fn()

    await renderShell({ onSelectAnySession })

    const sidebarBefore = document.querySelector('.app-sidebar-panel')
    const mainBefore = mainPanel()?.innerHTML ?? ''
    expect(mainBefore.length).toBeGreaterThan(0)

    await act(async () => {
      screen.getByRole('button', { name: 'Expand Loom' }).click()
    })

    // The stack is a DESCENDANT of the content area, not a wide rail beside
    // it. Mutation: render expanded in the rail slot at 100% width -> red.
    const stack = document.querySelector('[data-loom="expanded"]')
    expect(stack).toBeTruthy()
    expect(mainPanel()?.contains(stack as Node)).toBe(true)
    // Nothing in the rail slot, and nothing else moved: the sidebar is the
    // same element and no session was selected on the way.
    expect(document.querySelector('[data-loom="compact"]')).toBeNull()
    expect(document.querySelector('.app-sidebar-panel')).toBe(sidebarBefore)
    expect(onSelectAnySession).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByRole('button', { name: 'Fold Loom' }).click()
    })

    expect(document.querySelector('[data-loom="expanded"]')).toBeNull()
    expect(loomLandmarks()).toHaveLength(1)
    // Mutation: unmount the main panel's content instead of not rendering it
    // -> what comes back is a different tree, red.
    expect(mainPanel()?.innerHTML).toBe(mainBefore)
  })

  it('Mission Control on its Waves tab: one landmark, and it is the tab’s', async () => {
    stubBridge([crew()])
    // The room remembers the tab it was left on, so the shell mounts with
    // Mission Control already showing Waves.
    localStorage.setItem(
      'convergence-mission-control-view',
      JSON.stringify({ mode: 'waves' }),
    )

    await renderShell({ missionControlActive: true })

    // Mutation: drop `hidden={isWaveColumnHidden(...)}` at the mount ->
    // the column and the tab both render, two landmarks, red.
    expect(waveLandmarks()).toHaveLength(1)
    expect(waveLandmarks()[0]?.getAttribute('data-wave-panel')).toBe('full')
  })
})
