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
import { WavePanel } from './wave-panel.container'
import { LoomStripView } from './loom-strip.presentational'
import { loomSheets } from './loom-sheets.pure'
import { LOOM_SHEETS, LOOM_SHEET_NAMES } from './wave-panel-sheet.pure'
import {
  WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
  WAVE_PANEL_MAX_COLUMN_WIDTH,
  WAVE_PANEL_MIN_COLUMN_WIDTH,
  WAVE_PANEL_MIN_MAIN_WIDTH,
  WAVE_PANEL_WIDTH_STEP,
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

describe('MAR-3189 R4: the strip is the same model', () => {
  it('shows the four sheet counts and the outage dot', () => {
    const rows = [
      ledgerEntry({ issueIdentifier: 'EX-1', state: 'reviewed' }),
      ledgerEntry({ issueIdentifier: 'EX-2', state: 'working' }),
      ledgerEntry({ issueIdentifier: 'EX-3', state: 'assigned' }),
      ledgerEntry({ issueIdentifier: 'EX-4', state: 'done' }),
    ]
    const sheets = loomSheets(rows, NOW)
    render(
      <LoomStripView
        sheets={sheets}
        now={NOW}
        horses={[]}
        outage
        onExpand={vi.fn()}
      />,
    )

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
        horses={[]}
        sheets={loomSheets([], NOW)}
        now={NOW}
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

  /**
   * Every call the preload mock has taken. The guide is a lesson, not a
   * dashboard: from open to close this number must not move (MAR-3201 R8).
   */
  function preloadCalls() {
    const api = (
      window as unknown as {
        electronAPI: Record<
          string,
          Record<string, { mock?: { calls: unknown[] } }>
        >
      }
    ).electronAPI
    return Object.values(api)
      .flatMap((group) => Object.values(group))
      .reduce((sum, fn) => sum + (fn.mock?.calls.length ?? 0), 0)
  }

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

  it('B: a bound crew -> the column', async () => {
    await mount(<WavePanel />)
    expect(await screen.findByLabelText('Loom')).toBeTruthy()
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

  it('MAR-3155 lap 3, B: a drag that ends after the last bound crew went away stores nothing', async () => {
    // The one reason a column leaves the screen mid-drag now the Waves tab
    // is retired (MAR-3233): the crew list changes over IPC while the
    // pointer is down.
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

    // The reason travels INTO the detail (lap 2, A). Asserted inside the
    // card: on the sheet, `conversation not loaded` is also the ROW's own
    // span -- so the old assertion passed whether or not a detail opened.
    fireEvent.click(
      screen.getByRole('button', { name: 'Close the issue detail' }),
    )
    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-4"]') as HTMLElement,
    )
    const card = document.querySelector('[data-loom-detail]') as HTMLElement
    expect(card).toBeTruthy()
    expect(within(card).getByText('conversation not loaded')).toBeTruthy()
    expect(
      within(card).getByText(
        'The horse label alone does not identify a running conversation.',
      ),
    ).toBeTruthy()
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

  it('MAR-3189 R2/R6: the four sheets together hold exactly the ledger’s rows', async () => {
    const keys = () =>
      [...document.querySelectorAll('[data-wave-row]')]
        .map((node) => node.getAttribute('data-wave-row'))
        .sort()

    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    // One sheet at a time (R1), so the panel's rows are the UNION of the four
    // -- which is the rendered half of R2's "every row lands in exactly one
    // sheet", read against the snapshot itself: the ledger is the oracle.
    // Mutation: send a row to two sheets -> a duplicate key here, red; drop
    // the `else` that catches `unassigned`/`stopped` -> short, red.
    const seen = new Set<string>()
    for (const sheet of LOOM_SHEETS) {
      fireEvent.click(
        screen.getByRole('button', {
          name: new RegExp(`^${LOOM_SHEET_NAMES[sheet]} · `),
        }),
      )
      for (const key of keys()) seen.add(key as string)
    }
    expect([...seen].sort()).toEqual(
      rows.map((row) => `crew-1:${row.issueIdentifier}`).sort(),
    )
    expect(rows.length).toBeGreaterThan(0)
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
      render(<WavePanel reservedWidth={RESERVED} />)
    })
    await screen.findByLabelText('Loom')

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

  it('MAR-3195 lap 2, A: a Plan row with no seat opens its detail', async () => {
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'EX-PLAN',
            state: 'assigned',
            seat: null,
            sessionId: null,
          }),
        ],
        trackerHealth: health('ok'),
      },
    }
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    fireEvent.click(screen.getByRole('button', { name: /^Plan · / }))

    const row = document.querySelector(
      '[data-wave-row="crew-1:EX-PLAN"]',
    ) as HTMLElement
    // A Plan issue has no seat, so its conversation can never open — and
    // that is exactly the issue a person most wants to read.
    // Mutation: pass the conversation's `inertReason` to Loom's rows -> the
    // row is an inert `div`, the click does nothing, red.
    expect(row.tagName).toBe('BUTTON')
    fireEvent.click(row)
    const card = document.querySelector(
      '[data-loom-detail="crew-1:EX-PLAN"]',
    ) as HTMLElement
    expect(card).toBeTruthy()
    expect(within(card).getByText('no conversation for this seat')).toBeTruthy()
    expect(
      within(card).queryByRole('button', { name: 'Open conversation →' }),
    ).toBeNull()
  })

  it('MAR-3195 lap 2, B: the sheet’s scroll survives a detail', async () => {
    setWindowWidth(windowLeaving(900))
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    const body = () =>
      document.querySelector('[data-loom-sheet="now"]') as HTMLElement
    fireEvent.scroll(body(), { target: { scrollTop: 240 } })

    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-2"]') as HTMLElement,
    )
    // What Chromium does: the short card clamps the container and fires a
    // scroll. jsdom never would, so the event is fired by hand -- without
    // it this case cannot see the defect at all.
    // Mutation: do not freeze the saved offset -> 0 is written over 240 and
    // the sheet's memory is destroyed, red here and on the fold below.
    fireEvent.scroll(body(), { target: { scrollTop: 0 } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Close the issue detail' }),
    )
    expect(body().scrollTop).toBe(240)

    // ...and MAR-3189 R3 still holds for that sheet afterwards.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fold Loom' }))
    })
    expect(body().scrollTop).toBe(240)
  })

  it('MAR-3195 lap 2, C: a row that vanishes takes its key with it', async () => {
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
    })
    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-2"]') as HTMLElement,
    )
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

    // Mutation: leave the key behind -> `onEscape` still claims Escape and
    // this press silently does nothing, red.
    await act(async () => {
      fireEvent.keyDown(
        document.querySelector('[data-loom="expanded"]') as HTMLElement,
        { key: 'Escape' },
      )
    })
    expect(document.querySelector('[data-loom="expanded"]')).toBeNull()

    // ...and the identifier coming back does not re-open a card nobody asked
    // for.
    await act(async () => {
      useWorkLedgerStore.setState({
        snapshots: {
          'crew-1': {
            crewId: 'crew-1',
            entries: rows,
            trackerHealth: health('ok'),
          },
        },
      })
    })
    expect(document.querySelector('[data-loom-detail]')).toBeNull()
  })

  it('MAR-3195 lap 2, E: focus returns to the Details button it came from', async () => {
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

    const details = screen.getByRole('button', { name: 'Details' })
    details.focus()
    fireEvent.click(details)
    fireEvent.click(
      screen.getByRole('button', { name: 'Close the issue detail' }),
    )
    // Mutation: remember `[data-loom-horse="…"] button` -> focus lands on
    // the card's own Open button, and Escape-then-Enter leaves the board.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Details' }),
    )
  })

  it('MAR-3195 lap 2, F: the PR block, with a PR and without one', async () => {
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'EX-PR',
            state: 'reviewed',
            seat: 'opus',
            sessionId: 'session-opus',
            pr: {
              number: 707,
              url: 'https://github.com/example/repo/pull/707',
              state: 'merged',
              headBranch: 'agent/ex-pr',
              checkedAt: '2026-09-17T12:05:00.000Z',
              source: 'gh',
              title: 'feat(accounts): connectors for Codex accounts',
            },
          }),
          ledgerEntry({
            issueIdentifier: 'EX-NOPR',
            state: 'reviewed',
            seat: 'opus',
            sessionId: 'session-opus',
          }),
        ],
        trackerHealth: health('ok'),
      },
    }
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')

    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-PR"]') as HTMLElement,
    )
    const withPr = within(
      document.querySelector('[data-loom-detail]') as HTMLElement,
    )
    expect(withPr.getByText('PR #707 · merged')).toBeTruthy()
    expect(
      withPr.getByText('feat(accounts): connectors for Codex accounts'),
    ).toBeTruthy()
    // The always-on sentence a person reads. Mutation: drop `ci` from the
    // joined line -> red; before this case, no test at any layer saw it.
    expect(withPr.getByText(/CI status not seen/)).toBeTruthy()
    expect(
      withPr.getByRole('link', { name: /PR #707/ }).getAttribute('href'),
    ).toBe('https://github.com/example/repo/pull/707')
    expect(withPr.getByText(/opus · lap 1/)).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Close the issue detail' }),
    )
    fireEvent.click(
      document.querySelector('[data-wave-row="crew-1:EX-NOPR"]') as HTMLElement,
    )
    expect(
      within(
        document.querySelector('[data-loom-detail]') as HTMLElement,
      ).getByText('No linked pull request'),
    ).toBeTruthy()
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

  it('MAR-3195 lap 2, D: the detail’s horse is found by identity, not by name', async () => {
    crews = [
      {
        ...boundCrew('crew-1', 'Loom'),
        members: [
          residentSeat('opus', { sessionId: 'session-local' }),
          residentSeat('opus', {
            sessionId: 'session-remote',
            hostPolicy: 'endpoint-2',
          }),
        ],
      },
    ]
    useSessionStore.setState({
      globalSessions: [
        {
          ...SESSION,
          id: 'session-local',
          status: 'running',
        } as SessionSummary,
        {
          ...SESSION,
          id: 'session-remote',
          status: 'running',
          executionHost: 'endpoint-2',
        } as SessionSummary,
      ],
    })
    snapshots = {
      'crew-1': {
        crewId: 'crew-1',
        entries: [
          ledgerEntry({
            issueIdentifier: 'EX-REMOTE',
            state: 'reviewed',
            seat: 'opus',
            sessionId: 'session-remote',
          }),
        ],
        trackerHealth: health('ok'),
      },
    }
    await mount(<WavePanel reservedWidth={RESERVED} />)
    await screen.findByLabelText('Loom')
    fireEvent.click(
      document.querySelector(
        '[data-wave-row="crew-1:EX-REMOTE"]',
      ) as HTMLElement,
    )

    // Two residents share the name `opus`; the row is joined to the remote
    // one's conversation. Mutation: match on `crewId + seat` -> the FIRST
    // card wins and the detail names This Mac, red.
    const card = document.querySelector('[data-loom-detail]') as HTMLElement
    expect(card.textContent).toContain('endpoint-2')
    // The half that makes it a real refutation: the wrong horse is the LOCAL
    // one, so its host must be absent, not merely outnumbered.
    expect(card.textContent).not.toContain('This Mac')
  })

  describe('MAR-3193: the Next sheet', () => {
    const READY = { groomed: true, grounded: true, dispatch: true }

    const queued = (
      identifier: string,
      facts: Record<string, boolean | number | null> = READY,
      seat: string | null = 'opus',
      sessionId: string | null = 'session-opus',
    ) =>
      ledgerEntry({
        issueIdentifier: identifier,
        state: 'assigned',
        seat,
        sessionId,
        fact: {
          logicalStatus: null,
          branchName: null,
          updatedAt: null,
          ...facts,
        },
      })

    const openNext = async (entries: WorkLedgerEntry[]) => {
      crews = [
        { ...boundCrew('crew-1', 'Loom'), members: [residentSeat('opus')] },
      ]
      snapshots = {
        'crew-1': { crewId: 'crew-1', entries, trackerHealth: health('ok') },
      }
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      fireEvent.click(screen.getByRole('button', { name: /^Next · / }))
    }

    const nextBody = () =>
      document.querySelector('[data-loom-sheet="next"]') as HTMLElement

    const QUEUE = [
      queued('MAR-21', { ...READY, priority: 1 }),
      queued('MAR-20', { ...READY, priority: 3 }),
      queued('MAR-30', { groomed: true, priority: 1 }),
      queued('MAR-99', READY, 'ghost', null),
    ]

    it('R1 + R4: one group per horse, saying what it is doing', async () => {
      useSessionStore.setState({
        globalSessions: [
          {
            ...SESSION,
            id: 'session-opus',
            status: 'running',
          } as SessionSummary,
        ],
      })
      await openNext([
        ...QUEUE,
        ledgerEntry({
          issueIdentifier: 'MAR-9',
          state: 'working',
          seat: 'opus',
          sessionId: 'session-opus',
        }),
      ])

      const body = nextBody()
      expect(
        [...body.querySelectorAll('[data-wave-hint]')].map((node) => [
          node.getAttribute('data-wave-hint'),
          node.textContent,
        ]),
      ).toEqual([['opus', 'This Mac · Working on MAR-9 · 3 queued']])
      // The stray is drawn last, in its own group, saying whose seat the
      // label named. Mutation: match on the seat name across crews -> it
      // would be claimed by opus and this group would not exist, red.
      expect(
        within(body).getByText('seat "ghost" not in the crew'),
      ).toBeTruthy()
      expect(
        [...body.querySelectorAll('h3')].map((node) => node.textContent),
      ).toEqual(['opus · 3', 'No seat named in this crew · 1'])
      // The running row is NOT in the queue; the footer says where it is.
      expect(body.querySelector('[data-wave-row="crew-1:MAR-9"]')).toBeNull()
      expect(
        within(body).getByText(
          'Order: priority, then issue number · running work stays in Now',
        ),
      ).toBeTruthy()
      expect(body.textContent).not.toContain('Paused')
      expect(body.textContent).not.toContain('dispatch rule')
    })

    it('R2 + R3: Ready is numbered in order; Preparing says what is missing', async () => {
      await openNext(QUEUE)
      const words = [...nextBody().querySelectorAll('[data-wave-row]')].map(
        (node) => node.getAttribute('data-wave-row'),
      )
      // Priority 1 before priority 3, and Preparing after Ready.
      expect(words).toEqual([
        'crew-1:MAR-21',
        'crew-1:MAR-20',
        'crew-1:MAR-30',
        'crew-1:MAR-99',
      ])
      expect(rowOf('crew-1:MAR-21').getByText('1 · ready')).toBeTruthy()
      expect(rowOf('crew-1:MAR-20').getByText('2 · ready')).toBeTruthy()
      expect(
        rowOf('crew-1:MAR-30').getByText('needs grounded · dispatch'),
      ).toBeTruthy()
    })

    it('R5: the title splits ready from preparing', async () => {
      await openNext(QUEUE)
      // Mutation: N from `sheets.next.length` -> `Next · 4 ready`, red.
      expect(screen.getByRole('button', { name: /^Next · / }).textContent).toBe(
        'Next · 2 ready · 2 preparing',
      )
      cleanup()

      await openNext([queued('MAR-21')])
      expect(screen.getByRole('button', { name: /^Next · / }).textContent).toBe(
        'Next · 1 ready',
      )
    })

    it('R6: the only thing you can press is a row', async () => {
      await openNext(QUEUE)
      const body = nextBody()
      expect(
        body.querySelectorAll(
          'input, select, textarea, [contenteditable="true"]',
        ),
      ).toHaveLength(0)
      // Mutation: a stray control on the sheet -> red.
      const controls = [
        ...body.querySelectorAll('button, summary, a[href], [role="button"]'),
      ]
      expect(
        controls.filter((node) => !node.closest('[data-wave-row]')),
      ).toHaveLength(0)
      expect(controls).toHaveLength(4)

      fireEvent.click(
        body.querySelector('[data-wave-row="crew-1:MAR-30"]') as HTMLElement,
      )
      expect(
        document.querySelector('[data-loom-detail="crew-1:MAR-30"]'),
      ).toBeTruthy()
    })

    it('lap 2, B: an empty Next says nothing about an order', async () => {
      await openNext([])
      const body = nextBody()
      // Mutation: render the footer unconditionally -> a sheet with no
      // queue at all explains the order of nothing, red.
      expect(body.textContent).not.toContain('Order: priority')
      expect(body.querySelectorAll('[data-wave-row]')).toHaveLength(0)
      expect(within(body).getByText('Nothing in Next right now.')).toBeTruthy()
    })

    it('lap 2, A: a seat whose conversation is gone still owns its queue', async () => {
      // The backend nulls the row's `sessionId` when the conversation is
      // deleted, while the crew member keeps its id.
      crews = [
        {
          ...boundCrew('crew-1', 'Loom'),
          members: [residentSeat('opus', { conversationMissing: true })],
        },
      ]
      snapshots = {
        'crew-1': {
          crewId: 'crew-1',
          entries: [queued('MAR-5', READY, 'opus', null)],
          trackerHealth: health('ok'),
        },
      }
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      fireEvent.click(screen.getByRole('button', { name: /^Next · / }))

      const body = nextBody()
      expect(
        [...body.querySelectorAll('h3')].map((node) => node.textContent),
      ).toEqual(['opus · 1'])
      expect(within(body).getByText('seat has no conversation')).toBeTruthy()
      expect(body.textContent).not.toContain('not in the crew')
      expect(screen.getByRole('button', { name: /^Next · / }).textContent).toBe(
        'Next · 0 ready · 1 preparing',
      )
    })

    it('R7: compact and expanded say the same thing', async () => {
      await openNext(QUEUE)
      const readNext = () => {
        const body = nextBody()
        return {
          titles: [...body.querySelectorAll('h3')].map((n) => n.textContent),
          capacity: [...body.querySelectorAll('[data-wave-hint]')].map(
            (n) => n.textContent,
          ),
          rows: [...body.querySelectorAll('[data-wave-row]')].map(
            (n) => n.textContent,
          ),
        }
      }
      const compact = readNext()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
      })
      expect(readNext()).toEqual(compact)
      // Not vacuous.
      expect(compact.titles).toEqual([
        'opus · 3',
        'No seat named in this crew · 1',
      ])
      expect(compact.capacity).toHaveLength(1)
      expect(compact.rows).toHaveLength(4)
    })
  })

  describe('MAR-3194: the Plan sheet', () => {
    /** The instant and day these cases call "today"; written down here. */
    const PLAN_NOW = Date.parse('2026-09-19T12:00:00.000Z')
    const PLAN_TODAY = '2026-09-19'

    const planEntry = (
      identifier: string,
      state: WorkLedgerEntry['state'],
      facts: Record<string, boolean> = {},
      groundedAt: string | null = null,
    ) =>
      ledgerEntry({
        issueIdentifier: identifier,
        state,
        seat: null,
        sessionId: null,
        groundedAt,
        fact: {
          logicalStatus: null,
          branchName: null,
          updatedAt: null,
          ...facts,
        },
      })

    const openPlan = async (entries: WorkLedgerEntry[]) => {
      vi.setSystemTime(PLAN_NOW)
      snapshots = {
        'crew-1': { crewId: 'crew-1', entries, trackerHealth: health('ok') },
      }
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      fireEvent.click(screen.getByRole('button', { name: /^Plan · / }))
    }

    const planBody = () =>
      document.querySelector('[data-loom-sheet="plan"]') as HTMLElement

    const FOUR_STAGES = [
      planEntry('EX-DEFINE', 'assigned', { groomMe: true }),
      planEntry('EX-GROUND', 'assigned', { groomed: true }),
      planEntry(
        'EX-ASSIGN',
        'assigned',
        { groomed: true, grounded: true },
        PLAN_TODAY,
      ),
      planEntry('EX-STOP', 'stopped'),
    ]

    afterEach(() => {
      vi.useRealTimers()
    })

    it('R3: every stage explains itself, and nothing else grew a hint', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await openPlan(FOUR_STAGES)

      const hints = [...planBody().querySelectorAll('[data-wave-hint]')].map(
        (node) => [node.getAttribute('data-wave-hint'), node.textContent],
      )
      expect(hints).toEqual([
        ['Define', 'Clarify intent and acceptance'],
        ['Ground in code', 'Check the proposal against current code'],
        ['Assign & clear', 'Choose the horse, then clear it to run'],
        ['Re-groom', 'A lap stopped — the issue goes back to grooming'],
      ])
    })

    it('R2: each row says what it lacks, in its own words', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await openPlan(FOUR_STAGES)
      // Mutation: leave `action` at `waveRowAction`'s null -> the rows go
      // silent about what they are missing, red.
      expect(rowOf('crew-1:EX-DEFINE').getByText('groom-me')).toBeTruthy()
      expect(rowOf('crew-1:EX-GROUND').getByText('not grounded')).toBeTruthy()
      expect(
        rowOf('crew-1:EX-ASSIGN').getByText(
          'no horse assigned · grounded today',
        ),
      ).toBeTruthy()
      expect(rowOf('crew-1:EX-STOP').getByText('re-groom (Fable)')).toBeTruthy()
    })

    it('R5: the title counts preparation; what left is one line', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await openPlan([
        planEntry('EX-1', 'assigned'),
        planEntry('EX-2', 'assigned', { groomed: true }),
        planEntry('EX-3', 'assigned', { groomed: true, grounded: true }),
        planEntry('EX-G1', 'unassigned'),
        planEntry('EX-G2', 'unassigned'),
        planEntry('EX-G3', 'unassigned'),
        planEntry('EX-G4', 'unassigned'),
      ])
      // Mutation: count `sheets.plan.length` -> `Plan · 7 in preparation`
      // over a sheet drawing three, red.
      expect(screen.getByRole('button', { name: /^Plan · / }).textContent).toBe(
        'Plan · 3 in preparation',
      )
      expect(planBody().querySelectorAll('[data-wave-row]')).toHaveLength(3)
      expect(screen.getByText('4 issues left the loop')).toBeTruthy()
      expect(screen.getByText(/nothing here edits an issue/)).toBeTruthy()
      cleanup()

      // Only rows that left: the line alone, and no read-only promise about
      // a sheet with nothing on it.
      await openPlan([planEntry('EX-G1', 'unassigned')])
      expect(screen.getByText('1 issue left the loop')).toBeTruthy()
      expect(screen.queryByText(/nothing here edits an issue/)).toBeNull()
      cleanup()

      // Nothing at all: the sheet's own name, not LV1's retired apology.
      await openPlan([])
      expect(screen.getByText('Nothing in Plan right now.')).toBeTruthy()
      expect(screen.queryByText(/left the loop/)).toBeNull()
      expect(screen.queryByText(/wider read/)).toBeNull()
    })

    it('R6: the only thing you can press is a row', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await openPlan(FOUR_STAGES)
      const body = planBody()

      // Nothing on this sheet takes input.
      expect(
        body.querySelectorAll(
          'input, select, textarea, [contenteditable="true"]',
        ),
      ).toHaveLength(0)

      // Every control inside the sheet is a row, opening its detail. The
      // scan is over CONTROLS, not the sheet's words: "Assign & clear" is a
      // heading and `no horse assigned` is a row's own sentence.
      // Mutation: add an `Assign` button to the sheet -> red.
      const controls = [
        ...body.querySelectorAll('button, summary, a[href], [role="button"]'),
      ]
      const strays = controls.filter((node) => !node.closest('[data-wave-row]'))
      expect(strays).toHaveLength(0)
      expect(controls).toHaveLength(4)

      fireEvent.click(
        body.querySelector('[data-wave-row="crew-1:EX-GROUND"]') as HTMLElement,
      )
      expect(
        document.querySelector('[data-loom-detail="crew-1:EX-GROUND"]'),
      ).toBeTruthy()
    })

    it('R7: compact and expanded say the same thing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await openPlan(FOUR_STAGES)
      const readPlan = () => {
        const body = planBody()
        return {
          headings: [...body.querySelectorAll('h3')].map((n) => n.textContent),
          hints: [...body.querySelectorAll('[data-wave-hint]')].map(
            (n) => n.textContent,
          ),
          rows: [...body.querySelectorAll('[data-wave-row]')].map(
            (n) => n.textContent,
          ),
        }
      }
      const compact = readPlan()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
      })
      expect(readPlan()).toEqual(compact)
      // Not vacuous: all four stages, each with its hint and its row.
      expect(compact.headings).toEqual([
        'Define · 1',
        'Ground in code · 1',
        'Assign & clear · 1',
        'Re-groom · 1',
      ])
      expect(compact.hints).toHaveLength(4)
      expect(compact.rows).toHaveLength(4)
    })
  })

  describe('MAR-3192: the Before sheet', () => {
    /** The instant these cases call "now"; written down, never inherited. */
    const BEFORE_NOW = Date.parse('2026-09-19T12:00:00.000Z')
    const DAY = 24 * 60 * 60 * 1000
    const doneAt = (identifier: string, wave: string | null, days: number) =>
      ledgerEntry({
        issueIdentifier: identifier,
        state: 'done',
        wave,
        seenAt: new Date(BEFORE_NOW - days * DAY).toISOString(),
      })

    const openBefore = async (entries: ReturnType<typeof ledgerEntry>[]) => {
      vi.setSystemTime(BEFORE_NOW)
      snapshots = {
        'crew-1': { crewId: 'crew-1', entries, trackerHealth: health('ok') },
      }
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      fireEvent.click(screen.getByRole('button', { name: /^Before · / }))
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('R6: groups by wave, the newest open and the rest folded', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await openBefore([
        doneAt('EX-1', 'loom-view', 1),
        doneAt('EX-2', 'loom-view', 2),
        doneAt('EX-3', 'cursor-parity', 5),
      ])

      const groups = [...document.querySelectorAll('[data-wave-group]')]
      expect(groups.map((g) => g.getAttribute('data-wave-group'))).toEqual([
        'loom-view',
        'cursor-parity',
      ])
      // Mutation: every group `closed` -> the newest work is folded away and
      // the sheet opens on nothing, red.
      expect(groups[0]?.hasAttribute('open')).toBe(true)
      expect(groups[1]?.hasAttribute('open')).toBe(false)
      expect(groups[0]?.querySelector('summary')?.textContent).toBe(
        'loom-view · 2',
      )

      // ...and a Before row still opens its detail (LV6).
      fireEvent.click(
        document.querySelector('[data-wave-row="crew-1:EX-1"]') as HTMLElement,
      )
      expect(
        document.querySelector('[data-loom-detail="crew-1:EX-1"]'),
      ).toBeTruthy()
    })

    it('R5: the four things the sheet can say', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      // Some shown, some older: both sentences.
      await openBefore([doneAt('EX-NEW', 'w', 1), doneAt('EX-OLD', 'w', 30)])
      expect(screen.getByText('1 older issue not shown')).toBeTruthy()
      expect(
        screen.getByText(/Done is the issue’s tracker status/),
      ).toBeTruthy()
      cleanup()

      // Nothing older: the Done sentence alone.
      await openBefore([doneAt('EX-NEW', 'w', 1)])
      expect(screen.queryByText(/older issue/)).toBeNull()
      expect(
        screen.getByText(/Done is the issue’s tracker status/),
      ).toBeTruthy()
      cleanup()

      // Only older work: the older line alone, and no claim about releases.
      await openBefore([doneAt('EX-OLD', 'w', 30)])
      expect(screen.getByText('1 older issue not shown')).toBeTruthy()
      // Mutation: always render the Done sentence -> red here and below.
      expect(
        screen.queryByText(/Done is the issue’s tracker status/),
      ).toBeNull()
      cleanup()

      // Nothing at all: the sheet's own note, unchanged from LV0.
      await openBefore([])
      expect(screen.getByText('Nothing in Before right now.')).toBeTruthy()
      expect(screen.queryByText(/older issue/)).toBeNull()
      expect(
        screen.queryByText(/Done is the issue’s tracker status/),
      ).toBeNull()
    })

    it('R4: the title counts what the sheet shows', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await openBefore([
        doneAt('EX-1', 'w', 1),
        doneAt('EX-2', 'w', 2),
        doneAt('EX-3', 'w', 40),
      ])
      // Mutation: count `sheets.before.length` -> `Before · 3 done` over a
      // sheet holding two, red.
      expect(
        screen.getByRole('button', { name: /^Before · / }).textContent,
      ).toBe('Before · 2 done')
      expect(document.querySelectorAll('[data-wave-row]')).toHaveLength(2)
    })

    it('R7: compact and expanded say the same thing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await openBefore([doneAt('EX-1', 'w', 1), doneAt('EX-2', 'x', 2)])
      // Text alone is blind to folding -- a closed <details> keeps its rows
      // in the DOM -- so the shape of the sheet is read too.
      const readBefore = () => {
        const body = document.querySelector(
          '[data-loom-sheet="before"]',
        ) as HTMLElement
        return {
          text: body.textContent,
          folded: [...body.querySelectorAll('[data-wave-group]')].map((g) => [
            g.getAttribute('data-wave-group'),
            g.hasAttribute('open'),
          ]),
        }
      }
      const compact = readBefore()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
      })
      expect(readBefore()).toEqual(compact)
      // Not vacuous: both groups are there, the second one folded.
      expect(compact.folded).toEqual([
        ['w', true],
        ['x', false],
      ])
      expect(compact.text).toContain('EX-1')
    })
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

  describe('MAR-3201: the guide opens over Loom and gives it back', () => {
    const openGuide = async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'How Loom works' }))
      })
      return screen.getByRole('dialog', { name: 'How Loom works' })
    }

    it('R9: an entry in both shells, and the guide never opens by itself', async () => {
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      // Mutation: `useState(true)` for open -> a dialog here, red.
      expect(screen.queryByRole('dialog')).toBeNull()

      // Compact: the control is a sibling of the stack, not inside the sheet
      // that scrolls. Mutation: put the footer inside the sheet body -> red.
      const compactEntry = screen.getByRole('button', {
        name: 'How Loom works',
      })
      expect(compactEntry.closest('[data-loom-sheet]')).toBeNull()
      expect(compactEntry.closest('[data-loom-footer]')).toBeTruthy()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
      })
      expect(screen.queryByRole('dialog')).toBeNull()
      const expandedEntry = screen.getByRole('button', {
        name: 'How Loom works',
      })
      expect(expandedEntry.closest('[data-loom="expanded"]')).toBeTruthy()
      expect(expandedEntry.closest('[data-loom-sheet]')).toBeNull()
    })

    it('lap 3, A: the guide survives the shell it was opened over', async () => {
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      await openGuide()
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Next: assign a horse →' }),
        )
      })
      expect(screen.getByText('2 / 6')).toBeTruthy()

      // Narrow the window until Loom collapses to the strip. Mutation: drop
      // `{guide}` from the strip branch -> the dialog vanishes mid-step and
      // this is red.
      await act(async () => {
        setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
        fireEvent(window, new Event('resize'))
      })
      expect(screen.getByLabelText('Loom strip')).toBeTruthy()
      expect(
        screen.getByRole('dialog', { name: 'How Loom works' }),
      ).toBeTruthy()
      // Still on the step it was on: the guide was never remounted.
      expect(screen.getByText('2 / 6')).toBeTruthy()

      // ...and back again, without the guide losing its place.
      await act(async () => {
        setWindowWidth(1024)
        fireEvent(window, new Event('resize'))
      })
      expect(
        screen.getByRole('dialog', { name: 'How Loom works' }),
      ).toBeTruthy()
      expect(screen.getByText('2 / 6')).toBeTruthy()
    })

    it('lap 3, A: a column that goes away closes the guide, and it stays closed', async () => {
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      await openGuide()

      // The last bound crew goes while the guide is open — the one way a
      // column leaves now the Waves tab is retired (MAR-3233): Loom's
      // column is not drawn at all.
      await act(async () => {
        useSessionCrewStore.setState({ crews: [] })
      })
      expect(screen.queryByRole('dialog')).toBeNull()

      // Mutation: drop the close-on-absent effect -> the guide is still
      // `open`, so coming back re-opens it by itself, which R9 forbids.
      await act(async () => {
        useSessionCrewStore.setState({ crews })
      })
      await screen.findByLabelText('Loom')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('lap 3, B: a reopened guide is born at step one, under its own name', async () => {
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      await openGuide()
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Next: assign a horse →' }),
        )
        fireEvent.click(screen.getByRole('button', { name: 'Quick reference' }))
      })
      expect(
        screen.getByRole('dialog', { name: 'Loom, at a glance' }),
      ).toBeTruthy()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Back to Loom' }))
      })
      expect(screen.queryByRole('dialog')).toBeNull()

      // Every title this reopen puts on screen, in order -- read as the DOM
      // changes, because the defect is a FRAME, not an end state.
      // Mutation: a stable key plus a reset in a `useEffect` on `open` ->
      // the dialog is born "Loom, at a glance" and corrects itself, so two
      // titles are recorded here, red.
      const titles: string[] = []
      const seen = (text: string | null) => {
        if (text && titles[titles.length - 1] !== text) titles.push(text)
      }
      // Read from the RECORDS, not from the live DOM: by the time a callback
      // runs, a correction one commit later has already happened, and a
      // reader that looks at `document` sees only the corrected end state.
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof HTMLElement)) continue
            const title = node.matches('[data-slot="dialog-title"]')
              ? node
              : node.querySelector('[data-slot="dialog-title"]')
            seen(title?.textContent ?? null)
          }
          if (
            record.type === 'characterData' &&
            record.target.parentElement?.closest('[data-slot="dialog-title"]')
          ) {
            seen(record.target.textContent)
          }
        }
      })
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      })
      await openGuide()
      await act(async () => {})
      observer.disconnect()

      expect(titles).toEqual(['How Loom works'])
      expect(screen.getByText('1 / 6')).toBeTruthy()
    })

    it('R6: Escape closes the guide and nothing else, from expanded', async () => {
      snapshots = {
        'crew-1': {
          crewId: 'crew-1',
          entries: [
            ledgerEntry({
              issueIdentifier: 'EX-1',
              state: 'assigned',
              seat: 'opus',
            }),
          ],
          trackerHealth: health('ok'),
        },
      }
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
      })
      fireEvent.click(screen.getByRole('button', { name: /^Next · / }))
      const body = document.querySelector(
        '[data-loom-sheet="next"]',
      ) as HTMLElement
      body.scrollTop = 64
      fireEvent.scroll(body)

      const entry = screen.getByRole('button', { name: 'How Loom works' })
      await openGuide()
      // The trap: a dialog rendered under the shell would deliver this key
      // to the shell's own onKeyDown, which folds Loom. Mutation: render the
      // guide inside `LoomExpandedView` -> the expanded stack is gone here,
      // red.
      await act(async () => {
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      })
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()
      expect(
        screen
          .getByRole('button', { name: /^Next · / })
          .getAttribute('aria-expanded'),
      ).toBe('true')
      expect(
        (document.querySelector('[data-loom-sheet="next"]') as HTMLElement)
          .scrollTop,
      ).toBe(64)
      // Mutation: drop the focus return in `closeGuide` -> the body has it,
      // red.
      expect(document.activeElement).toBe(entry)
    })

    it('R6: the close button gives compact back unchanged, detail and all', async () => {
      snapshots = {
        'crew-1': {
          crewId: 'crew-1',
          entries: [
            ledgerEntry({
              issueIdentifier: 'EX-1',
              state: 'assigned',
              seat: 'opus',
            }),
          ],
          trackerHealth: health('ok'),
        },
      }
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      fireEvent.click(screen.getByRole('button', { name: /^Next · / }))
      fireEvent.click(
        document.querySelector('[data-wave-row="crew-1:EX-1"]') as HTMLElement,
      )
      expect(document.querySelector('[data-loom-detail]')).toBeTruthy()
      const width = (
        document.querySelector('[data-loom="compact"]') as HTMLElement
      ).style.width

      const entry = screen.getByRole('button', { name: 'How Loom works' })
      await openGuide()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Close ×' }))
      })

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.querySelector('[data-loom="compact"]')).toBeTruthy()
      // The issue detail underneath survives the visit.
      expect(document.querySelector('[data-loom-detail]')).toBeTruthy()
      expect(
        (document.querySelector('[data-loom="compact"]') as HTMLElement).style
          .width,
      ).toBe(width)
      expect(document.activeElement).toBe(entry)
    })

    it('R8: illustrative — no crew, no ledger, and the real counts untouched', async () => {
      // A busy board first: the titles behind the dialog keep their numbers.
      snapshots = {
        'crew-1': {
          crewId: 'crew-1',
          entries: [
            ledgerEntry({ issueIdentifier: 'EX-1', state: 'done' }),
            ledgerEntry({ issueIdentifier: 'EX-2', state: 'done' }),
          ],
          trackerHealth: health('ok'),
        },
      }
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      // Read from the DOM, not by role: an open modal hides the rest of the
      // page from assistive queries, which is exactly what it should do.
      const realBefore = () =>
        [...document.querySelectorAll('[data-loom-sheet-title]')]
          .map((node) => node.textContent)
          .find((text) => text?.startsWith('Before · '))
      expect(realBefore()).toBe('Before · 2 done')

      await openGuide()
      expect(realBefore()).toBe('Before · 2 done')
      // Mutation: feed the illustration `board.sheets` -> its Before reads
      // `2 done` at step one instead of `0 done`, red.
      const illustration = document.querySelector(
        '[data-learn-loom-illustration]',
      ) as HTMLElement
      expect(illustration.textContent).toContain('Before0 done')
      expect(illustration.textContent).toContain('Plan1 in preparation')
      cleanup()

      // Now with nothing at all: a bound crew whose ledger is empty. The
      // lesson is the same lesson.
      snapshots = {
        'crew-1': {
          crewId: 'crew-1',
          entries: [],
          trackerHealth: health('ok'),
        },
      }
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      await openGuide()
      const empty = document.querySelector(
        '[data-learn-loom-illustration]',
      ) as HTMLElement
      expect(empty.textContent).toContain('Plan1 in preparation')
      expect(empty.textContent).toContain('Before0 done')
      expect(
        document.querySelector('[data-learn-loom-ticket="DEMO-101"]'),
      ).toBeTruthy()
    })

    it('R8: the guide touches no store and no preload while it is open', async () => {
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      // Counted at the preload, not by spying on the stores' actions: those
      // actions are `useEffect` dependencies in the panel, so replacing one
      // with a spy re-runs the effect and CAUSES the very call the spy is
      // watching. The IPC boundary is where "reads no project data" is
      // actually decidable.
      const before = preloadCalls()
      const snapshotsBefore = useWorkLedgerStore.getState().snapshots

      await openGuide()
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Next: assign a horse →' }),
        )
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Quick reference' }))
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Back to Loom' }))
      })

      // Mutation: have the guide call `board.resolveRow` or a store action
      // on open -> this number moves, red.
      expect(preloadCalls()).toBe(before)
      expect(useWorkLedgerStore.getState().snapshots).toBe(snapshotsBefore)
    })
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

  describe('MAR-3225: one crew at a time', () => {
    /**
     * Two crews with disjoint ledgers, each with its own horse -- and Night
     * shift's tracker down, so its health line is one more thing that must
     * not leak into Loom while Loom shows the other crew.
     */
    beforeEach(() => {
      crews = [
        { ...boundCrew('crew-1', 'Loom'), members: [residentSeat('opus')] },
        {
          ...boundCrew('crew-2', 'Night shift'),
          sessionIds: ['session-night'],
          members: [residentSeat('night')],
        },
      ]
      useSessionStore.setState({
        globalSessions: [
          SESSION,
          {
            ...SESSION,
            id: 'session-night',
            name: 'night',
          } as SessionSummary,
        ],
      })
      snapshots = {
        'crew-1': {
          crewId: 'crew-1',
          entries: [
            ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' }),
            ledgerEntry({
              issueIdentifier: 'EX-2',
              state: 'assigned',
              seat: null,
              sessionId: null,
            }),
          ],
          trackerHealth: health('ok'),
        },
        'crew-2': {
          crewId: 'crew-2',
          entries: [
            ledgerEntry({
              issueIdentifier: 'NS-1',
              crewId: 'crew-2',
              state: 'working',
              seat: 'night',
              sessionId: 'session-night',
            }),
            ledgerEntry({
              issueIdentifier: 'NS-2',
              crewId: 'crew-2',
              state: 'assigned',
              seat: null,
              sessionId: null,
            }),
            ledgerEntry({
              issueIdentifier: 'NS-3',
              crewId: 'crew-2',
              state: 'assigned',
              seat: null,
              sessionId: null,
            }),
          ],
          trackerHealth: {
            ...health('unreachable'),
            since: new Date(Date.now() - 10 * 60_000).toISOString(),
          },
        },
      }
    })

    const crewPicker = () => screen.getByRole('combobox', { name: 'Crew' })

    /** Opens the picker by keyboard, as jsdom has no pointer capture. */
    const openPicker = async () => {
      await act(async () => {
        fireEvent.keyDown(crewPicker(), { key: 'Enter' })
      })
    }

    const pickCrew = async (name: string) => {
      await openPicker()
      await act(async () => {
        fireEvent.keyDown(screen.getByRole('option', { name }), {
          key: 'Enter',
        })
      })
    }

    /**
     * Every issue Loom names on every sheet, opened one after another -- as
     * a row, or as the issue a horse card holds (a held row is on the card
     * and not in the list, MAR-3191 R4).
     */
    const issuesOnEverySheet = () => {
      const seen = new Set<string>()
      for (const sheet of LOOM_SHEETS) {
        fireEvent.click(
          screen.getByRole('button', {
            name: new RegExp(`^${LOOM_SHEET_NAMES[sheet]} · `),
          }),
        )
        const loom = document.querySelector('[data-loom]') as HTMLElement
        for (const id of loom.textContent?.match(/\b(?:EX|NS)-\d+/g) ?? []) {
          seen.add(id)
        }
      }
      return [...seen].sort()
    }

    const horseKeys = () =>
      [...document.querySelectorAll('[data-loom-horse]')].map((node) =>
        node.getAttribute('data-loom-horse'),
      )

    it('R1: one crew’s rows, horses, counts and health, and only that crew’s', async () => {
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')

      // Nothing stored: the first bound crew (R2).
      expect(crewPicker().textContent).toBe('Loom')
      // Mutation: build `loomHorses` from every crew -> Night shift's card
      // is on Now beside Loom's, red.
      expect(horseKeys()).toEqual(['crew-1:session-opus'])
      // Night shift's tracker is down; Loom is not showing Night shift.
      // Mutation: header health from every bound crew -> red.
      expect(document.body.textContent).not.toContain('tracker unreachable')
      expect(
        screen.getByRole('button', { name: /^Plan · / }).textContent,
      ).toContain('Plan · 1 in preparation')
      // Mutation: rows from every bound crew -> NS-* rows, red.
      expect(issuesOnEverySheet()).toEqual(['EX-1', 'EX-2'])
    })

    it('R1: the strip’s four numbers are the selected crew’s alone', async () => {
      localStorage.setItem('convergence-loom-crew', 'crew-2')
      setWindowWidth(TOO_NARROW_FOR_A_COLUMN)
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom strip')
      const shown = (sheet: string) =>
        document.querySelector(`[data-wave-count="${sheet}"]`)?.textContent
      // Night shift: one working, two in Plan. The union would read 2 and 3.
      expect(shown('now')).toBe('1')
      expect(shown('plan')).toBe('2')
      // ...and its outage dot, because the crew on screen is the one down.
      expect(screen.getByLabelText('Tracker not answering')).toBeTruthy()
    })

    it('R2: a stored crew that is no longer bound falls to the first, never to nothing', async () => {
      localStorage.setItem('convergence-loom-crew', 'crew-deleted')
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      // Mutation: trust the stored id -> an empty board for a crew that is
      // not there, red.
      expect(crewPicker().textContent).toBe('Loom')
      expect(horseKeys()).toEqual(['crew-1:session-opus'])
      expect(
        (document.querySelector('[data-loom-horse]') as HTMLElement)
          .textContent,
      ).toContain('EX-1')
    })

    it('R3: two crews -> a control named Crew, in both shells; the tail stays text', async () => {
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      const subline = () => crewPicker().closest('p') as HTMLElement

      expect(crewPicker().textContent).toBe('Loom')
      expect(subline().textContent).toContain(' · All waves')
      await openPicker()
      // Every bound crew by name, in crew order.
      expect(
        screen.getAllByRole('option').map((option) => option.textContent),
      ).toEqual(['Loom', 'Night shift'])
      // Escape is the list's own: it closes the list and leaves the panel.
      await act(async () => {
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
      })
      expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()
      expect(crewPicker().textContent).toBe('Loom')
      expect(subline().textContent).toContain(' · All waves')
      expect(subline().closest('[data-loom="expanded"]')).toBeTruthy()

      // The portalled list's Escape must not bubble into the shell and fold
      // it. Mutation: drop the list's stopPropagation -> folded, red.
      await openPicker()
      await act(async () => {
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
      })
      expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()
    })

    it('R3: one crew -> the subline is the text it always was, no control, in both shells', async () => {
      crews = [crews[0]!]
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      const line = () =>
        [...document.querySelectorAll('[data-loom] p')].find(
          (node) => node.textContent === 'Loom · All waves',
        )
      // Mutation: draw the control for one crew -> a combobox, and no plain
      // line reading exactly this, red.
      expect(screen.queryByRole('combobox', { name: 'Crew' })).toBeNull()
      expect(line()?.children).toHaveLength(0)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
      })
      expect(screen.queryByRole('combobox', { name: 'Crew' })).toBeNull()
      expect(line()?.children).toHaveLength(0)
    })

    it('R4: switching swaps everything and keeps the sheet, the mode and the width', async () => {
      localStorage.setItem('convergence-wave-panel-width', '360')
      setWindowWidth(windowLeaving(900))
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')

      // A's Now scrolled, then Plan opened with an issue read in place.
      const body = (sheet: string) =>
        document.querySelector(`[data-loom-sheet="${sheet}"]`) as HTMLElement
      fireEvent.scroll(body('now'), { target: { scrollTop: 240 } })
      fireEvent.click(screen.getByRole('button', { name: /^Plan · / }))
      fireEvent.scroll(body('plan'), { target: { scrollTop: 120 } })
      fireEvent.click(
        document.querySelector('[data-wave-row="crew-1:EX-2"]') as HTMLElement,
      )
      expect(document.querySelector('[data-loom-detail]')).toBeTruthy()

      await pickCrew('Night shift')

      // The detail closes: its key is crew-scoped and is resolved against
      // the shown crew's rows only. Mutation: hold on to the last row the
      // key found once the live rows no longer have it -> A's issue is still
      // read in place over B's board, red.
      expect(document.querySelector('[data-loom-detail]')).toBeNull()
      // The place in Loom is kept: Plan, compact, 360.
      expect(
        screen
          .getByRole('button', { name: /^Plan · / })
          .getAttribute('aria-expanded'),
      ).toBe('true')
      expect(document.querySelector('[data-loom="compact"]')).toBeTruthy()
      expect(columnWidth()).toBe('360px')
      // ...and everything on it is B's.
      expect(crewPicker().textContent).toBe('Night shift')
      expect(
        screen.getByRole('button', { name: /^Plan · / }).textContent,
      ).toContain('Plan · 2 in preparation')
      expect(horseKeys()).toEqual([])
      // Each sheet starts at the top for B; A's offsets are not applied.
      // Mutation: do not reset the offsets on a switch -> 120 here and 240
      // on Now, red.
      expect(body('plan').scrollTop).toBe(0)
      fireEvent.click(screen.getByRole('button', { name: /^Now · / }))
      expect(body('now').scrollTop).toBe(0)
      expect(horseKeys()).toEqual(['crew-2:session-night'])
      expect(document.body.textContent).toContain('tracker unreachable')
      expect(issuesOnEverySheet()).toEqual(['NS-1', 'NS-2', 'NS-3'])

      // A switch with NO detail open: nothing restores the sheet on the
      // way, so the live body itself must go back to the top. Mutation:
      // zero the saved offsets but not the element -> 80, red.
      fireEvent.click(screen.getByRole('button', { name: /^Plan · / }))
      fireEvent.scroll(body('plan'), { target: { scrollTop: 80 } })
      await pickCrew('Loom')
      expect(document.querySelector('[data-loom-detail]')).toBeNull()
      expect(body('plan').scrollTop).toBe(0)
      await pickCrew('Night shift')

      // Remembered. Mutation: do not persist -> the remount opens on Loom,
      // red twice.
      expect(localStorage.getItem('convergence-loom-crew')).toBe('crew-2')
      cleanup()
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      expect(crewPicker().textContent).toBe('Night shift')
    })

    it('R4: switching in expanded stays expanded', async () => {
      localStorage.setItem('convergence-wave-panel-mode', 'expanded')
      await mount(<WavePanel reservedWidth={RESERVED} />)
      expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()
      await pickCrew('Night shift')
      expect(document.querySelector('[data-loom="expanded"]')).toBeTruthy()
      expect(crewPicker().textContent).toBe('Night shift')
      expect(localStorage.getItem('convergence-wave-panel-mode')).toBe(
        'expanded',
      )
    })

    it('R5: a Loom row carries no crew name', async () => {
      await mount(<WavePanel reservedWidth={RESERVED} />)
      await screen.findByLabelText('Loom')
      fireEvent.click(screen.getByRole('button', { name: /^Plan · / }))
      // Mutation: `several` from the bound count -> "Loom · …" on the row,
      // red.
      expect(rowOf('crew-1:EX-2').queryByText(/^Loom · /)).toBeNull()
    })

    /**
     * Refresh, on the same two crews (MAR-3227 R6, re-grounded after
     * MAR-3225): Loom's crew is healthy, Night shift's tracker is down.
     */
    describe('MAR-3227 R6: Refresh is honest', () => {
      const FROZEN = Date.parse('2026-09-19T15:00:00.000Z')
      const iso = (offsetMs: number) =>
        new Date(FROZEN + offsetMs).toISOString()
      let refresh: ReturnType<typeof vi.fn>
      let heard: (event: {
        crewId: string
        lastOkAt: string
        refreshableAt: string
      }) => void

      beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(FROZEN)
        snapshots['crew-1'] = {
          ...snapshots['crew-1']!,
          trackerHealth: { ...health('ok'), lastOkAt: iso(-42_000) },
        }
        refresh = vi.fn(async () => ({
          outcome: 'reading',
          refreshableAt: null,
        }))
        heard = () => {}
        ;(
          window as unknown as { electronAPI: Record<string, unknown> }
        ).electronAPI.tracker = {
          refresh,
          onRead: vi.fn((callback: typeof heard) => {
            heard = callback
            return () => {}
          }),
        }
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      const refreshButton = () =>
        screen.queryByRole('button', { name: 'Refresh' })
      const refreshLine = () =>
        document.querySelector('[data-loom-refresh]')?.textContent ?? null

      it('names when the shown crew’s tracker was read, and asks for THAT crew', async () => {
        await mount(<WavePanel reservedWidth={RESERVED} />)
        await screen.findByLabelText('Loom')
        expect(refreshLine()).toBe('Refreshread 42 s ago')
        await act(async () => {
          fireEvent.click(refreshButton()!)
        })
        expect(refresh).toHaveBeenCalledWith('crew-1')
      })

      it('a read that changed nothing still resets the age; another crew’s read does not', async () => {
        await mount(<WavePanel reservedWidth={RESERVED} />)
        await screen.findByLabelText('Loom')
        await act(async () => {
          heard({
            crewId: 'crew-2',
            lastOkAt: iso(0),
            refreshableAt: iso(10_000),
          })
        })
        expect(refreshLine()).toBe('Refreshread 42 s ago')
        await act(async () => {
          heard({
            crewId: 'crew-1',
            lastOkAt: iso(0),
            refreshableAt: iso(10_000),
          })
        })
        // Inside the floor: `just read`, and pressing would do nothing, so
        // the control cannot be pressed. Mutation: always enabled -> red.
        expect(refreshLine()).toBe('Refreshjust read')
        expect(refreshButton()!.hasAttribute('disabled')).toBe(true)
        // Nothing pretends: no spinner, no busy state.
        expect(document.querySelector('[data-loom-refresh] svg')).toBeNull()
        expect(document.querySelector('[aria-busy="true"]')).toBeNull()

        // The floor passes: the age counts again from the read.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(12_000)
        })
        expect(refreshLine()).toMatch(/^Refreshread 1[23] s ago$/)
        expect(refreshButton()!.hasAttribute('disabled')).toBe(false)
      })

      it('a press the floor refuses says just read and asks nothing more', async () => {
        refresh.mockResolvedValue({
          outcome: 'just-read',
          refreshableAt: iso(6_000),
        })
        await mount(<WavePanel reservedWidth={RESERVED} />)
        await screen.findByLabelText('Loom')
        await act(async () => {
          fireEvent.click(refreshButton()!)
        })
        expect(refreshLine()).toBe('Refreshjust read')
        expect(refreshButton()!.hasAttribute('disabled')).toBe(true)
        expect(refresh).toHaveBeenCalledTimes(1)
      })

      it('never read: says so', async () => {
        snapshots['crew-1'] = { ...snapshots['crew-1']!, trackerHealth: null }
        await mount(<WavePanel reservedWidth={RESERVED} />)
        await screen.findByLabelText('Loom')
        expect(refreshLine()).toBe('Refreshnever read')
      })

      it('an outage keeps its line and has no control', async () => {
        localStorage.setItem('convergence-loom-crew', 'crew-2')
        await mount(<WavePanel reservedWidth={RESERVED} />)
        await screen.findByLabelText('Loom')
        expect(screen.getByRole('status').textContent).toContain(
          'tracker unreachable',
        )
        // Mutation: draw the control whatever the health -> red.
        expect(refreshButton()).toBeNull()
      })

      it('in both shells', async () => {
        await mount(<WavePanel reservedWidth={RESERVED} />)
        await screen.findByLabelText('Loom')
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Expand Loom' }))
        })
        expect(refreshButton()!.closest('[data-loom="expanded"]')).toBeTruthy()
      })
    })
  })
})

describe('MAR-3138 R4: a blocked working row is counted once, under Now', () => {
  it('the rail counts a blocked working row once, under Now', () => {
    render(
      <LoomStripView
        horses={[]}
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
        now={NOW}
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
        horses={[]}
        sheets={loomSheets(rows, NOW)}
        now={NOW}
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
   *
   * The board is read through Loom's own panel now the Waves tab is retired
   * (MAR-3233), so the stub also hands LoomRefresh a `tracker` it can hear
   * -- and the healthy snapshots carry no `lastOkAt`, so the refresh line
   * reads "never read" and holds no age: the number counted here is the
   * BOARD's clock and nothing else.
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
      tracker: {
        onRead: vi.fn(() => () => {}),
        refresh: vi.fn(),
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
      render(<WavePanel reservedWidth={RESERVED} />)
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
        trackerHealth: { ...health('ok'), lastOkAt: null },
      }),
    ).toBe(0)
  })

  it('one row keeps the clock', async () => {
    expect(
      await mountBoard({
        crewId: 'crew-1',
        entries: [ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' })],
        trackerHealth: { ...health('ok'), lastOkAt: null },
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
