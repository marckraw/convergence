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

    expect(waveLandmarks()).toHaveLength(0)
    expect(screen.queryByLabelText('Waves rail')).toBeNull()
  })

  it('a bound crew: exactly one column beside the conversation', async () => {
    stubBridge([crew()])

    await renderShell()

    expect(waveLandmarks()).toHaveLength(1)
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
