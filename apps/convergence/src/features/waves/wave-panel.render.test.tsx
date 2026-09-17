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
} from '@/entities/work-ledger'
import { WavePanel, WavesTab } from './wave-panel.container'
import { WavePanelView } from './wave-panel.presentational'
import { WaveRailView } from './wave-rail.presentational'
import { sectionWaveRows, waveHeader } from './wave-sections.pure'
import { ledgerEntry } from './wave-rows.fixture'

/**
 * The wave panel, rendered (MAR-3097; the MAR-2280 law): what a person reads
 * is asserted on the screen.
 */

const NOW = Date.parse('2026-09-17T12:10:00.000Z')
const AT = '2026-09-17T12:00:00.000Z'

const BOUND_CREW = {
  id: 'crew-1',
  name: 'Loom',
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
    projectId: 'project-1',
    labelPrefix: 'horse:',
    wavePrefix: 'wave:',
    statusMap: {},
  },
} satisfies SessionCrew

const SESSION = {
  id: 'session-opus',
  name: 'opus',
  status: 'idle',
  attention: 'none',
  updatedAt: AT,
} as SessionSummary

function renderView(
  rows: WorkLedgerEntry[],
  header = waveHeader({
    boundCrewCount: 1,
    healths: [null],
    rowCount: rows.length,
    now: NOW,
  }),
) {
  return render(
    <WavePanelView
      layout="column"
      sections={sectionWaveRows(rows, NOW)}
      header={header}
      inertReason={() => null}
      onOpen={vi.fn()}
    />,
  )
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
  localStorage.clear()
})

describe('MAR-3097 R2: a row shows the ledger’s facts and the human action', () => {
  it('one row per action, with identifier, title, seat, state and PR', () => {
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
      ledgerEntry({ issueIdentifier: 'EX-2', state: 'returned' }),
      ledgerEntry({
        issueIdentifier: 'EX-3',
        state: 'working',
        sessionId: null,
      }),
      ledgerEntry({
        issueIdentifier: 'EX-4',
        state: 'working',
        hostLiveness: {
          executionHost: 'lm',
          lastEventAt: '2026-09-17T12:06:00.000Z',
          hostReachable: false,
        },
      }),
    ])

    const row = (identifier: string) =>
      within(
        document.querySelector(
          `[data-wave-row="${identifier}"]`,
        ) as HTMLElement,
      )
    expect(row('EX-1').getByText('QA and say done')).toBeTruthy()
    expect(row('EX-1').getByText('Work EX-1')).toBeTruthy()
    expect(row('EX-1').getByText('opus · reviewed · PR #678 open')).toBeTruthy()
    // Mutation: "QA and say done" for returned -> red here.
    expect(row('EX-2').getByText('verdict (Fable)')).toBeTruthy()
    expect(row('EX-2').queryByText('QA and say done')).toBeNull()
    expect(row('EX-3').getByText('seat not in crew')).toBeTruthy()
    expect(row('EX-4').getByText('host unreachable since 4m')).toBeTruthy()
  })
})

describe('MAR-3097 R3: an outage is an age, never a zero', () => {
  const unreachable: TrackerHealth = {
    state: 'unreachable',
    since: AT,
    lastOkAt: AT,
    backoffUntil: null,
  }

  it('unreachable: the header reads the age and the last rows stay', () => {
    const rows = [ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })]
    renderView(
      rows,
      waveHeader({
        boundCrewCount: 1,
        healths: [unreachable],
        rowCount: rows.length,
        now: NOW,
      }),
    )
    expect(screen.getByRole('status').textContent).toBe(
      'tracker unreachable · 10m',
    )
    expect(document.querySelector('[data-wave-row="EX-1"]')).not.toBeNull()
    // Mutation: render "0 in wave" on unreachable -> red.
    expect(document.body.textContent).not.toMatch(/\b0 in wave\b/)
  })

  it('unreachable with nothing read yet shows the age, not zero or quiet', () => {
    renderView(
      [],
      waveHeader({
        boundCrewCount: 1,
        healths: [unreachable],
        rowCount: 0,
        now: NOW,
      }),
    )
    expect(screen.getByRole('status').textContent).toBe(
      'tracker unreachable · 10m',
    )
    expect(screen.queryByText('Quiet project')).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b0\b/)
  })

  it('no binding -> Connect a tracker, which leads to where crews are bound', () => {
    const onConnectTracker = vi.fn()
    render(
      <WavePanelView
        layout="column"
        sections={sectionWaveRows([], NOW)}
        header={waveHeader({
          boundCrewCount: 0,
          healths: [],
          rowCount: 0,
          now: NOW,
        })}
        inertReason={() => null}
        onOpen={vi.fn()}
        onConnectTracker={onConnectTracker}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Connect a tracker' }))
    expect(onConnectTracker).toHaveBeenCalledTimes(1)
  })

  it('a binding with zero rows -> Quiet project', () => {
    renderView([])
    expect(screen.getByText('Quiet project')).toBeTruthy()
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

describe('MAR-3097 R5/R6: through the containers and the real stores', () => {
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
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      crew: {
        list: vi.fn(async () => [BOUND_CREW]),
        onUpdated: vi.fn(() => () => {}),
      },
      workLedger: {
        list: vi.fn(async (crewId: string) => ({
          crewId,
          entries: rows,
          trackerHealth: null,
        })),
        onUpdated: vi.fn(() => () => {}),
      },
    }
    useSessionStore.setState({ globalSessions: [SESSION] })
    useWorkLedgerStore.setState({
      snapshots: {},
      error: null,
      unsubscribeBroadcast: null,
    })
    useSessionCrewStore.setState({ crews: [] })
  })

  it('R5: clicking a row opens the seat’s conversation; rows that cannot, say why', async () => {
    const onOpenSession = vi.fn()
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    await act(async () => {
      render(<WavePanel onOpenSession={onOpenSession} />)
    })
    const openable = (
      await screen.findAllByRole('button', { name: /EX-2/ })
    )[0]!

    fireEvent.click(openable)

    // Mutation: open the issue URL instead -> never called with the session.
    expect(onOpenSession).toHaveBeenCalledTimes(1)
    expect(onOpenSession.mock.calls[0]![0].id).toBe('session-opus')
    expect(windowOpen).not.toHaveBeenCalled()
    expect(
      document
        .querySelector('[data-wave-row="EX-3"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      screen.getAllByText('no conversation for this seat').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText('conversation not loaded').length,
    ).toBeGreaterThan(0)
    windowOpen.mockRestore()
  })

  it('R4: collapsing to the rail persists, and a remount reads it back', async () => {
    await act(async () => {
      render(<WavePanel />)
    })
    await screen.findAllByRole('button', { name: /EX-2/ })
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse the wave panel' }),
    )
    expect(screen.getByLabelText('Waves rail')).toBeTruthy()
    cleanup()
    await act(async () => {
      render(<WavePanel />)
    })
    expect(screen.getByLabelText('Waves rail')).toBeTruthy()
  })

  it('R6: the Waves tab shows the same identifiers as the panel', async () => {
    const identifiers = () =>
      [...document.querySelectorAll('[data-wave-row]')]
        .map((node) => node.getAttribute('data-wave-row'))
        .sort()

    await act(async () => {
      render(<WavePanel />)
    })
    await screen.findAllByRole('button', { name: /EX-2/ })
    const panel = identifiers()
    cleanup()

    await act(async () => {
      render(<WavesTab />)
    })
    await screen.findAllByRole('button', { name: /EX-2/ })
    // Mutation: filter the tab by a different predicate -> red.
    expect(identifiers()).toEqual(panel)
    expect(panel.length).toBeGreaterThan(0)
  })
})
