import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useSessionCrewStore, type SessionCrew } from '@/entities/session-crew'
import {
  useWorkLedgerStore,
  type TrackerHealth,
  type WorkLedgerEntry,
  type WorkLedgerSnapshot,
} from '@/entities/work-ledger'
import { WavePanel, WavesTab } from './wave-panel.container'
import { WavePanelView } from './wave-panel.presentational'
import { WaveRailView } from './wave-rail.presentational'
import {
  sectionWaveRows,
  waveHeader,
  type WaveHeaderCrew,
} from './wave-sections.pure'
import { ledgerEntry } from './wave-rows.fixture'

/**
 * The wave panel, rendered (MAR-3097; the MAR-2280 law): what a person reads
 * is asserted on the screen.
 */

const NOW = Date.parse('2026-09-17T12:10:00.000Z')
const AT = '2026-09-17T12:00:00.000Z'

const health = (state: TrackerHealth['state']): TrackerHealth => ({
  state,
  since: AT,
  lastOkAt: AT,
  backoffUntil: null,
})

/** One bound crew that has answered: the honest default (lap 2, A). */
const ANSWERED: WaveHeaderCrew[] = [{ name: 'Loom', health: health('ok') }]

function boundCrew(id: string, name: string): SessionCrew {
  return {
    id,
    name,
    emoji: null,
    accentColor: null,
    position: 0,
    roundCap: null,
    stallMinutes: null,
    createdAt: AT,
    updatedAt: AT,
    sessionIds: ['session-opus'],
    members: [],
    trackerBinding: {
      kind: 'linear',
      projectId: `project-${id}`,
      labelPrefix: 'horse:',
      wavePrefix: 'wave:',
      statusMap: {},
    },
  }
}

const SESSION = {
  id: 'session-opus',
  name: 'opus',
  status: 'idle',
  attention: 'none',
  updatedAt: AT,
} as SessionSummary

const rowOf = (key: string) =>
  within(document.querySelector(`[data-wave-row="${key}"]`) as HTMLElement)

function renderView(
  rows: WorkLedgerEntry[],
  crews: WaveHeaderCrew[] = ANSWERED,
  layout: 'column' | 'full' = 'column',
) {
  return render(
    <WavePanelView
      layout={layout}
      sections={sectionWaveRows(rows, NOW)}
      header={waveHeader({ crews, rowCount: rows.length, now: NOW })}
      inertReason={() => null}
      onOpen={vi.fn()}
    />,
  )
}

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
  localStorage.clear()
  setWindowWidth(1024)
})

describe('MAR-3097 R2 + lap 2, F1: a row shows the ledger’s facts', () => {
  it('one row per action, the host marker beside the action, never on unstarted work', () => {
    const down = {
      executionHost: 'lm',
      lastEventAt: '2026-09-17T12:06:00.000Z',
      hostReachable: false,
    }
    renderView([
      ledgerEntry({
        issueIdentifier: 'EX-1',
        state: 'reviewed',
        pr: {
          number: 678,
          url: 'https://github.com/example/repo/pull/678',
          state: 'open',
          headBranch: 'agent/ex-1',
          checkedAt: AT,
          source: 'gh',
        },
      }),
      ledgerEntry({
        issueIdentifier: 'EX-2',
        state: 'returned',
        hostLiveness: down,
      }),
      ledgerEntry({
        issueIdentifier: 'EX-3',
        state: 'working',
        sessionId: null,
      }),
      ledgerEntry({
        issueIdentifier: 'EX-4',
        state: 'working',
        hostLiveness: down,
      }),
      ledgerEntry({
        issueIdentifier: 'EX-5',
        state: 'assigned',
        hostLiveness: down,
      }),
    ])

    expect(rowOf('crew-1:EX-1').getByText('QA and say done')).toBeTruthy()
    expect(rowOf('crew-1:EX-1').getByText('Work EX-1')).toBeTruthy()
    expect(
      rowOf('crew-1:EX-1').getByText('opus · reviewed · PR #678 open'),
    ).toBeTruthy()
    // Mutation: "QA and say done" for returned -> red here.
    expect(rowOf('crew-1:EX-2').getByText('verdict (Fable)')).toBeTruthy()
    expect(rowOf('crew-1:EX-2').queryByText('QA and say done')).toBeNull()
    expect(
      rowOf('crew-1:EX-2').getByText('host unreachable since 4m'),
    ).toBeTruthy()
    expect(rowOf('crew-1:EX-3').getByText('seat not in crew')).toBeTruthy()
    expect(
      rowOf('crew-1:EX-4').getByText('host unreachable since 4m'),
    ).toBeTruthy()
    expect(rowOf('crew-1:EX-5').queryByText(/host unreachable/)).toBeNull()
  })
})

describe('MAR-3097 R3 + lap 2, A: the header never says a zero it did not read', () => {
  it('unreachable: the header reads the age and the last rows stay', () => {
    renderView(
      [ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })],
      [{ name: 'Loom', health: health('unreachable') }],
    )
    expect(screen.getByRole('status').textContent).toBe(
      'tracker unreachable · 10m',
    )
    expect(
      document.querySelector('[data-wave-row="crew-1:EX-1"]'),
    ).not.toBeNull()
    // Mutation: render "0 in wave" on unreachable -> red.
    expect(document.body.textContent).not.toMatch(/\b0 in wave\b/)
  })

  it('A: a bound crew not yet heard from reads "reading the tracker…", never "Quiet project"', () => {
    renderView([], [{ name: 'Loom', health: null }])
    // Mutation: drop the null branch -> "Quiet project", red.
    expect(screen.getByRole('status').textContent).toBe('reading the tracker…')
    expect(screen.queryByText('Quiet project')).toBeNull()
  })

  it('A: a tracker that answered with zero rows -> Quiet project', () => {
    renderView([])
    expect(screen.getByText('Quiet project')).toBeTruthy()
  })

  it('the tab with no binding says where to connect one', () => {
    renderView([], [], 'full')
    expect(screen.getByText('No crew reads a tracker yet.')).toBeTruthy()
    expect(
      screen.getByText('Connect a tracker in a crew’s settings on the Canvas.'),
    ).toBeTruthy()
  })
})

describe('MAR-3097 lap 2, F2: wave groups are disclosures', () => {
  it('closed in the column, open in the full tab', () => {
    const rows = [ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })]
    renderView(rows)
    const column = document.querySelector('details[data-wave-group]')
    // Mutation: open by default in the column -> red.
    expect(column?.hasAttribute('open')).toBe(false)
    expect(column?.querySelector('summary')?.textContent).toBe(
      'Wave loom-p2 · 1',
    )
    cleanup()
    renderView(rows, ANSWERED, 'full')
    expect(
      document.querySelector('details[data-wave-group]')?.hasAttribute('open'),
    ).toBe(true)
  })
})

describe('MAR-3097 R4: the rail is the same model', () => {
  it('shows four counts equal to the section lengths, and the outage dot', () => {
    const rows = [
      ledgerEntry({ issueIdentifier: 'EX-1', state: 'reviewed' }),
      ledgerEntry({ issueIdentifier: 'EX-2', state: 'working' }),
      ledgerEntry({ issueIdentifier: 'EX-3', state: 'returned' }),
      ledgerEntry({ issueIdentifier: 'EX-4', state: 'assigned', wave: null }),
    ]
    const sections = sectionWaveRows(rows, NOW)
    render(<WaveRailView sections={sections} outage onExpand={vi.fn()} />)
    const count = (key: string) =>
      document.querySelector(`[data-wave-count="${key}"]`)?.textContent
    expect([
      count('waitingOnYou'),
      count('inTheWave'),
      count('waitingToStart'),
      count('waves'),
    ]).toEqual(
      [
        sections.waitingOnYou.length,
        sections.inTheWave.length,
        sections.waitingToStart.length,
        sections.waves.length,
      ].map(String),
    )
    expect(screen.getByLabelText('Tracker not answering')).toBeTruthy()
  })
})

describe('MAR-3097: through the containers and the real stores', () => {
  let snapshots: Record<string, WorkLedgerSnapshot>
  let crews: SessionCrew[]

  const rows = [
    ledgerEntry({ issueIdentifier: 'EX-1', state: 'reviewed' }),
    ledgerEntry({ issueIdentifier: 'EX-2', state: 'working' }),
    ledgerEntry({
      issueIdentifier: 'EX-3',
      state: 'assigned',
      sessionId: null,
    }),
    ledgerEntry({
      issueIdentifier: 'EX-4',
      state: 'working',
      sessionId: 'session-gone',
    }),
  ]

  beforeEach(() => {
    crews = [boundCrew('crew-1', 'Loom')]
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: rows,
        trackerHealth: health('ok'),
      },
    }
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      crew: {
        list: vi.fn(async () => crews),
        onUpdated: vi.fn(() => () => {}),
      },
      workLedger: {
        list: vi.fn(async (crewId: string) => snapshots[crewId]),
        onUpdated: vi.fn(() => () => {}),
      },
    }
    useSessionStore.setState({ globalSessions: [SESSION] })
    useWorkLedgerStore.setState({
      snapshots: {},
      broadcastCount: {},
      error: null,
      unsubscribeBroadcast: null,
    })
    useSessionCrewStore.setState({ crews: [] })
  })

  async function mount(ui: React.ReactElement) {
    await act(async () => {
      render(ui)
    })
  }

  it('B: no bound crew -> no column at all', async () => {
    crews = [{ ...boundCrew('crew-1', 'Loom'), trackerBinding: null }]
    await mount(<WavePanel />)
    // Mutation: mount the column unconditionally -> red.
    expect(screen.queryByLabelText('Waves')).toBeNull()
    expect(screen.queryByLabelText('Waves rail')).toBeNull()
  })

  it('B: a bound crew -> the column; hidden (the Waves tab showing) -> nothing', async () => {
    await mount(<WavePanel />)
    expect(await screen.findByLabelText('Waves')).toBeTruthy()
    cleanup()
    await mount(<WavePanel hidden />)
    expect(screen.queryByLabelText('Waves')).toBeNull()
  })

  it('B: too narrow -> the rail, and the stored mode is untouched', async () => {
    setWindowWidth(260 + 280 + 479)
    await mount(<WavePanel reservedWidth={260} />)
    // Mutation: ignore the width -> the open column, red.
    expect(await screen.findByLabelText('Waves rail')).toBeTruthy()
    expect(localStorage.getItem('convergence-wave-panel-mode')).toBeNull()
  })

  it('R5: clicking a row opens the seat’s conversation; rows that cannot, say why', async () => {
    const onOpenSession = vi.fn()
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    await mount(<WavePanel onOpenSession={onOpenSession} />)
    await screen.findByLabelText('Waves')
    const openable = document.querySelector(
      '[data-wave-row="crew-1:EX-2"]',
    ) as HTMLElement

    fireEvent.click(openable)

    // Mutation: open the issue URL instead -> never called with the session.
    expect(onOpenSession).toHaveBeenCalledTimes(1)
    expect(onOpenSession.mock.calls[0]![0].id).toBe('session-opus')
    expect(windowOpen).not.toHaveBeenCalled()
    expect(
      rowOf('crew-1:EX-3').getByText('no conversation for this seat'),
    ).toBeTruthy()
    expect(
      rowOf('crew-1:EX-4').getByText('conversation not loaded'),
    ).toBeTruthy()
    windowOpen.mockRestore()
  })

  it('R4: collapsing to the rail persists, and a remount reads it back', async () => {
    await mount(<WavePanel />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Collapse the wave panel' }),
    )
    expect(screen.getByLabelText('Waves rail')).toBeTruthy()
    cleanup()
    await mount(<WavePanel />)
    expect(await screen.findByLabelText('Waves rail')).toBeTruthy()
  })

  it('R6: the Waves tab shows the same row keys as the panel', async () => {
    const keys = () =>
      [...document.querySelectorAll('[data-wave-row]')]
        .map((node) => node.getAttribute('data-wave-row'))
        .sort()

    await mount(<WavesTab />)
    await screen.findByLabelText('Waves')
    const tab = keys()
    cleanup()

    await mount(<WavePanel />)
    await screen.findByLabelText('Waves')
    // The column's wave groups start closed but stay in the DOM.
    // Mutation: filter the tab by a different predicate -> red.
    expect(keys()).toEqual(tab)
    expect(tab.length).toBeGreaterThan(0)
  })

  it('E: two crews, one unreachable -> the header names it; every row names its crew', async () => {
    crews = [boundCrew('crew-1', 'Loom'), boundCrew('crew-2', 'Night shift')]
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [ledgerEntry({ issueIdentifier: 'EX-1', crewId: 'crew-1' })],
        trackerHealth: health('ok'),
      },
      'crew-2': {
        crewId: 'crew-2',
        entries: [ledgerEntry({ issueIdentifier: 'EX-1', crewId: 'crew-2' })],
        trackerHealth: {
          ...health('unreachable'),
          since: new Date(Date.now() - 10 * 60_000).toISOString(),
        },
      },
    }
    await mount(<WavesTab />)
    await screen.findByLabelText('Waves')

    // Mutation: the first non-ok health for all, unnamed -> red.
    expect(screen.getByRole('status').textContent).toBe(
      'tracker unreachable · Night shift · 10m',
    )
    expect(
      rowOf('crew-1:EX-1').getAllByText(/^Loom · opus · working/).length,
    ).toBeGreaterThan(0)
    expect(
      rowOf('crew-2:EX-1').getAllByText(/^Night shift · opus · working/).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('2 issues · 0 waiting on you')).toBeTruthy()
  })
})
