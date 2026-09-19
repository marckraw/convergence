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
import { WavePanel } from './wave-panel.container'
import { WavesTab } from './waves-tab.container'
import {
  WavePanelView,
  type WavePanelViewProps,
} from './wave-panel.presentational'
import { LoomStripView } from './loom-strip.presentational'
import { loomSheets } from './loom-sheets.pure'
import { LOOM_SHEETS, LOOM_SHEET_NAMES } from './wave-panel-sheet.pure'
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
import { crewMember, ledgerEntry, residentSeat } from './wave-rows.fixture'

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
) {
  return render(
    <WavePanelView
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

  it('MAR-3169 R4: a project the key cannot see reads its age, and the last rows stay', () => {
    renderView(
      [ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })],
      [{ name: 'Loom', health: health('project-not-visible') }],
    )
    // Never "Quiet project": the empty page this state comes from is exactly
    // what used to read as a calm day.
    expect(screen.getByRole('status').textContent).toBe(
      'tracker project not visible to this key · 10m',
    )
    expect(
      document.querySelector('[data-wave-row="crew-1:EX-1"]'),
    ).not.toBeNull()
    expect(document.body.textContent).not.toContain('Quiet project')
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
    renderView([], [])
    expect(screen.getByText('No crew reads a tracker yet.')).toBeTruthy()
    expect(
      screen.getByText('Connect a tracker in a crew’s settings on the Canvas.'),
    ).toBeTruthy()
  })
})

describe('MAR-3097 lap 2, F2: wave groups are disclosures', () => {
  it('open in the tab, with the wave’s name and count on the summary', () => {
    // Was "closed in the column, open in the full tab". The closed half died
    // with the column (MAR-3189 lap 2, G): its reason was that a narrow
    // column repeated rows already shown above, and Loom's Before sheet does
    // not group by wave at all until LV3. Nothing replaces it, because
    // nothing renders a closed wave group any more.
    // Mutation: `disclosure="closed"` in the tab -> red.
    renderView([ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })])
    const group = document.querySelector('details[data-wave-group]')
    expect(group?.hasAttribute('open')).toBe(true)
    expect(group?.querySelector('summary')?.textContent).toBe(
      'Wave loom-p2 · 1',
    )
  })
})

describe('MAR-3189 R4: the strip is the same model', () => {
  it('shows the four sheet counts and the outage dot', () => {
    const rows = [
      ledgerEntry({ issueIdentifier: 'EX-1', state: 'reviewed' }),
      ledgerEntry({ issueIdentifier: 'EX-2', state: 'working' }),
      ledgerEntry({ issueIdentifier: 'EX-3', state: 'assigned' }),
      ledgerEntry({ issueIdentifier: 'EX-4', state: 'done' }),
    ]
    const sheets = loomSheets(rows, NOW)
    render(<LoomStripView sheets={sheets} outage onExpand={vi.fn()} />)

    const shown = (sheet: string) =>
      document.querySelector(`[data-wave-count="${sheet}"]`)?.textContent
    // The strip reads the sheets, not a second selector of its own.
    // Mutation: count `sections` instead -> red.
    expect(shown('before')).toBe('1')
    expect(shown('now')).toBe('2')
    expect(shown('next')).toBe('1')
    expect(shown('plan')).toBe('0')
    for (const sheet of LOOM_SHEETS) {
      expect(
        screen.getByLabelText(new RegExp(`^${LOOM_SHEET_NAMES[sheet]}: `)),
      ).toBeTruthy()
    }
    expect(screen.getByLabelText('Tracker not answering')).toBeTruthy()
  })

  it('MAR-3189: Expand acts from the strip, where Open used to refuse', () => {
    const onExpand = vi.fn()
    render(
      <LoomStripView
        sheets={loomSheets([], NOW)}
        outage={false}
        onExpand={onExpand}
      />,
    )
    const expand = screen.getByRole('button', { name: 'Expand Loom' })
    // The control no longer opens a column the window cannot hold; it puts
    // Loom in the content area, which this window CAN hold. An inert button
    // here would be the strip claiming a limit the mechanism does not have.
    // Mutation: `aria-disabled` + a swallowed click -> red.
    expect(expand.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(expand)
    expect(onExpand).toHaveBeenCalledTimes(1)
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
    expect(screen.queryByLabelText('Loom')).toBeNull()
    expect(screen.queryByLabelText('Loom strip')).toBeNull()
  })

  it('B: a bound crew -> the column; hidden (the Waves tab showing) -> nothing', async () => {
    await mount(<WavePanel />)
    expect(await screen.findByLabelText('Loom')).toBeTruthy()
    cleanup()
    await mount(<WavePanel hidden />)
    expect(screen.queryByLabelText('Loom')).toBeNull()
  })

  it('MAR-3189 R4: too narrow -> the strip, and the stored mode is untouched', async () => {
    // One pixel short of the narrowest readable column (MAR-3155 R1): the
    // column shrinks before it becomes the strip, so the window that forces
    // the strip is measured against the column's FLOOR, not its default.
    setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
    await mount(<WavePanel reservedWidth={260} />)
    // Mutation: ignore the width -> the compact column, red.
    expect(await screen.findByLabelText('Loom strip')).toBeTruthy()
    expect(localStorage.getItem('convergence-wave-panel-mode')).toBeNull()
  })

  it('MAR-3189 R1: a mode stored before Loom opens the column, never nothing', async () => {
    // `rail` and `open` are the two modes this app stored before the sheets
    // existed. Mutation: keep `rail` as a mode of its own -> a person who had
    // collapsed the column upgrades into a panel shape that is gone, red.
    for (const legacy of ['rail', 'open', 'sideways']) {
      localStorage.setItem('convergence-wave-panel-mode', legacy)
      await mount(<WavePanel reservedWidth={RESERVED} />)
      expect(await screen.findByLabelText('Loom')).toBeTruthy()
      cleanup()
    }
  })

  it('MAR-3189 R5: Expand from the strip reaches the stack a narrow window can hold', async () => {
    setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
    await mount(<WavePanel reservedWidth={260} />)
    await screen.findByLabelText('Loom strip')
    // Mutation: refuse the click while narrow (the rail's old law) -> red.
    fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    expect(screen.getByRole('button', { name: 'Fold Loom' })).toBeTruthy()
    expect(screen.queryByLabelText('Loom strip')).toBeNull()
  })

  /** The `aside`'s inline width, as the browser would lay it out. */
  const columnWidth = () =>
    (screen.getByLabelText('Loom') as HTMLElement).style.width

  const storedWidth = () => localStorage.getItem('convergence-wave-panel-width')

  const windowLeaving = (available: number) =>
    RESERVED + WAVE_PANEL_MIN_MAIN_WIDTH + available

  it('MAR-3155 R2: a narrow window cuts the column without rewriting the preference', async () => {
    localStorage.setItem('convergence-wave-panel-width', '380')
    setWindowWidth(windowLeaving(320))
    await mount(<WavePanel reservedWidth={RESERVED} />)

    // What fits is on screen; what was chosen is still what is stored.
    // Mutation: save the effective width on render -> the widened case below
    // reads 320px, red.
    expect(columnWidth()).toBe('320px')
    expect(storedWidth()).toBe('380')

    // The window grows back, with nobody touching anything.
    await act(async () => {
      setWindowWidth(windowLeaving(900))
      window.dispatchEvent(new Event('resize'))
    })
    expect(columnWidth()).toBe('380px')
    expect(storedWidth()).toBe('380')
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
    // (620 instead of 360), red.
    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 360 })
    })
    expect(columnWidth()).toBe('360px')
    // Nothing is stored until the gesture ends.
    expect(storedWidth()).toBeNull()
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    expect(columnWidth()).toBe('360px')
    expect(storedWidth()).toBe('360')
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')

    // A step from the keyboard.
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowRight' })
    })
    expect(columnWidth()).toBe(`${360 + WAVE_PANEL_WIDTH_STEP}px`)
    expect(storedWidth()).toBe(String(360 + WAVE_PANEL_WIDTH_STEP))
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    })
    expect(storedWidth()).toBe('360')
    // A key the handle has no use for changes nothing.
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'a' })
    })
    expect(storedWidth()).toBe('360')

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

  it('MAR-3155 R4: the strip has no handle, and an unmount mid-drag gives the cursor back', async () => {
    setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom strip')
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
      fireEvent.mouseMove(window, { clientX: RESERVED + 360 })
    })
    expect(columnWidth()).toBe('360px')
    // Mutation: drop the unmount cleanup -> the whole app keeps a resize
    // cursor and unselectable text after the column goes away, red.
    cleanup()
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    // Mutation: commit on release rather than on a finished mouse-up -> the
    // interrupted drag leaves 360 behind, red.
    expect(storedWidth()).toBeNull()
  })

  it('MAR-3155 lap 2, A: a step the window refuses stores nothing', async () => {
    localStorage.setItem('convergence-wave-panel-width', '380')
    setWindowWidth(windowLeaving(320))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })
    expect(columnWidth()).toBe('320px')

    // They pressed WIDER. The window has nothing more to give, so nothing
    // moves -- and nothing may be written down: storing 320 here is how a
    // 380px preference is lost for good.
    // Mutation: commit the clamped step unconditionally -> stored reads 320,
    // red.
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowRight' })
    })
    expect(columnWidth()).toBe('320px')
    expect(storedWidth()).toBe('380')

    // Narrower still works: that gesture does move something.
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    })
    expect(columnWidth()).toBe(`${320 - WAVE_PANEL_WIDTH_STEP}px`)
    expect(storedWidth()).toBe(String(320 - WAVE_PANEL_WIDTH_STEP))
  })

  it('MAR-3155 lap 2, A: a reset stores the default, not the window’s ceiling', async () => {
    // A preference the window is already cutting: with the Loom bounds the
    // default IS the floor, so the ceiling can only differ from it from above.
    localStorage.setItem('convergence-wave-panel-width', '380')
    setWindowWidth(windowLeaving(300))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })
    expect(columnWidth()).toBe('300px')

    // Mutation: clamp the reset to the window's ceiling -> stored reads 300,
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
      fireEvent.mouseMove(window, { clientX: RESERVED + 360 })
    })

    // The window crosses the column's floor while the pointer is still down:
    // the rail is on screen, so there is nothing they can be said to have
    // chosen.
    await act(async () => {
      setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
      window.dispatchEvent(new Event('resize'))
    })
    expect(screen.getByLabelText('Loom strip')).toBeTruthy()
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
      fireEvent.mouseMove(window, { clientX: RESERVED + 360 })
      fireEvent.mouseUp(window)
    })
    expect(columnWidth()).toBe('360px')

    // What a person notices: the column stops following the pointer when
    // they let go. (The leak a second mouse-down could cause is a different
    // question, and the unmount case below is what witnesses it.)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 390 })
    })
    expect(columnWidth()).toBe('360px')
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
      fireEvent.mouseMove(window, { clientX: RESERVED + 360 })
      fireEvent.mouseUp(window)
    })
    expect(storedWidth()).toBeNull()
    expect(document.body.style.cursor).toBe('')
  })

  it('MAR-3161: a press after a lost mouse-up starts clean and stores nothing', async () => {
    // Integration pin (Fable). A mouse-up the window never delivered leaves a
    // drag installed with 500 as the pointer's last word. The next press
    // never moves: it must NOT finish the stale drag.
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })

    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 360 })
    })
    // ...no mouse-up. The person presses again and lets go without moving.
    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    // Mutation: refuse the second press instead of releasing the first drag
    // -> the stale closure answers the mouse-up and 360 is stored, red.
    expect(storedWidth()).toBeNull()
    expect(columnWidth()).toBe('280px')
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
    // Mutation (MAR-3161): settle against the stored width instead of what
    // it would SHOW under this ceiling -> stored reads 400 and the 600px
    // preference is gone for good, red.
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

  it('MAR-3161 R2: a mid-drag ceiling move stores the width you let go on', async () => {
    // Residue from MAR-3155: startedAt compared to the width at mouse-down,
    // so releasing back at that width after the ceiling grew stored nothing
    // and the column jumped to the old preference.
    // Mutation: capture the ceiling at mouse-down → stored stays 400 → red.
    localStorage.setItem('convergence-wave-panel-width', '400')
    setWindowWidth(windowLeaving(300))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })
    expect(columnWidth()).toBe('300px')

    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 290 })
    })
    expect(columnWidth()).toBe('290px')

    await act(async () => {
      setWindowWidth(windowLeaving(400))
      window.dispatchEvent(new Event('resize'))
    })

    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 340 })
    })
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    expect(columnWidth()).toBe('340px')
    expect(storedWidth()).toBe('340')
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
      fireEvent.mouseMove(window, { clientX: RESERVED + 360 })
    })

    // Mission Control opens its own Waves tab while the pointer is down: the
    // column steps aside (MAR-3097 lap 2, B) and there is nothing on screen
    // the person can be said to have sized.
    await act(async () => {
      rerender(<WavePanel reservedWidth={RESERVED} hidden />)
    })
    expect(screen.queryByLabelText('Loom')).toBeNull()
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    // Mutation: ask the decision's numbers regardless of `hidden` -> 500 is
    // stored for a column nobody can see, red.
    expect(storedWidth()).toBeNull()
  })

  it('MAR-3155 lap 3, B: a drag that ends after the last bound crew went away stores nothing', async () => {
    // The third reason a column leaves the screen, and the one that needs no
    // act of the person's: the crew list changes over IPC while the pointer
    // is down. (Integration pin, Fable: the `hidden` case above reddens only
    // its own limb of the on-screen fact.)
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const handle = screen.getByRole('separator', {
      name: 'Resize the wave column',
    })

    fireEvent.mouseDown(handle)
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: RESERVED + 360 })
    })
    await act(async () => {
      useSessionCrewStore.setState({ crews: [] })
    })
    expect(screen.queryByLabelText('Loom')).toBeNull()
    await act(async () => {
      fireEvent.mouseUp(window)
    })
    // Mutation: drop `board.boundCrewCount > 0` from the on-screen fact -> 500
    // is stored for a column that no longer exists, red.
    expect(storedWidth()).toBeNull()
  })

  it('MAR-3195: a Loom row opens the ISSUE, and the conversation opens from inside it', async () => {
    // Superseding MAR-3097 R5's "a row opens the seat's conversation": from
    // this slice a Loom row is a door to the issue, and the conversation is
    // one of the two doors OUT of the detail. Nothing is lost -- the same
    // session still opens, through `onOpenSession`, one click further in,
    // and the Waves tab's rows keep the old behaviour (R8, its own test).
    const onOpenSession = vi.fn()
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    await mount(<WavePanel onOpenSession={onOpenSession} />)
    await screen.findByLabelText('Loom')

    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-2"]') as HTMLElement,
    )
    // Mutation: keep the old door (open the session on the row's click) ->
    // no detail, red.
    expect(document.querySelector('[data-loom-detail]')).toBeTruthy()
    expect(onOpenSession).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Open conversation →' }))
    expect(onOpenSession).toHaveBeenCalledTimes(1)
    expect(onOpenSession.mock.calls[0]![0].id).toBe('session-opus')
    expect(windowOpen).not.toHaveBeenCalled()

    // The reason a row cannot be opened still travels with it, now into the
    // detail. EX-4's session is not in the store.
    fireEvent.click(
      screen.getByRole('button', { name: 'Close the issue detail' }),
    )
    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-4"]') as HTMLElement,
    )
    expect(screen.getByText('conversation not loaded')).toBeTruthy()
    windowOpen.mockRestore()
  })

  it('MAR-3189 R3: the open sheet persists, and a remount reads it back', async () => {
    await mount(<WavePanel reservedWidth={RESERVED} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Next · / }))
    // Mutation: hold the sheet in state without writing it -> null here, and
    // the remount below opens Now again, red.
    expect(localStorage.getItem('convergence-loom-sheet')).toBe('next')
    cleanup()
    await mount(<WavePanel reservedWidth={RESERVED} />)
    expect(
      (await screen.findByRole('button', { name: /^Next · / })).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true')
  })

  it('MAR-3189 R2/R6: the four sheets together hold exactly the tab’s rows', async () => {
    const keys = () =>
      [...document.querySelectorAll('[data-wave-row]')]
        .map((node) => node.getAttribute('data-wave-row'))
        .sort()

    await mount(<WavesTab />)
    await screen.findByLabelText('Waves')
    // The tab draws each row twice -- in its section and again under its wave
    // -- so the comparison is between the two SETS of rows, not their counts.
    const tab = [...new Set(keys())].sort()
    cleanup()

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    // One sheet at a time (R1), so the panel's rows are the UNION of the four
    // -- which is the rendered half of R2's "every row lands in exactly one
    // sheet". Mutation: send a row to two sheets -> a duplicate key here,
    // red; drop the `else` that catches `unassigned`/`stopped` -> short, red.
    const seen = new Set<string>()
    for (const sheet of LOOM_SHEETS) {
      fireEvent.click(
        screen.getByRole('button', {
          name: new RegExp(`^${LOOM_SHEET_NAMES[sheet]} · `),
        }),
      )
      for (const key of keys()) seen.add(key as string)
    }
    expect([...seen].sort()).toEqual(tab)
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

  it('MAR-3191 R3: runtime and tracker status are two facts on two lines', async () => {
    crews = [
      {
        ...boundCrew('crew-1', 'Loom'),
        members: [residentSeat('opus'), residentSeat('idle-seat')],
      },
    ]
    useSessionStore.setState({
      globalSessions: [
        { ...SESSION, id: 'session-opus', status: 'failed' } as SessionSummary,
        {
          ...SESSION,
          id: 'session-idle-seat',
          status: 'running',
        } as SessionSummary,
      ],
    })
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'EX-1',
            state: 'working',
            seat: 'opus',
            sessionId: 'session-opus',
            trackerStatus: 'In Progress',
            lap: 2,
          }),
        ],
        trackerHealth: health('ok'),
      },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')

    const failed = within(
      document.querySelector(
        '[data-loom-horse="crew-1:session-opus"]',
      ) as HTMLElement,
    )
    // The session says failed; the tracker says In Progress. Both are true,
    // and a card that merged them would have to pick one and lie.
    // Mutation: derive the word from the row's state -> "Working", red.
    expect(failed.getByText('Failed')).toBeTruthy()
    expect(failed.getByText(/Linear: In Progress/)).toBeTruthy()
    // The card's accessible NAME carries the issue it holds (lap 2, D). An
    // `aria-label` of seat + runtime replaces the content, so a screen
    // reader would hear "opus — Failed" and never learn which issue.
    // Mutation: put that label back -> this query finds no such button, red.
    expect(screen.getByRole('button', { name: /EX-1/ })).toBeTruthy()
    expect(failed.getByText(/Lap 2/)).toBeTruthy()

    const running = within(
      document.querySelector(
        '[data-loom-horse="crew-1:session-idle-seat"]',
      ) as HTMLElement,
    )
    expect(running.getByText('Working')).toBeTruthy()
    expect(running.getByText('No active ticket')).toBeTruthy()
  })

  it('MAR-3191 R4: the held row is on the card and not in the list', async () => {
    crews = [
      { ...boundCrew('crew-1', 'Loom'), members: [residentSeat('opus')] },
    ]
    useSessionStore.setState({
      globalSessions: [
        { ...SESSION, id: 'session-opus', status: 'running' } as SessionSummary,
      ],
    })
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'EX-1',
            state: 'working',
            seat: 'opus',
            sessionId: 'session-opus',
          }),
        ],
        trackerHealth: health('ok'),
      },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')

    // Mutation: list the held rows too -> the identifier appears twice on one
    // sheet, red.
    expect(screen.getAllByText(/EX-1/)).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'In flight' })).toBeNull()
  })

  it('MAR-3191 R5: Awaiting QA counts what it has and reveals what it says', async () => {
    crews = [{ ...boundCrew('crew-1', 'Loom'), members: [] }]
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: Array.from({ length: 12 }, (_, at) =>
          ledgerEntry({
            issueIdentifier: `QA-${at + 1}`,
            state: 'reviewed',
            seat: null,
          }),
        ),
        trackerHealth: health('ok'),
      },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')

    const qaRows = () =>
      document.querySelectorAll('[data-wave-row^="crew-1:QA-"]').length
    // The heading counts the twelve it HAS, not the three it shows.
    // Mutation: heading from `rows.length` -> "Awaiting QA · 3", red.
    expect(
      screen.getByRole('region', { name: 'Awaiting QA' }).textContent,
    ).toContain('Awaiting QA · 12')
    expect(qaRows()).toBe(3)

    const reveal = screen.getByRole('button', {
      name: 'Show all 12 awaiting QA',
    })
    fireEvent.click(reveal)
    // Mutation: a control that only changes its label -> still 3, red.
    expect(qaRows()).toBe(12)
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(qaRows()).toBe(3)
  })

  it('MAR-3191 R6: a card opens the conversation the crew record names', async () => {
    const onOpenSession = vi.fn()
    crews = [
      {
        ...boundCrew('crew-1', 'Loom'),
        members: [residentSeat('opus'), residentSeat('gone')],
      },
    ]
    useSessionStore.setState({
      globalSessions: [
        { ...SESSION, id: 'session-opus', status: 'running' } as SessionSummary,
      ],
    })
    snapshots = {
      'crew-1': { crewId: 'crew-1', entries: [], trackerHealth: health('ok') },
    }

    await mount(
      <WavePanel reservedWidth={RESERVED} onOpenSession={onOpenSession} />,
    )
    await screen.findByLabelText('Loom')

    // The card's accessible name is its CONTENT (lap 2, D): an `aria-label`
    // of seat + runtime replaced it, so the issue a horse holds was never
    // announced. Mutation: put that label back -> the held identifier is not
    // in the name and this query fails.
    fireEvent.click(screen.getByRole('button', { name: /opus.*Working/ }))
    // Mutation: look the seat up by `batonName` in the session list -> a
    // same-named session in another crew opens, red.
    expect(onOpenSession).toHaveBeenCalledTimes(1)
    expect(onOpenSession.mock.calls[0]![0].id).toBe('session-opus')

    // The seat whose conversation the store does not hold cannot be opened,
    // and says so in the words a row uses.
    const gone = within(
      document.querySelector(
        '[data-loom-horse="crew-1:session-gone"]',
      ) as HTMLElement,
    )
    expect(gone.queryByRole('button')).toBeNull()
    expect(gone.getByText('conversation not loaded')).toBeTruthy()
    expect(gone.getByText('Not seen')).toBeTruthy()
  })

  it('MAR-3191 R7: compact and expanded say the same thing', async () => {
    crews = [
      {
        ...boundCrew('crew-1', 'Loom'),
        members: [residentSeat('opus'), crewMember({ batonName: 'recipe-1' })],
      },
    ]
    useSessionStore.setState({
      globalSessions: [
        { ...SESSION, id: 'session-opus', status: 'running' } as SessionSummary,
      ],
    })
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'EX-1',
            state: 'working',
            seat: 'opus',
            sessionId: 'session-opus',
          }),
        ],
        trackerHealth: health('ok'),
      },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    const compact = (
      document.querySelector('[data-loom-sheet="now"]') as HTMLElement
    ).textContent
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
    const expanded = (
      document.querySelector('[data-loom-sheet="now"]') as HTMLElement
    ).textContent

    // Mutation: drop the horses block from one shape -> red.
    expect(compact).toContain('2 horses')
    expect(compact).toContain('recipe · spawns on dispatch')
    expect(expanded).toBe(compact)
  })

  it('MAR-3191 lap 2, A: a blocked held row is on the card and under Decide', async () => {
    crews = [
      { ...boundCrew('crew-1', 'Loom'), members: [residentSeat('opus')] },
    ]
    useSessionStore.setState({
      globalSessions: [
        { ...SESSION, id: 'session-opus', status: 'idle' } as SessionSummary,
      ],
    })
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'MAR-1',
            state: 'working',
            seat: 'opus',
            sessionId: 'session-opus',
            blocked: true,
            hostLiveness: {
              executionHost: 'lm',
              lastEventAt: '2026-09-17T12:06:00.000Z',
              hostReachable: false,
            },
          }),
        ],
        trackerHealth: health('ok'),
      },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')

    const card = within(
      document.querySelector(
        '[data-loom-horse="crew-1:session-opus"]',
      ) as HTMLElement,
    )
    // Lap 1 read "Idle · No active ticket" here, about a horse busy on a
    // blocked issue on a host nobody had heard from in ten minutes.
    // Mutation: search `inFlight` only -> "No active ticket", red.
    expect(card.getAllByText(/MAR-1/).length).toBeGreaterThan(0)
    expect(card.getByText('Not seen')).toBeTruthy()
    expect(card.getByText(/blocked · decide/)).toBeTruthy()
    // ...and it is still where a person looks for decisions.
    expect(
      within(screen.getByRole('region', { name: 'Decide' })).getAllByText(
        /MAR-1/,
      ).length,
    ).toBeGreaterThan(0)
  })

  it('MAR-3191 lap 2, C: a deleted conversation says so', async () => {
    crews = [
      {
        ...boundCrew('crew-1', 'Loom'),
        members: [residentSeat('gone', { conversationMissing: true })],
      },
    ]
    useSessionStore.setState({ globalSessions: [] })
    snapshots = {
      'crew-1': { crewId: 'crew-1', entries: [], trackerHealth: health('ok') },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    // Mutation: ignore `conversationMissing` -> "conversation not loaded",
    // which reads as "wait" about a seat somebody has to go and remove.
    expect(screen.getByText('conversation deleted')).toBeTruthy()
  })

  it('MAR-3191 lap 2, D: the QA control says what it controls', async () => {
    crews = [{ ...boundCrew('crew-1', 'Loom'), members: [] }]
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: Array.from({ length: 12 }, (_, at) =>
          ledgerEntry({
            issueIdentifier: `QA-${at + 1}`,
            state: 'reviewed',
            seat: null,
          }),
        ),
        trackerHealth: health('ok'),
      },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')

    const toggle = () =>
      screen.getByRole('button', { name: /Show (all 12 awaiting QA|fewer)/ })
    const section = screen.getByRole('region', { name: 'Awaiting QA' })
    // Mutation: drop `aria-expanded` -> null, and a screen reader cannot
    // tell whether the twelve are showing.
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(toggle().getAttribute('aria-controls')).toBe(section.id)
    // Inside the section it controls, so the relationship is readable.
    expect(section.contains(toggle())).toBe(true)
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })

  it('MAR-3191 lap 2, E: a crew with no horse seats says so', async () => {
    crews = [{ ...boundCrew('crew-1', 'Loom'), members: [] }]
    snapshots = {
      'crew-1': { crewId: 'crew-1', entries: [], trackerHealth: health('ok') },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    // Mutation: the five-zero line back -> red; arithmetic about nothing is
    // not an answer to "who is riding?".
    expect(screen.getByText('No horse seats in this crew')).toBeTruthy()
    expect(screen.queryByText(/0 horses/)).toBeNull()
  })

  it('MAR-3195 R1: the detail is derived from the live row, never a copy', async () => {
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-2"]') as HTMLElement,
    )
    expect(screen.getByText(/Linear: In Progress/)).toBeTruthy()

    // The tracker moves while the card is open.
    await act(async () => {
      useWorkLedgerStore.setState({
        snapshots: {
          'crew-1': {
            crewId: 'crew-1',
            entries: rows.map((row) =>
              row.issueIdentifier === 'EX-2'
                ? { ...row, trackerStatus: 'In Review', state: 'returned' }
                : row,
            ),
            trackerHealth: health('ok'),
          },
        },
      })
    })
    // Mutation: keep the entry object in state -> the card goes on saying
    // "In Progress" about an issue that came back ten minutes ago, red.
    expect(screen.getByText(/Linear: In Review/)).toBeTruthy()

    // And a row that leaves the ledger takes its detail with it.
    await act(async () => {
      useWorkLedgerStore.setState({
        snapshots: {
          'crew-1': {
            crewId: 'crew-1',
            entries: rows.filter((row) => row.issueIdentifier !== 'EX-2'),
            trackerHealth: health('ok'),
          },
        },
      })
    })
    expect(document.querySelector('[data-loom-detail]')).toBeNull()
    expect(document.querySelector('[data-wave-row]')).toBeTruthy()
  })

  it('MAR-3195 R1: every sheet’s rows can be read, not only the open one’s', async () => {
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({ issueIdentifier: 'EX-DONE', state: 'done' }),
          ledgerEntry({
            issueIdentifier: 'EX-NEXT',
            state: 'assigned',
            seat: 'opus',
          }),
        ],
        trackerHealth: health('ok'),
      },
    }
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')

    // Before and Next, each opened from its own sheet. The lookup spans all
    // five groups because an issue MOVES between them while it is read --
    // a card opened on a working row must survive its acceptance.
    // Mutation: search only the open sheet's group (drop `before`, or any
    // other) -> that sheet's rows open nothing at all, red.
    for (const [sheet, identifier] of [
      ['Before', 'EX-DONE'],
      ['Next', 'EX-NEXT'],
    ] as const) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^${sheet} · `) }),
      )
      fireEvent.click(
        document.querySelector(
          `[data-wave-row="crew-1:${identifier}"]`,
        ) as HTMLElement,
      )
      expect(
        document.querySelector(`[data-loom-detail="crew-1:${identifier}"]`),
      ).toBeTruthy()
      fireEvent.click(
        screen.getByRole('button', { name: 'Close the issue detail' }),
      )
    }
  })

  it('MAR-3195 R5: closing gives back the scroll and the focus', async () => {
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    const body = document.querySelector(
      '[data-loom-sheet="now"]',
    ) as HTMLElement
    fireEvent.scroll(body, { target: { scrollTop: 240 } })

    const row = document.querySelector(
      '[data-wave-row="crew-1:EX-2"]',
    ) as HTMLElement
    row.focus()
    fireEvent.click(row)
    // Focus starts inside the card, so Esc and Tab have somewhere to be.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close the issue detail' }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Close the issue detail' }),
    )
    // Mutation: drop the focus restore -> `<body>`, and the keyboard has
    // lost the place it was reading from.
    expect(document.activeElement).toBe(
      document.querySelector('[data-wave-row="crew-1:EX-2"]'),
    )
    expect(
      (document.querySelector('[data-loom-sheet="now"]') as HTMLElement)
        .scrollTop,
    ).toBe(240)
  })

  it('MAR-3195 R5: in expanded, the first Esc closes the detail and the second folds', async () => {
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-2"]') as HTMLElement,
    )
    expect(document.querySelector('[data-loom-detail]')).toBeTruthy()

    const stack = document.querySelector(
      '[data-loom="expanded"]',
    ) as HTMLElement
    // Mutation: fold on the first Esc -> the stack is gone here, and a person
    // reading an issue loses the whole panel to one keystroke.
    await act(async () => {
      fireEvent.keyDown(stack, { key: 'Escape' })
    })
    expect(document.querySelector('[data-loom-detail]')).toBeNull()
    expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(
        document.querySelector('[data-loom="expanded"]') as HTMLElement,
        { key: 'Escape' },
      )
    })
    expect(document.querySelector('[data-loom="expanded"]')).toBeNull()
  })

  it('MAR-3195 R6: the detail is read-only, provably', async () => {
    // WITH labels, or the chips this rule is mostly about do not exist and
    // turning one into a button proves nothing.
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: rows.map((row) =>
          row.issueIdentifier === 'EX-2'
            ? {
                ...row,
                fact: {
                  ...row.fact,
                  labels: ['groomed', 'horse › opus', 'loom-view'],
                },
              }
            : row,
        ),
        trackerHealth: health('ok'),
      },
    }
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-2"]') as HTMLElement,
    )
    const card = document.querySelector('[data-loom-detail]') as HTMLElement

    // Mutation: a label chip as a `button`, or any field added -> red.
    expect(card.querySelectorAll('input, select, textarea')).toHaveLength(0)
    expect(
      within(card).getByRole('region', { name: 'Labels' }).textContent,
    ).toContain('groomed')
    expect(card.querySelectorAll('[contenteditable]')).toHaveLength(0)
    expect(
      [...card.querySelectorAll('button')].map((button) =>
        (button.getAttribute('aria-label') ?? button.textContent ?? '').trim(),
      ),
    ).toEqual(['Close the issue detail', 'Open conversation →'])
    // Every door out is an anchor the main process routes to the browser
    // (EX-2 has no PR, so here that is the Linear one alone).
    // Mutation: an anchor without `target="_blank"` -> it would navigate the
    // app's own window away from Convergence, red.
    const anchors = [...card.querySelectorAll('a')]
    expect(anchors.length).toBeGreaterThan(0)
    expect(anchors.every((a) => a.getAttribute('target') === '_blank')).toBe(
      true,
    )
    expect(anchors.every((a) => a.getAttribute('rel') === 'noreferrer')).toBe(
      true,
    )
    expect(
      anchors.some((a) =>
        (a.getAttribute('href') ?? '').includes('linear.app'),
      ),
    ).toBe(true)
  })

  it('MAR-3195 R7: one card, both shapes', async () => {
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-2"]') as HTMLElement,
    )
    const compact = (
      document.querySelector('[data-loom-detail]') as HTMLElement
    ).textContent
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
    const expanded = (
      document.querySelector('[data-loom-detail]') as HTMLElement
    ).textContent
    // Mutation: a second detail component for expanded -> the text differs
    // or the card is absent, red.
    expect(expanded).toBe(compact)
  })

  it('MAR-3195: a horse card’s Details button opens its held issue', async () => {
    crews = [
      { ...boundCrew('crew-1', 'Loom'), members: [residentSeat('opus')] },
    ]
    useSessionStore.setState({
      globalSessions: [
        { ...SESSION, id: 'session-opus', status: 'running' } as SessionSummary,
      ],
    })
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'MAR-9',
            state: 'working',
            seat: 'opus',
            sessionId: 'session-opus',
          }),
        ],
        trackerHealth: health('ok'),
      },
    }

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    // A held working row is listed nowhere else (LV2 R4), so the card is
    // that issue's only door. Mutation: drop the Details button -> the one
    // issue a horse is actually on cannot be read at all, red.
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(
      document.querySelector('[data-loom-detail="crew-1:MAR-9"]'),
    ).toBeTruthy()
  })

  it('MAR-3189 lap 2, B: the mode is written down, and a remount reads it back', async () => {
    // The only write-through-a-control-then-remount pin the mode had died
    // with the stored `rail`; without this one, dropping `saveWavePanelMode`
    // left every test green. Mutation: drop the save -> red twice below.
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Expand Loom' }),
      )
    })
    expect(localStorage.getItem('convergence-wave-panel-mode')).toBe('expanded')
    cleanup()

    await mount(<WavePanel reservedWidth={RESERVED} />)
    expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fold Loom' }))
    })
    expect(localStorage.getItem('convergence-wave-panel-mode')).toBe('compact')
    cleanup()

    await mount(<WavePanel reservedWidth={RESERVED} />)
    expect(await screen.findByLabelText('Loom')).toBeTruthy()
    expect(document.querySelector('[data-loom="expanded"]')).toBeNull()
  })

  it('MAR-3189 R1: four titles, one sheet’s rows, and the others a click away', async () => {
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')

    const titles = () =>
      [...document.querySelectorAll('[data-loom-sheet-title]')].map((node) =>
        node.getAttribute('data-loom-sheet-title'),
      )
    // Mutation: render only the open sheet's title -> one button, red.
    expect(titles()).toEqual(['before', 'now', 'next', 'plan'])
    for (const sheet of LOOM_SHEETS) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(`^${LOOM_SHEET_NAMES[sheet]} · `),
        }),
      ).toBeTruthy()
    }

    // Now opens by default, and it is the ONLY body in the DOM.
    expect(document.querySelector('[data-loom-sheet="now"]')).toBeTruthy()
    expect(document.querySelectorAll('[data-loom-sheet]')).toHaveLength(1)
    expect(rowOf('crew-1:EX-2').getByText('Work EX-2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Next · / }))
    // Mutation: leave the previous sheet rendered -> two bodies, red.
    expect(document.querySelector('[data-loom-sheet="next"]')).toBeTruthy()
    expect(document.querySelector('[data-loom-sheet="now"]')).toBeNull()
    expect(titles()).toEqual(['before', 'now', 'next', 'plan'])
    expect(document.querySelector('[data-wave-row="crew-1:EX-3"]')).toBeTruthy()
    expect(document.querySelector('[data-wave-row="crew-1:EX-2"]')).toBeNull()
  })

  it('MAR-3189 R7: the titles are buttons, so the keyboard opens a sheet', async () => {
    await mount(<WavePanel reservedWidth={RESERVED} />)
    const next = await screen.findByRole('button', { name: /^Next · / })
    // A `div` with an onClick would take neither of these without a handler
    // of our own. Mutation: render the titles as `div`s -> no button role to
    // find, red.
    expect(next.tagName).toBe('BUTTON')
    next.focus()
    fireEvent.keyDown(next, { key: 'Enter' })
    fireEvent.click(next)
    expect(next.getAttribute('aria-expanded')).toBe('true')
  })

  it('MAR-3189 R3/R7: Expand and Fold keep the sheet, the width, the scroll and the focus', async () => {
    localStorage.setItem('convergence-wave-panel-width', '360')
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    expect(columnWidth()).toBe('360px')

    fireEvent.click(screen.getByRole('button', { name: /^Next · / }))
    const body = document.querySelector(
      '[data-loom-sheet="next"]',
    ) as HTMLElement
    fireEvent.scroll(body, { target: { scrollTop: 240 } })
    expect(body.scrollTop).toBe(240)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
    expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()
    // The sheet travels with the shape: expanded opens on Next too.
    // Mutation: fold (or expand) to `now` -> red.
    expect(document.querySelector('[data-loom-sheet="next"]')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fold Loom' }))
    })
    const folded = await screen.findByRole('button', { name: /^Next · / })
    expect(folded.getAttribute('aria-expanded')).toBe('true')
    expect(columnWidth()).toBe('360px')
    // Mutation: drop the scroll ref (or key it on nothing) -> 0 here, red.
    expect(
      (document.querySelector('[data-loom-sheet="next"]') as HTMLElement)
        .scrollTop,
    ).toBe(240)
    // Mutation: drop the focus restore -> `document.body`, red.
    expect(document.activeElement).toBe(folded)
  })

  it('MAR-3189 R7 + lap 2, C: Esc folds from wherever focus actually is', async () => {
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })

    // The Expand button left the document with the compact stack, so without
    // the rising-edge focus the keyboard is on `<body>` and a real Escape
    // never reaches the stack's handler -- which the old test could not see,
    // because it dispatched the key AT the element.
    // Mutation: focus only on the falling edge -> activeElement is the body
    // here, and the keypress below folds nothing, red.
    const openTitle = document.querySelector(
      '[data-loom="expanded"] [data-loom-sheet-title][aria-expanded="true"]',
    ) as HTMLElement
    expect(document.activeElement).toBe(openTitle)

    // Mutation: drop the Escape branch -> the stack stays, red.
    await act(async () => {
      fireEvent.keyDown(document.activeElement as HTMLElement, {
        key: 'Escape',
      })
    })
    expect(document.querySelector('[data-loom="expanded"]')).toBeNull()
    expect(await screen.findByLabelText('Loom')).toBeTruthy()
  })
})

describe('MAR-3085 R7: the row reads the lap, the cap and the ruling', () => {
  it('a stopped lap reads its lap, the verdict word, and "re-groom (Fable)"', () => {
    render(
      <WavePanelView
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
      <LoomStripView
        sheets={loomSheets(
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
        onExpand={vi.fn()}
      />,
    )
    // The strip reads the same sheets, so the count follows R2 for free: a
    // blocked working row is counted ONCE, under Now.
    // Mutation: count `now.inFlight` and `now.decide` separately -> 2, red.
    expect(screen.getByLabelText('Now: 1')).toBeTruthy()
    expect(screen.getByLabelText('Before: 0')).toBeTruthy()
  })
})

describe('MAR-3148: the rail, the props and the clock', () => {
  const rows = [ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })]

  it('MAR-3189: the strip’s Expand is a live control with one job', () => {
    // MAR-3148 R1 lived here: the rail's Open could not act in a window too
    // narrow for the column, so it carried its reason in its accessible name
    // and refused the click. That state is gone -- the stored `rail` mode is
    // gone with it (R1), and Expand opens the content area, which no window
    // is too narrow for. What survives from that law is the shape of the
    // control: named, focusable, and it does what its name says.
    const onExpand = vi.fn()
    render(
      <LoomStripView
        sheets={loomSheets(rows, NOW)}
        outage={false}
        onExpand={onExpand}
      />,
    )
    const expand = screen.getByRole('button', { name: 'Expand Loom' })
    expect(expand.hasAttribute('disabled')).toBe(false)
    expect(expand.getAttribute('aria-disabled')).toBeNull()
    expand.focus()
    expect(document.activeElement).toBe(expand)
    // Mutation: swallow the click while the window is narrow -> red.
    fireEvent.click(expand)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('C: a row that cannot open its seat is inert and says so', () => {
    render(
      <WavePanelView
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
    // `layout`, `onCollapse` and `width` left with the column (MAR-3189
    // lap 2, G): this view is Mission Control's tab and nothing else.
    // Mutation: reintroduce `onConnectTracker` (or any of the three) -> red.
    expectTypeOf<keyof WavePanelViewProps>().toEqualTypeOf<
      'sections' | 'header' | 'boardLine' | 'inertReason' | 'onOpen'
    >()
    renderView([], [])
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
