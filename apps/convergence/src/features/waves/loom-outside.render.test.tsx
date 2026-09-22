import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { render } from './loom-tooltip.fixture'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useSessionCrewStore, type SessionCrew } from '@/entities/session-crew'
import {
  useWorkLedgerStore,
  type WorkLedgerEntry,
  type WorkLedgerSnapshot,
} from '@/entities/work-ledger'
import type {
  TrackerOutsideIssue,
  TrackerOutsideSnapshot,
} from '@/shared/types/tracker.types'
import { WavePanel } from './wave-panel.container'
import { LoomOutside } from './loom-outside.container'
import { useLoomOutside } from './use-loom-outside'
import { ledgerEntry } from './wave-rows.fixture'

/**
 * "Not in the loop", rendered (MAR-3236; the MAR-2280 law): through the real
 * containers and stores, in both of Loom's shapes, asserted on the screen.
 */

const NOW = Date.parse('2026-09-19T12:00:00.000Z')
const AT = '2026-09-19T11:00:00.000Z'

function boundCrew(id: string, name: string): SessionCrew {
  return {
    id,
    name,
    emoji: null,
    accentColor: null,
    position: 0,
    roundCap: null,
    stallMinutes: null,
    lapCap: null,
    createdAt: AT,
    updatedAt: AT,
    sessionIds: ['session-opus'],
    members: [],
    trackerBinding: {
      kind: 'linear',
      autoDispatch: false,
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

const outsideIssue = (
  identifier: string,
  updatedAt: string,
  labels: string[] = [],
): TrackerOutsideIssue => ({
  id: `id-${identifier}`,
  identifier,
  title: `Loose ${identifier}`,
  url: `https://linear.app/example/issue/${identifier.toLowerCase()}`,
  status: 'Backlog',
  priority: null,
  labels,
  updatedAt,
})

/** Three loose issues, deliberately NOT in the order they must be shown. */
const THREE: TrackerOutsideIssue[] = [
  outsideIssue('EX-71', '2026-09-17T09:00:00.000Z'),
  outsideIssue('EX-73', '2026-09-19T09:00:00.000Z', ['Bug']),
  outsideIssue('EX-72', '2026-09-18T09:00:00.000Z'),
]

const read = (
  crewId: string,
  issues: TrackerOutsideIssue[],
  more = false,
): TrackerOutsideSnapshot => ({
  crewId,
  issues,
  more,
  readAt: '2026-09-19T11:55:00.000Z',
})

/** One issue in preparation: Plan's title must count it and nothing else. */
const DEFINE: WorkLedgerEntry = ledgerEntry({
  issueIdentifier: 'EX-DEFINE',
  state: 'assigned',
  seat: null,
  sessionId: null,
  fact: {
    logicalStatus: null,
    branchName: null,
    updatedAt: null,
    groomMe: true,
  },
})

let crews: SessionCrew[]
let ledgers: Record<string, WorkLedgerSnapshot>
let outside: Record<string, TrackerOutsideSnapshot>
let pushOutside: (snapshot: TrackerOutsideSnapshot) => void
let outsideRead: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  crews = [boundCrew('crew-1', 'Loom')]
  ledgers = {
    'crew-1': {
      crewId: 'crew-1',
      entries: [DEFINE],
      dispatchPlan: null,
      trackerHealth: null,
    },
  }
  outside = { 'crew-1': read('crew-1', THREE) }
  pushOutside = () => {}
  outsideRead = vi.fn(async (crewId: string) => outside[crewId])
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    crew: {
      list: vi.fn(async () => crews),
      onUpdated: vi.fn(() => () => {}),
    },
    workLedger: {
      list: vi.fn(async (crewId: string) => ledgers[crewId]),
      onUpdated: vi.fn(() => () => {}),
    },
    tracker: {
      outside: outsideRead,
      onOutsideUpdated: vi.fn(
        (callback: (snapshot: TrackerOutsideSnapshot) => void) => {
          pushOutside = callback
          return () => {}
        },
      ),
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

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
  localStorage.clear()
})

async function openPlan() {
  await act(async () => {
    render(<WavePanel reservedWidth={260} />)
  })
  await screen.findByLabelText('Loom')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Plan · / }))
  })
}

const planBody = () =>
  document.querySelector('[data-loom-sheet="plan"]') as HTMLElement
const group = () =>
  document.querySelector('[data-loom-outside]') as HTMLElement | null
const fold = () => screen.getByRole('button', { name: /^Not in the loop · / })
const shownRows = () =>
  [...document.querySelectorAll('[data-loom-outside-row]')].map((node) =>
    node.getAttribute('data-loom-outside-row'),
  )

describe('MAR-3236 R6: the group is last in Plan, folded, honest', () => {
  /** What the open sheet says, read the same way in both shapes. */
  async function readShape() {
    const body = planBody()
    const closed = {
      planTitle: screen.getByRole('button', { name: /^Plan · / }).textContent,
      fold: fold().textContent,
      expanded: fold().getAttribute('aria-expanded'),
      // Folded means ABSENT: no row text anywhere in the sheet.
      rowsWhileClosed: ['EX-71', 'EX-72', 'EX-73'].filter((id) =>
        body.textContent?.includes(`Loose ${id}`),
      ),
      last: body.lastElementChild === group(),
    }
    await act(async () => {
      fireEvent.click(fold())
    })
    const anchors = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        '[data-loom-outside-row]',
      ),
    ]
    return {
      ...closed,
      open: {
        expanded: fold().getAttribute('aria-expanded'),
        rows: shownRows(),
        links: anchors.map((a) => [
          a.getAttribute('href'),
          a.getAttribute('target'),
          a.getAttribute('rel'),
          a.tagName,
        ]),
        firstRow: anchors[0]?.textContent,
        // A row is a link and nothing else: no button inside the group
        // but its own fold.
        buttons: group()!.querySelectorAll('button').length,
        planTitle: screen.getByRole('button', { name: /^Plan · / }).textContent,
      },
    }
  }

  it('compact and expanded: closed on mount, newest first when open, never counted', async () => {
    await openPlan()
    const compact = await readShape()
    // Mutation: render the rows whatever `open` says -> the titles are in
    // the closed sheet's text, red.
    expect(compact.rowsWhileClosed).toEqual([])
    expect(compact.fold).toBe('Not in the loop · 3')
    expect(compact.expanded).toBe('false')
    expect(compact.last).toBe(true)
    // Mutation: drop the sort -> EX-71, EX-73, EX-72, red.
    expect(compact.open.rows).toEqual(['EX-73', 'EX-72', 'EX-71'])
    expect(compact.open.expanded).toBe('true')
    expect(compact.open.links[0]).toEqual([
      'https://linear.app/example/issue/ex-73',
      '_blank',
      'noreferrer',
      'A',
    ])
    expect(compact.open.firstRow).toBe('EX-73Loose EX-73Linear: BacklogBug')
    expect(compact.open.buttons).toBe(1)
    // Mutation: count the outside issues into Plan's title -> `Plan · 4 in
    // preparation`, red.
    expect(compact.planTitle).toBe('Plan · 1 in preparation')
    expect(compact.open.planTitle).toBe('Plan · 1 in preparation')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
    const expanded = await readShape()
    // The same words in the other shape -- including closed again on mount.
    expect(expanded).toEqual(compact)
  })

  it('a cut read says `+` and ends with the line that says there is more', async () => {
    outside = { 'crew-1': read('crew-1', THREE, true) }
    await openPlan()
    expect(fold().textContent).toBe('Not in the loop · 3+')
    await act(async () => {
      fireEvent.click(fold())
    })
    const lines = [...group()!.querySelectorAll('p')].map((p) => p.textContent)
    expect(lines.at(-1)).toBe(
      "More in Linear — showing 300 of this project's open issues",
    )
  })

  it('never read, then an empty read: its own words each time, and nothing to open', async () => {
    outside = {
      'crew-1': { crewId: 'crew-1', issues: [], more: false, readAt: null },
    }
    await openPlan()
    expect(group()!.textContent).toBe('Not in the loop · not read yet')
    expect(group()!.querySelector('button')).toBeNull()

    // The watcher's read lands: pushed, and only this crew's counts.
    await act(async () => {
      pushOutside(read('crew-2', THREE))
    })
    expect(group()!.textContent).toBe('Not in the loop · not read yet')
    await act(async () => {
      pushOutside(read('crew-1', []))
    })
    expect(group()!.textContent).toBe(
      'Not in the loop · 0Every open issue in this project carries a Loom label.',
    )
    expect(group()!.querySelector('button')).toBeNull()
    expect(screen.getByRole('button', { name: /^Plan · / }).textContent).toBe(
      'Plan · 1 in preparation',
    )
  })

  it('a preload without the doors is "not read yet", never a crash', async () => {
    delete (window as unknown as { electronAPI: Record<string, unknown> })
      .electronAPI.tracker
    await openPlan()
    expect(group()!.textContent).toBe('Not in the loop · not read yet')
  })
})

/**
 * The group as the panel mounts it since MAR-3234: the crew's snapshot read
 * once above it and handed down, rather than read by the group itself.
 */
function OutsideFor({ crewId }: { crewId: string }) {
  return <LoomOutside snapshot={useLoomOutside(crewId)} query={null} />
}

describe('MAR-3236 R7: it follows the crew', () => {
  it('a switch reads the new crew’s snapshot and never shows the old one under it', async () => {
    outside = {
      'crew-1': read('crew-1', THREE),
      'crew-2': read('crew-2', [outsideIssue('EX-99', AT)]),
    }
    let view: ReturnType<typeof render> | null = null
    await act(async () => {
      view = render(<OutsideFor crewId="crew-1" />)
    })
    expect(fold().textContent).toBe('Not in the loop · 3')
    // Another crew's read is pushed to every window: it is not this one's.
    // Mutation: take every push -> crew-1's list vanishes, red.
    await act(async () => {
      pushOutside(read('crew-2', []))
    })
    expect(fold().textContent).toBe('Not in the loop · 3')

    // Hold crew-2's answer, so the moment between the switch and the read
    // is on screen.
    let answer: (snapshot: TrackerOutsideSnapshot) => void = () => {}
    outsideRead.mockImplementationOnce(
      () =>
        new Promise<TrackerOutsideSnapshot>((resolve) => {
          answer = resolve
        }),
    )
    await act(async () => {
      view!.rerender(<OutsideFor crewId="crew-2" />)
    })
    // Mutation: keep the last crew's snapshot until the new one lands ->
    // `· 3` under crew-2, red.
    expect(group()!.textContent).toBe('Not in the loop · not read yet')
    await act(async () => {
      answer(outside['crew-2']!)
    })
    expect(outsideRead).toHaveBeenLastCalledWith('crew-2')
    expect(fold().textContent).toBe('Not in the loop · 1')
  })
})
