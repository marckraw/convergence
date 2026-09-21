import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { useSessionCrewStore, type SessionCrew } from '@/entities/session-crew'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import {
  useWorkLedgerStore,
  type TrackerHealth,
  type WorkLedgerSnapshot,
} from '@/entities/work-ledger'
import { WavePanel } from './wave-panel.container'
import { WaveRowView } from './wave-row.presentational'
import { loomSheets } from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'

/**
 * The surfaces Loom kept (MAR-3233). The Waves tab's view was the harness
 * these laws were first asserted through; the tab retired, and the halves
 * that are still true of Loom's own rows and header live here, on the
 * components that render them now: `WaveRowView` (Loom's sheets render
 * every row through it) and the real `WavePanel` container.
 *
 * (The row-word and marker laws -- which action a state asks for, which
 * marker a host outage draws -- stay pinned in `wave-sections.pure.test.ts`
 * and `loom-sheets.pure.test.ts`; the rendered action span is pinned by the
 * Plan and Next sheet cases in `wave-panel.render.test.tsx`.)
 */

const NOW = Date.parse('2026-09-17T12:10:00.000Z')
const AT = '2026-09-17T12:00:00.000Z'

const RESERVED = 260

const health = (state: TrackerHealth['state']): TrackerHealth => ({
  state,
  since: AT,
  lastOkAt: AT,
  backoffUntil: null,
})

/** One Loom row, built by the real selectors, as the sheets build them. */
function loomRow(entry: ReturnType<typeof ledgerEntry>) {
  return loomSheets([entry], NOW).now.inFlight[0]!
}

const rowOf = (key: string) =>
  within(document.querySelector(`[data-wave-row="${key}"]`) as HTMLElement)

describe('MAR-3155 R5: the identifier never breaks; the title gets the rest', () => {
  it('the id is one unbreakable token and the whole title is one hover away', () => {
    const title =
      'Loom: carry the blocked label through the tracker adapter and the work ledger'
    render(
      <WaveRowView
        appearance="loom"
        row={loomRow(
          ledgerEntry({
            issueIdentifier: 'MAR-3085',
            state: 'working',
            issueTitle: title,
          }),
        )}
        inertReason={null}
        onOpen={vi.fn()}
      />,
    )

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

describe('MAR-3148 C: a row that cannot open says so, and is not a button', () => {
  it('an inert row carries its reason and no control semantics', () => {
    render(
      <WaveRowView
        appearance="loom"
        row={loomRow(
          ledgerEntry({ issueIdentifier: 'EX-9', state: 'working' }),
        )}
        inertReason="no conversation for this seat"
        onOpen={vi.fn()}
      />,
    )
    const row = document.querySelector('[data-wave-row="crew-1:EX-9"]')
    // Mutation: drop `aria-disabled` from the inert row -> red (the enabled
    // branch renders a button, so deleting the attribute changed nothing
    // there and only this branch can go wrong).
    expect(row?.getAttribute('aria-disabled')).toBe('true')
    expect(row?.tagName).toBe('DIV')
    expect(
      rowOf('crew-1:EX-9').getByText('no conversation for this seat'),
    ).toBeTruthy()
  })
})

describe('MAR-3169 R4: a project the key cannot see, through the real Loom', () => {
  const SESSION = {
    id: 'session-opus',
    name: 'opus',
    status: 'idle',
    attention: 'none',
    updatedAt: AT,
  } as SessionSummary

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

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    localStorage.clear()
  })

  it('reads its age, and the last rows stay', async () => {
    // The panel reads its own clock, so the case writes the time it is
    // judged at (the age below is 10m from it).
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(NOW)
    const snapshot: WorkLedgerSnapshot = {
      crewId: 'crew-1',
      entries: [
        ledgerEntry({ issueIdentifier: 'EX-1', state: 'working' }),
        ledgerEntry({ issueIdentifier: 'EX-2', state: 'reviewed' }),
      ],
      dispatchPlan: null,
      trackerHealth: health('project-not-visible'),
    }
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
      render(<WavePanel reservedWidth={RESERVED} />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    // Never "Quiet project": the empty page this state comes from is exactly
    // what used to read as a calm day.
    // Mutation: read a zero instead of the age -> "0 in flight", red.
    expect(screen.getByRole('status').textContent).toBe(
      'tracker project not visible to this key · 10m',
    )
    // The last rows stay readable while the tracker cannot be believed.
    expect(rowOf('crew-1:EX-1')).toBeTruthy()
    expect(rowOf('crew-1:EX-2')).toBeTruthy()
  })
})
