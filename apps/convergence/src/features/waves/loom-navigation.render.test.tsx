import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { render } from './loom-tooltip.fixture'
import { useSessionCrewStore } from '@/entities/session-crew'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useWorkLedgerStore } from '@/entities/work-ledger'
import {
  requestLoomNavigation,
  useLoomNavigationStore,
} from '@/entities/loom-navigation'
import { buildConversationProjectActions } from '@/entities/conversation-actions'
import { WavePanel } from './wave-panel.container'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'

const crews = [
  boundCrewWith('crew-1', 'First', []),
  boundCrewWith('crew-2', 'Second', [
    residentSeat('opus'),
    residentSeat('fable', { role: 'mastermind' }),
  ]),
]
const entry = ledgerEntry({ issueIdentifier: 'MAR-2', crewId: 'crew-2' })
const snapshots = {
  'crew-2': {
    crewId: 'crew-2',
    entries: [entry],
    trackerHealth: null,
    dispatchPlan: null,
  },
}
const scroll = vi.fn()

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('convergence-wave-panel-mode', 'folded')
  localStorage.setItem('convergence-loom-sheet', 'plan')
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1400,
  })
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scroll)
  scroll.mockClear()
  // Fake data stores, real renderer derivation and navigation store. No IO.
  useSessionCrewStore.setState({ crews, load: vi.fn(async () => {}) })
  useWorkLedgerStore.setState({ snapshots, load: vi.fn(async () => {}) })
  useSessionStore.setState({
    globalSessions: [
      {
        id: 'session-opus',
        status: 'idle',
        attention: 'none',
        updatedAt: '2026-09-24',
      } as SessionSummary,
    ],
  })
  useLoomNavigationStore.setState({ pending: null, shownCrewId: null })
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {},
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  useLoomNavigationStore.setState({ pending: null, shownCrewId: null })
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
})

function request(kind: 'issue' | 'seat', sessionId = 'session-opus') {
  const action = buildConversationProjectActions({
    sessionId,
    crews,
    snapshots,
    currentCrewId: 'crew-1',
  }).find((action) => action.navigation?.target.kind === kind)!
  act(() => requestLoomNavigation(action.navigation!))
}

function expectNow(mode = 'compact') {
  expect(document.querySelector(`[data-loom="${mode}"]`)).not.toBeNull()
  expect(useLoomNavigationStore.getState().shownCrewId).toBe('crew-2')
  expect(
    document.querySelector('[data-loom-sheet-title="now"]'),
  ).toHaveAttribute('aria-expanded', 'true')
}

describe('MAR-3394 R3/R4: consume once, land at the existing Loom doors', () => {
  it.each([1400, 500])(
    'issue opens its crew and Now at width %s, focuses close and returns to the ticket',
    async (width) => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
      })
      const view = render(<WavePanel />)
      request('issue')
      expectNow(width === 1400 ? 'compact' : 'expanded')
      expect(document.querySelector('[data-loom-detail]')).toHaveAttribute(
        'data-loom-detail',
        'crew-2:MAR-2',
      )
      expect(
        screen.getByRole('button', { name: 'Close the issue detail' }),
      ).toHaveFocus()
      fireEvent.click(
        screen.getByRole('button', { name: 'Close the issue detail' }),
      )
      expect(
        document.querySelector(
          '[data-loom-horse-ticket="crew-2:session-opus"]',
        ),
      ).toHaveFocus()
      // A fresh parent render and ledger broadcast cannot replay the request.
      view.rerender(<WavePanel reservedWidth={1} />)
      act(() => useWorkLedgerStore.setState({ snapshots: { ...snapshots } }))
      act(() => useSessionCrewStore.setState({ crews: [...crews] }))
      expect(document.querySelector('[data-loom-detail]')).toBeNull()
      expect(useLoomNavigationStore.getState().pending).toBeNull()
      await act(async () => {})
    },
  )

  it.each([false, true])(
    'seat scrolls and focuses the card; reduced motion = %s',
    async (reduced) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: reduced })),
      )
      const view = render(<WavePanel />)
      request('seat')
      expectNow()
      expect(
        document.querySelector('[data-loom-horse="crew-2:session-opus"]'),
      ).toHaveFocus()
      expect(scroll).toHaveBeenCalledExactlyOnceWith({
        block: 'nearest',
        behavior: reduced ? 'instant' : 'smooth',
      })
      view.rerender(<WavePanel reservedWidth={1} />)
      expect(scroll).toHaveBeenCalledTimes(1)
      await act(async () => {})
    },
  )

  it('mastermind focuses the crew’s Now title without inventing a card', async () => {
    render(<WavePanel />)
    request('seat', 'session-fable')
    expectNow()
    expect(
      document.querySelector('[data-loom-horse="crew-2:session-fable"]'),
    ).toBeNull()
    expect(
      document.querySelector('[data-loom-sheet-title="now"]'),
    ).toHaveFocus()
    expect(scroll).not.toHaveBeenCalled()
    await act(async () => {})
  })
})
