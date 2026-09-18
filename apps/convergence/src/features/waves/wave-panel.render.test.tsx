import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest'
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
import {
  WavePanelView,
  type WavePanelViewProps,
} from './wave-panel.presentational'
import {
  WaveRailView,
  WAVE_RAIL_NARROW_TITLE,
} from './wave-rail.presentational'
import {
  sectionWaveRows,
  waveHeader,
  WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
  WAVE_PANEL_MAX_COLUMN_WIDTH,
  WAVE_PANEL_MIN_COLUMN_WIDTH,
  WAVE_PANEL_MIN_MAIN_WIDTH,
  WAVE_PANEL_WIDTH_STEP,
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

/**
 * A window whose room for the column is one pixel under its floor: the
 * narrowest thing the panel can show is the rail (MAR-3155 R1). Derived from
 * the constants so it cannot drift away from them the way `260 + 280 + 479`
 * did when the floor moved.
 */
const RESERVED = 260
const TOO_NARROW_FOR_A_COLUMN =
  RESERVED + WAVE_PANEL_MIN_MAIN_WIDTH + WAVE_PANEL_MIN_COLUMN_WIDTH - 1

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
      rowOf('crew-1:EX-1').getByText('opus · reviewed · lap 1 · PR #678 open'),
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

describe('MAR-3155 R5: the identifier never breaks; the title gets the rest', () => {
  it('the id is one unbreakable token and the whole title is one hover away', () => {
    const title =
      'Loom: carry the blocked label through the tracker adapter and the work ledger'
    renderView([
      ledgerEntry({
        issueIdentifier: 'MAR-3085',
        state: 'working',
        issueTitle: title,
      }),
    ])

    const row = rowOf('crew-1:MAR-3085')
    const id = row.getByText('MAR-3085')
    // At the old fixed width this wrapped after the dash. jsdom has no layout
    // engine, so what is asserted here is the RULE the browser lays out by;
    // the wrap itself is Marcin's QA step 1.
    // Mutation: drop `whitespace-nowrap` (or let the id shrink) -> red.
    expect(id.className).toContain('whitespace-nowrap')
    expect(id.className).toContain('shrink-0')

    const titleEl = row.getByText(title)
    // Two lines at most, and never cut without a way to read the rest.
    // Mutation: drop the `title` attribute -> red.
    expect(titleEl.getAttribute('title')).toBe(title)
    expect(titleEl.className).toContain('line-clamp-2')
    // `min-w-0`: without it a flex child refuses to be narrower than its text
    // and the id gets pushed off instead.
    expect(titleEl.className).toContain('min-w-0')
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
    // One pixel short of the narrowest readable column (MAR-3155 R1): the
    // column shrinks before it becomes the rail, so the window that forces
    // the rail is now measured against the column's FLOOR, not its default.
    setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
    await mount(<WavePanel reservedWidth={260} />)
    // Mutation: ignore the width -> the open column, red.
    expect(await screen.findByLabelText('Waves rail')).toBeTruthy()
    expect(localStorage.getItem('convergence-wave-panel-mode')).toBeNull()
    // MAR-3148 R1, through the container: the rail the WIDTH forced cannot be
    // opened, and says so. Mutation: pass `narrow` from anything but the
    // decision's reason -> red.
    const open = screen.getByRole('button', { name: /too narrow/i })
    expect(open.getAttribute('aria-disabled')).toBe('true')
    expect(open.getAttribute('title')).toBe(WAVE_RAIL_NARROW_TITLE)
  })

  it('B: a rail the person chose still opens', async () => {
    localStorage.setItem('convergence-wave-panel-mode', 'rail')
    await mount(<WavePanel />)
    await screen.findByLabelText('Waves rail')
    const open = screen.getByRole('button', { name: 'Open the wave panel' })
    expect(open.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(open)
    expect(screen.getByLabelText('Waves')).toBeTruthy()
  })

  it('B: a stored rail in a window too narrow for the column cannot open either', async () => {
    localStorage.setItem('convergence-wave-panel-mode', 'rail')
    setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
    await mount(<WavePanel reservedWidth={260} />)
    await screen.findByLabelText('Waves rail')

    // Mutation: answer the stored reason first -> the click below opens
    // nothing and rewrites the preference to `open`, red.
    const open = screen.getByRole('button', { name: /too narrow/i })
    fireEvent.click(open)
    expect(screen.getByLabelText('Waves rail')).toBeTruthy()
    expect(screen.queryByLabelText('Waves')).toBeNull()
    expect(localStorage.getItem('convergence-wave-panel-mode')).toBe('rail')
  })

  /** The `aside`'s inline width, as the browser would lay it out. */
  const columnWidth = () =>
    (screen.getByLabelText('Waves') as HTMLElement).style.width

  const storedWidth = () => localStorage.getItem('convergence-wave-panel-width')

  const windowLeaving = (available: number) =>
    RESERVED + WAVE_PANEL_MIN_MAIN_WIDTH + available

  it('MAR-3155 R2: a narrow window cuts the column without rewriting the preference', async () => {
    localStorage.setItem('convergence-wave-panel-width', '600')
    setWindowWidth(windowLeaving(400))
    await mount(<WavePanel reservedWidth={RESERVED} />)

    // What fits is on screen; what was chosen is still what is stored.
    // Mutation: save the effective width on render -> the widened case below
    // reads 400px, red.
    expect(columnWidth()).toBe('400px')
    expect(storedWidth()).toBe('600')

    // The window grows back, with nobody touching anything.
    await act(async () => {
      setWindowWidth(windowLeaving(900))
      window.dispatchEvent(new Event('resize'))
    })
    expect(columnWidth()).toBe('600px')
    expect(storedWidth()).toBe('600')
  })

  it('MAR-3155 R4: the handle drags, steps and resets, and stores each finished gesture', async () => {
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    expect(columnWidth()).toBe(`${WAVE_PANEL_DEFAULT_COLUMN_WIDTH}px`)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })
    expect(handle.getAttribute('aria-valuemin')).toBe(
      String(WAVE_PANEL_MIN_COLUMN_WIDTH),
    )
    expect(handle.getAttribute('aria-valuemax')).toBe(
      String(WAVE_PANEL_MAX_COLUMN_WIDTH),
    )
    expect(handle.getAttribute('aria-valuenow')).toBe(
      String(WAVE_PANEL_DEFAULT_COLUMN_WIDTH),
    )

    // A drag: the pointer is a PAGE coordinate, so the column's width is
    // `clientX` minus the sidebar beside it.
    // Mutation: drop `- reservedWidth` -> the width is off by the sidebar
    // (760 instead of 500), red.
    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 500 })
    })
    expect(columnWidth()).toBe('500px')
    // Nothing is stored until the gesture ends.
    expect(storedWidth()).toBeNull()
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    expect(columnWidth()).toBe('500px')
    expect(storedWidth()).toBe('500')
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')

    // A step from the keyboard.
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowRight' })
    })
    expect(columnWidth()).toBe(`${500 + WAVE_PANEL_WIDTH_STEP}px`)
    expect(storedWidth()).toBe(String(500 + WAVE_PANEL_WIDTH_STEP))
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    })
    expect(storedWidth()).toBe('500')
    // A key the handle has no use for changes nothing.
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'a' })
    })
    expect(storedWidth()).toBe('500')

    // Double-click: back to the default, and stored.
    await act(async () => {
      fireEvent.doubleClick(handle)
    })
    expect(columnWidth()).toBe(`${WAVE_PANEL_DEFAULT_COLUMN_WIDTH}px`)
    expect(storedWidth()).toBe(String(WAVE_PANEL_DEFAULT_COLUMN_WIDTH))
  })

  it('MAR-3155 R4: a drag past the bounds stops at them, and stores what is on screen', async () => {
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })

    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 5_000 })
    })
    expect(columnWidth()).toBe(`${WAVE_PANEL_MAX_COLUMN_WIDTH}px`)
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    // Mutation: commit the raw pointer instead of what is on screen -> 5000
    // lands in storage and comes back as a ceiling-wide column forever, red.
    expect(storedWidth()).toBe(String(WAVE_PANEL_MAX_COLUMN_WIDTH))

    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 10 })
      fireEvent.mouseUp(window)
    })
    expect(columnWidth()).toBe(`${WAVE_PANEL_MIN_COLUMN_WIDTH}px`)
    expect(storedWidth()).toBe(String(WAVE_PANEL_MIN_COLUMN_WIDTH))
  })

  it('MAR-3155 R4: in a narrow window a drag stores what the window can show', async () => {
    // The input where the two clamps disagree. What is written down is
    // bounded by the ROOM, not only by the ceiling: a pointer dragged past
    // the edge of a small window must not leave a 640px preference behind a
    // 400px column.
    // Mutation: commit the raw pointer and let the caller's [MIN, MAX] clamp
    // catch it -> 640 is stored while 400 is on screen, red.
    setWindowWidth(windowLeaving(400))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })

    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 900 })
    })
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    expect(columnWidth()).toBe('400px')
    expect(storedWidth()).toBe('400')
  })

  it('MAR-3155 R4: the rail has no handle, and an unmount mid-drag gives the cursor back', async () => {
    setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Waves rail')
    // Mutation: render the handle whatever the mode -> red (a separator with
    // no column to resize).
    expect(screen.queryByRole('separator')).toBeNull()

    cleanup()
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    fireEvent.mouseDown(
      screen.getByRole('separator', { name: 'Resize the wave column' }),
    )
    expect(document.body.style.cursor).toBe('col-resize')
    // A gesture that actually MOVED (lap 2, D): without this the case could
    // not tell "an unmount stores nothing" from "a press that never moved
    // stores nothing", which is a different rule.
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 500 })
    })
    expect(columnWidth()).toBe('500px')
    // Mutation: drop the unmount cleanup -> the whole app keeps a resize
    // cursor and unselectable text after the column goes away, red.
    cleanup()
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    // Mutation: commit on release rather than on a finished mouse-up -> the
    // interrupted drag leaves 500 behind, red.
    expect(storedWidth()).toBeNull()
  })

  it('MAR-3155 lap 2, A: a step the window refuses stores nothing', async () => {
    localStorage.setItem('convergence-wave-panel-width', '600')
    setWindowWidth(windowLeaving(400))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })
    expect(columnWidth()).toBe('400px')

    // They pressed WIDER. The window has nothing more to give, so nothing
    // moves -- and nothing may be written down: storing 400 here is how a
    // 600px preference is lost for good.
    // Mutation: commit the clamped step unconditionally -> stored reads 400,
    // red.
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowRight' })
    })
    expect(columnWidth()).toBe('400px')
    expect(storedWidth()).toBe('600')

    // Narrower still works: that gesture does move something.
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    })
    expect(columnWidth()).toBe(`${400 - WAVE_PANEL_WIDTH_STEP}px`)
    expect(storedWidth()).toBe(String(400 - WAVE_PANEL_WIDTH_STEP))
  })

  it('MAR-3155 lap 2, A: a reset stores the default, not the window’s ceiling', async () => {
    setWindowWidth(windowLeaving(260))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })
    expect(columnWidth()).toBe('260px')

    // Mutation: clamp the reset to the window's ceiling -> stored reads 260,
    // and "reset" has pinned this window's ceiling as the preference, red.
    await act(async () => {
      fireEvent.doubleClick(handle)
    })
    expect(storedWidth()).toBe(String(WAVE_PANEL_DEFAULT_COLUMN_WIDTH))

    // And the default is there when the window can show it again.
    await act(async () => {
      setWindowWidth(windowLeaving(900))
      window.dispatchEvent(new Event('resize'))
    })
    expect(columnWidth()).toBe(`${WAVE_PANEL_DEFAULT_COLUMN_WIDTH}px`)
  })

  it('MAR-3155 lap 2, A: a drag the window ended stores nothing', async () => {
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    fireEvent.mouseDown(
      screen.getByRole('separator', { name: 'Resize the wave column' }),
    )
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 500 })
    })

    // The window crosses the column's floor while the pointer is still down:
    // the rail is on screen, so there is nothing they can be said to have
    // chosen.
    await act(async () => {
      setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
      window.dispatchEvent(new Event('resize'))
    })
    expect(screen.getByLabelText('Waves rail')).toBeTruthy()
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    // Mutation: drop the `maxWidth === null` guard -> 240 is stored with a
    // rail on screen, red.
    expect(storedWidth()).toBeNull()
  })

  it('MAR-3155 lap 2, B: the handle announces the range this window can give', async () => {
    setWindowWidth(windowLeaving(400))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = () =>
      screen.getByRole('separator', { name: 'Resize the wave column' })
    // Mutation: pass the MAX constant -> 640 here while 400 is the most the
    // mechanism can do, red.
    expect(handle().getAttribute('aria-valuemax')).toBe('400')
    expect(handle().getAttribute('aria-valuemin')).toBe(
      String(WAVE_PANEL_MIN_COLUMN_WIDTH),
    )

    await act(async () => {
      setWindowWidth(windowLeaving(900))
      window.dispatchEvent(new Event('resize'))
    })
    expect(handle().getAttribute('aria-valuemax')).toBe(
      String(WAVE_PANEL_MAX_COLUMN_WIDTH),
    )
  })

  it('MAR-3155 lap 2, C: a width is one number on screen and in the store', async () => {
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })

    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 300.5 })
      fireEvent.mouseUp(window)
    })
    // Mutation: round only in the serializer -> the state keeps 300.5 and the
    // handle announces it while the store says 301, red.
    expect(handle.getAttribute('aria-valuenow')).toBe('301')
    expect(storedWidth()).toBe('301')
    expect(columnWidth()).toBe('301px')
  })

  it('MAR-3155 lap 2, D: the listeners come off on mouse-up', async () => {
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })

    fireEvent.mouseDown(handle)
    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 500 })
      fireEvent.mouseUp(window)
    })
    expect(columnWidth()).toBe('500px')

    // What a person notices: the column stops following the pointer when
    // they let go. (The leak a second mouse-down could cause is a different
    // question, and the unmount case below is what witnesses it.)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 620 })
    })
    expect(columnWidth()).toBe('500px')
  })

  it('MAR-3155 lap 3, C: a second mouse-down leaves nothing behind to commit after an unmount', async () => {
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })

    // Two presses without a release between them: what a stuck button, a
    // re-render under the pointer or a lost mouse-up can produce.
    fireEvent.mouseDown(handle)
    fireEvent.mouseDown(handle)
    cleanup()

    // The column is gone, and with it every listener this hook installed.
    // Mutation: drop `releaseDrag.current?.()` from `onHandleMouseDown` ->
    // the FIRST press's pair survives the unmount, answers these events and
    // commits a width from a column nobody can see, red.
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 500 })
      fireEvent.mouseUp(window)
    })
    expect(storedWidth()).toBeNull()
    expect(document.body.style.cursor).toBe('')
  })

  it('MAR-3155 lap 3, A: a drag the window refuses stores nothing', async () => {
    localStorage.setItem('convergence-wave-panel-width', '600')
    setWindowWidth(windowLeaving(400))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })
    expect(columnWidth()).toBe('400px')

    // One pixel wider than the ceiling, then far wider: the pointer moves,
    // the column does not. The same loss as lap 2's ArrowRight, through the
    // other door.
    // Mutation: drop the start-width comparison -> stored reads 400 and the
    // 600px preference is gone for good, red.
    for (const clientX of [RESERVED + 401, RESERVED + 900]) {
      fireEvent.mouseDown(handle)
      await act(async () => {
        fireEvent.mouseMove(window, { clientX })
      })
      await act(async () => {
        fireEvent.mouseUp(window)
      })
      expect(columnWidth()).toBe('400px')
      expect(storedWidth()).toBe('600')
    }

    // A drag that DOES move the column is still a choice, and is stored.
    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 300 })
    })
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    expect(columnWidth()).toBe('300px')
    expect(storedWidth()).toBe('300')
  })

  it('MAR-3155 lap 3, B: a drag that ends with the column hidden stores nothing', async () => {
    setWindowWidth(windowLeaving(900))
    const { rerender } = render(<WavePanel reservedWidth={RESERVED} />)
    await act(async () => {
      await Promise.resolve()
    })
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })

    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 500 })
    })

    // Mission Control opens its own Waves tab while the pointer is down: the
    // column steps aside (MAR-3097 lap 2, B) and there is nothing on screen
    // the person can be said to have sized.
    await act(async () => {
      rerender(<WavePanel reservedWidth={RESERVED} hidden />)
    })
    expect(screen.queryByLabelText('Waves')).toBeNull()
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    // Mutation: ask the decision's numbers regardless of `hidden` -> 500 is
    // stored for a column nobody can see, red.
    expect(storedWidth()).toBeNull()
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

  it('lap 2, E: the board passes no cap, so a row reads the lap alone', async () => {
    // Through the container and the crew store: `roundCap` is a hop budget
    // for a flow run, not a lap cap, so it must not reach the row (MAR-3149).
    crews = [{ ...boundCrew('crew-1', 'Loom'), roundCap: 12 }]
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'EX-9',
            state: 'working',
            lap: 3,
            verdict: 'return',
          }),
        ],
        trackerHealth: health('ok'),
      },
    }

    await act(async () => {
      render(<WavesTab />)
    })
    await screen.findByLabelText('Waves')

    // Mutation: pass the crew's `roundCap` -> "lap 3 of 12", red.
    expect(rowOf('crew-1:EX-9').getByText(/lap 3 ·/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('of 12')
  })
})

describe('MAR-3085 R7: the row reads the lap, the cap and the ruling', () => {
  it('a stopped lap reads its lap, the verdict word, and "re-groom (Fable)"', () => {
    render(
      <WavePanelView
        layout="column"
        sections={sectionWaveRows(
          [
            ledgerEntry({
              issueIdentifier: 'EX-1',
              state: 'stopped',
              lap: 3,
              verdict: 'stop',
              verdictSettleId: 'settle-1',
              verdictNote: 'the reply',
            }),
          ],
          NOW,
        )}
        header={waveHeader({ crews: ANSWERED, rowCount: 1, now: NOW })}
        inertReason={() => null}
        onOpen={vi.fn()}
      />,
    )

    // Mutation: drop the lap label from the row -> red.
    expect(
      rowOf('crew-1:EX-1').getByText('opus · stopped · lap 3 · stop'),
    ).toBeTruthy()
    expect(rowOf('crew-1:EX-1').getByText('re-groom (Fable)')).toBeTruthy()
    expect(
      screen.getByRole('region', { name: 'In the wave' }).textContent,
    ).toContain('EX-1')
  })

  it('a crew with no cap reads the lap alone', () => {
    render(
      <WavePanelView
        layout="column"
        sections={sectionWaveRows(
          [ledgerEntry({ issueIdentifier: 'EX-2', state: 'working', lap: 3 })],
          NOW,
        )}
        header={waveHeader({ crews: ANSWERED, rowCount: 1, now: NOW })}
        inertReason={() => null}
        onOpen={vi.fn()}
      />,
    )
    expect(
      rowOf('crew-1:EX-2').getByText('opus · working · lap 3'),
    ).toBeTruthy()
    expect(document.body.textContent).not.toContain('lap 3 of')
  })
})

describe('MAR-3138 R4: a blocked row reads "decide" under Waiting on you', () => {
  it('a working, blocked row is there and not in the wave, and says which label put it there', () => {
    renderView([
      ledgerEntry({ issueIdentifier: 'EX-1', state: 'working', blocked: true }),
      ledgerEntry({ issueIdentifier: 'EX-2', state: 'working' }),
    ])

    const waiting = screen.getByRole('region', { name: 'Waiting on you' })
    const inTheWave = screen.getByRole('region', { name: 'In the wave' })
    // Mutation: leave a blocked row in its state's section -> EX-1 is in the
    // wave and not here, red.
    expect(within(waiting).getAllByText('EX-1')).toHaveLength(1)
    expect(within(waiting).queryByText('EX-2')).toBeNull()
    expect(within(inTheWave).queryByText('EX-1')).toBeNull()
    expect(rowOf('crew-1:EX-1').getByText('decide')).toBeTruthy()
    // Mutation: drop the marker from the row -> red.
    expect(rowOf('crew-1:EX-1').getByText('blocked')).toBeTruthy()
    expect(rowOf('crew-1:EX-2').queryByText('blocked')).toBeNull()
  })

  it('lap 2, A: a blocked unassigned row asks for nothing -- it is only in Waves', () => {
    renderView([
      ledgerEntry({
        issueIdentifier: 'EX-1',
        state: 'unassigned',
        seat: null,
        blocked: true,
      }),
    ])

    // Mutation: drop either terminal guard -> "decide" is on screen, red.
    expect(screen.queryByText('decide')).toBeNull()
    // The section is not even drawn: there is nothing waiting on anybody.
    expect(screen.queryByRole('region', { name: 'Waiting on you' })).toBeNull()
    // The row is still readable under its wave, label and all.
    expect(rowOf('crew-1:EX-1').getByText('blocked')).toBeTruthy()
  })

  it('a blocked reviewed row asks to decide, not to QA, and the rail counts it once', () => {
    renderView([
      ledgerEntry({
        issueIdentifier: 'EX-1',
        state: 'reviewed',
        blocked: true,
      }),
    ])
    expect(rowOf('crew-1:EX-1').getByText('decide')).toBeTruthy()
    expect(rowOf('crew-1:EX-1').queryByText('QA and say done')).toBeNull()

    cleanup()
    render(
      <WaveRailView
        sections={sectionWaveRows(
          [
            ledgerEntry({
              issueIdentifier: 'EX-1',
              state: 'working',
              blocked: true,
            }),
          ],
          NOW,
        )}
        outage={false}
        narrow={false}
        onExpand={vi.fn()}
      />,
    )
    // The rail reads the same sections, so the count follows R4 for free.
    expect(screen.getByLabelText('Waiting on you: 1')).toBeTruthy()
    expect(screen.getByLabelText('In the wave: 0')).toBeTruthy()
  })
})

describe('MAR-3148: the rail, the props and the clock', () => {
  const rows = [ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })]

  it('R1: the rail a narrow window forced says why in its name, and stays reachable', () => {
    const onExpand = vi.fn()
    render(
      <WaveRailView
        sections={sectionWaveRows(rows, NOW)}
        outage={false}
        narrow
        onExpand={onExpand}
      />,
    )

    // Named by what it is AND why it cannot act: the reason has to reach a
    // screen reader, which a `title` on a disabled button never does.
    // Mutation: keep the reason out of the name (or use `disabled`) -> red.
    const open = screen.getByRole('button', { name: /too narrow/i })
    expect(open.hasAttribute('disabled')).toBe(false)
    expect(open.getAttribute('aria-disabled')).toBe('true')
    expect(open.getAttribute('title')).toBe(WAVE_RAIL_NARROW_TITLE)
    // Reachable: still in the tab order, and a click does nothing.
    open.focus()
    expect(document.activeElement).toBe(open)
    fireEvent.click(open)
    expect(onExpand).not.toHaveBeenCalled()

    cleanup()
    const onOpen = vi.fn()
    render(
      <WaveRailView
        sections={sectionWaveRows(rows, NOW)}
        outage={false}
        onExpand={onOpen}
      />,
    )
    const stored = screen.getByRole('button', { name: 'Open the wave panel' })
    expect(stored.getAttribute('aria-disabled')).toBeNull()
    expect(stored.getAttribute('title')).toBeNull()
    fireEvent.click(stored)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('C: a row that cannot open its seat is inert and says so', () => {
    render(
      <WavePanelView
        layout="column"
        sections={sectionWaveRows(
          [ledgerEntry({ issueIdentifier: 'EX-9', sessionId: null })],
          NOW,
        )}
        header={waveHeader({ crews: ANSWERED, rowCount: 1, now: NOW })}
        inertReason={() => 'no conversation for this seat'}
        onOpen={vi.fn()}
      />,
    )
    const row = document.querySelector('[data-wave-row="crew-1:EX-9"]')
    // Mutation: drop `aria-disabled` from the inert row -> red (the previous
    // lap rendered every row through `inertReason={() => null}`, the ENABLED
    // branch, so deleting the attribute changed nothing).
    expect(row?.getAttribute('aria-disabled')).toBe('true')
    expect(row?.tagName).toBe('DIV')
    expect(
      rowOf('crew-1:EX-9').getByText('no conversation for this seat'),
    ).toBeTruthy()
  })

  it('R2: the panel takes no Connect handler, and says where to bind instead', () => {
    // Mutation: reintroduce `onConnectTracker` -> red (the key set grows).
    expectTypeOf<keyof WavePanelViewProps>().toEqualTypeOf<
      | 'sections'
      | 'header'
      | 'layout'
      | 'boardLine'
      | 'inertReason'
      | 'onOpen'
      | 'onCollapse'
      // MAR-3155: the column's width is a prop now, not a class.
      | 'width'
    >()
    renderView([], [], 'full')
    expect(
      screen.getByText('Connect a tracker in a crew’s settings on the Canvas.'),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Connect a tracker' }),
    ).toBeNull()
  })

  it('R5: an unreachable host on a seatless working row shows both, and the row is inert', () => {
    renderView([
      ledgerEntry({
        issueIdentifier: 'EX-7',
        state: 'working',
        sessionId: null,
        hostLiveness: {
          executionHost: 'lm',
          lastEventAt: '2026-09-17T12:06:00.000Z',
          hostReachable: false,
        },
      }),
    ])
    const row = rowOf('crew-1:EX-7')
    // The action and the marker are two facts, and the row carries both.
    expect(row.getByText('seat not in crew')).toBeTruthy()
    expect(row.getByText('host unreachable since 4m')).toBeTruthy()
  })
})

describe('MAR-3148 R3: the clock ticks only for an age on screen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * How many timers are pending once the board has settled. The "reading the
   * tracker…" wait carries no age (lap 2, D), so the clock does not start
   * while the first list is in flight either; the count is read after the
   * answer lands, which is when rows or an outage age could have appeared.
   */
  async function mountBoard(snapshot: WorkLedgerSnapshot) {
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      crew: {
        list: vi.fn(async () => [boundCrew('crew-1', 'Loom')]),
        onUpdated: vi.fn(() => () => {}),
      },
      workLedger: {
        list: vi.fn(async () => snapshot),
        onUpdated: vi.fn(() => () => {}),
      },
    }
    useSessionStore.setState({ globalSessions: [SESSION] })
    useSessionCrewStore.setState({ crews: [] })
    useWorkLedgerStore.setState({
      snapshots: {},
      broadcastCount: {},
      error: null,
      unsubscribeBroadcast: null,
    })
    await act(async () => {
      render(<WavesTab />)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    return vi.getTimerCount()
  }

  it('a bound, healthy, empty board holds no timer once it has read', async () => {
    // Mutation: gate on `boundCrewIds.length > 0` -> the empty board keeps
    // ticking, red.
    expect(
      await mountBoard({
        crewId: 'crew-1',
        entries: [],
        trackerHealth: health('ok'),
      }),
    ).toBe(0)
  })

  it('one row keeps the clock', async () => {
    expect(
      await mountBoard({
        crewId: 'crew-1',
        entries: [ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })],
        trackerHealth: health('ok'),
      }),
    ).toBeGreaterThan(0)
  })

  it('D: a board still reading holds no timer — that sentence has no age in it', async () => {
    expect(
      await mountBoard({
        crewId: 'crew-1',
        entries: [],
        trackerHealth: null,
      }),
    ).toBe(0)
    expect(screen.getByRole('status').textContent).toBe('reading the tracker…')
  })

  it('an outage with no rows keeps it too: the header carries an age', async () => {
    expect(
      await mountBoard({
        crewId: 'crew-1',
        entries: [],
        trackerHealth: health('unreachable'),
      }),
    ).toBeGreaterThan(0)
    // And the age is really on screen, which is what the clock is for.
    expect(screen.getByRole('status').textContent).toMatch(/· \d+\w+$/)
  })
})
