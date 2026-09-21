import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/entities/app-settings'
import {
  useContextDrillStore,
  type DrillDescription,
} from '@/entities/context-drill'
import type { ProviderInfo, SessionSummary } from '@/entities/session'
import type { ContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'
import { ContextWindowDot } from './context-window-dot.container'

function setContextAlert(alert: ContextAlertSettings) {
  useAppSettingsStore.setState((state) => ({
    settings: { ...state.settings, contextAlert: alert },
  }))
}

const session = {
  id: 'session-1',
  status: 'completed',
  attention: 'finished',
  activity: null,
  continuationToken: 'thread-1',
  executionHost: 'local',
} as SessionSummary

const provider = {
  id: 'codex',
  name: 'Codex',
  contextManagement: {
    compact: {
      availability: 'available',
      method: 'native-rpc',
      supportsInstructions: false,
    },
  },
} as ProviderInfo

describe('ContextWindowDot', () => {
  afterEach(() => {
    setContextAlert({ enabled: true, percent: 75, tokens: 400000 })
  })

  it('renders a textless context control and shows details on click', async () => {
    render(
      <ContextWindowDot
        contextWindow={{
          availability: 'available',
          source: 'provider',
          usedTokens: 40000,
          windowTokens: 200000,
          usedPercentage: 20,
          remainingPercentage: 80,
        }}
        session={session}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )

    expect(screen.queryByText('80% left')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Context window 80% remaining',
      }),
    )

    expect(await screen.findByText('Remaining')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('Provider-reported')).toBeInTheDocument()
  })

  it('shows unavailable details when context usage is missing', async () => {
    render(
      <ContextWindowDot
        contextWindow={null}
        session={session}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Context window unavailable' }),
    )

    expect(
      await screen.findByText(
        'Context usage has not been reported for this session yet.',
      ),
    ).toBeInTheDocument()
  })

  it('invokes manual compaction from the context popover', async () => {
    const onCompact = vi.fn(async () => {})
    render(
      <ContextWindowDot
        contextWindow={null}
        session={session}
        provider={provider}
        onCompact={onCompact}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Context window unavailable' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Compact context' }),
    )

    await waitFor(() => expect(onCompact).toHaveBeenCalledOnce())
    expect(await screen.findByText('Context compacted.')).toBeInTheDocument()
  })

  it('names the percent in the popover when the percent was reached first', async () => {
    setContextAlert({ enabled: true, percent: 75, tokens: 400000 })
    render(
      <ContextWindowDot
        contextWindow={{
          availability: 'available',
          source: 'provider',
          usedTokens: 152000,
          windowTokens: 200000,
          usedPercentage: 76,
          remainingPercentage: 24,
        }}
        session={session}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Context window 24% remaining' }),
    )

    expect(
      await screen.findByText('Over your alert threshold (75 %)'),
    ).toBeInTheDocument()
  })

  it('names the token cap in the popover when the cap was reached first', async () => {
    setContextAlert({ enabled: true, percent: 75, tokens: 400000 })
    render(
      <ContextWindowDot
        contextWindow={{
          availability: 'available',
          source: 'provider',
          usedTokens: 410000,
          windowTokens: 1000000,
          usedPercentage: 41,
          remainingPercentage: 59,
        }}
        session={session}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Context window 59% remaining' }),
    )

    expect(
      await screen.findByText('Over your alert threshold (400k tokens)'),
    ).toBeInTheDocument()
  })

  it('says nothing about the threshold below it', async () => {
    setContextAlert({ enabled: true, percent: 75, tokens: 400000 })
    render(
      <ContextWindowDot
        contextWindow={{
          availability: 'available',
          source: 'provider',
          usedTokens: 40000,
          windowTokens: 200000,
          usedPercentage: 20,
          remainingPercentage: 80,
        }}
        session={session}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Context window 80% remaining' }),
    )

    expect(await screen.findByText('Remaining')).toBeInTheDocument()
    expect(screen.queryByText(/Over your alert threshold/)).toBeNull()
  })

  it('recolours an already-rendered dot when the threshold changes', async () => {
    // The STOP condition of MAR-3250: a settings change has to reach an open
    // conversation's dot with no reload. The dot reads the app-settings store,
    // which the `appSettings:updated` broadcast writes, so a store write is
    // exactly what arrives in the running app.
    setContextAlert({ enabled: true, percent: 75, tokens: 400000 })
    render(
      <ContextWindowDot
        contextWindow={{
          availability: 'available',
          source: 'provider',
          usedTokens: 60000,
          windowTokens: 200000,
          usedPercentage: 30,
          remainingPercentage: 70,
        }}
        session={session}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )

    const dot = () =>
      screen
        .getByRole('button', { name: 'Context window 70% remaining' })
        .querySelector('span[aria-hidden="true"]')!

    expect(dot().className).toContain('bg-emerald-400')

    act(() => setContextAlert({ enabled: true, percent: 5, tokens: null }))

    expect(dot().className).toContain('bg-amber-400')
  })
})

const drillApi = {
  run: vi.fn(async () => ({ ok: true as const })),
  cancel: vi.fn(async () => ({ ok: true as const })),
  describe: vi.fn(async (): Promise<DrillDescription> => READY_DRILL),
  onChanged: vi.fn(() => () => {}),
}

const READY_DRILL: DrillDescription = {
  seat: 'mastermind',
  eligible: true,
  offered: true,
  reason: null,
  beat: null,
}

function installDrillApi() {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    contextDrill: drillApi,
  }
}

function resetDrillStore() {
  useContextDrillStore.setState({
    descriptions: {},
    beats: {},
    outcomes: {},
    cancelRequested: {},
    unsubscribe: null,
  })
}

async function openPopover() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Context window unavailable' }),
  )
  await screen.findByRole('button', { name: 'Compact context' })
}

function renderDot() {
  return render(
    <ContextWindowDot
      contextWindow={null}
      session={session}
      provider={provider}
      onCompact={vi.fn(async () => {})}
    />,
  )
}

describe('ContextWindowDot — the drill (MAR-3256 R3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    drillApi.describe.mockResolvedValue(READY_DRILL)
    resetDrillStore()
    installDrillApi()
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    resetDrillStore()
  })

  // Amended by MAR-3287: this was "offers no drill control on a conversation
  // that is not a mastermind seat" (MAR-3256 R3). Nothing is now drawn only
  // for a conversation in no crew; a crew seat with another role is drawn
  // disabled, saying where to set the role (below).
  it('offers no drill control on a conversation in no crew', async () => {
    drillApi.describe.mockResolvedValue({
      seat: 'none',
      eligible: false,
      offered: false,
      reason: "The drill only runs on a crew's mastermind conversation.",
      beat: null,
    })
    renderDot()

    await openPopover()

    await waitFor(() => expect(drillApi.describe).toHaveBeenCalled())
    expect(
      screen.queryByRole('button', { name: 'Run the drill' }),
    ).not.toBeInTheDocument()
  })

  it('runs the drill once when the button is clicked', async () => {
    renderDot()
    await openPopover()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Run the drill' }),
    )

    await waitFor(() => expect(drillApi.run).toHaveBeenCalledTimes(1))
    expect(drillApi.run).toHaveBeenCalledWith('session-1')
  })

  it('shows the beat, disables Compact, and cancels while sealing', async () => {
    renderDot()
    await openPopover()
    await screen.findByRole('button', { name: 'Run the drill' })

    act(() =>
      useContextDrillStore
        .getState()
        .handleChange({ sessionId: 'session-1', beat: 'sealing' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Sealing memory…' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Compact context' }),
    ).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(drillApi.cancel).toHaveBeenCalledWith('session-1'),
    )
  })

  it('greys out Cancel during the compaction and says why', async () => {
    renderDot()
    await openPopover()
    await screen.findByRole('button', { name: 'Run the drill' })

    act(() =>
      useContextDrillStore
        .getState()
        .handleChange({ sessionId: 'session-1', beat: 'compacting' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Compacting…' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(
      screen.getByText(
        'Compaction cannot be interrupted; it finishes on its own.',
      ),
    ).toBeInTheDocument()
  })

  it('a conversation opened mid-routine shows the beat and a working Cancel', async () => {
    // Nothing is ever delivered on `contextDrill:changed` in this test. The
    // routine started before this window existed -- reopened on macOS, or
    // reloaded -- so `describe` is the only witness of the beat, and Cancel
    // is the routine's whole way out.
    drillApi.describe.mockResolvedValue({
      seat: 'mastermind',
      eligible: true,
      offered: false,
      reason: 'This conversation is still working on a turn.',
      beat: 'sealing',
    })
    renderDot()

    await openPopover()

    expect(
      await screen.findByRole('button', { name: 'Sealing memory…' }),
    ).toBeDisabled()
    expect(drillApi.onChanged).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(drillApi.cancel).toHaveBeenCalledWith('session-1'),
    )
  })

  it('re-asks the backend when the turn ends, without any timer', async () => {
    const { rerender } = render(
      <ContextWindowDot
        contextWindow={null}
        session={{ ...session, status: 'running' } as SessionSummary}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )
    await waitFor(() => expect(drillApi.describe).toHaveBeenCalledTimes(1))

    rerender(
      <ContextWindowDot
        contextWindow={null}
        session={session}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )

    await waitFor(() => expect(drillApi.describe).toHaveBeenCalledTimes(2))
  })
})

const ROLE_SENTENCE =
  "The drill runs on a crew's mastermind seat. Set this seat's role to Mastermind in the crew's settings (Mission Control)."

const OTHER_ROLE_DRILL: DrillDescription = {
  seat: 'other-role',
  eligible: false,
  offered: false,
  reason: ROLE_SENTENCE,
  beat: null,
}

describe('ContextWindowDot — a seat without the mastermind role (MAR-3287)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    drillApi.describe.mockResolvedValue(READY_DRILL)
    resetDrillStore()
    installDrillApi()
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    resetDrillStore()
  })

  it('draws Run the drill disabled, with the role sentence (R3)', async () => {
    drillApi.describe.mockResolvedValue(OTHER_ROLE_DRILL)
    renderDot()

    await openPopover()

    expect(
      await screen.findByRole('button', { name: 'Run the drill' }),
    ).toBeDisabled()
    expect(screen.getByText(ROLE_SENTENCE)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument()
  })

  it('draws neither the button nor the sentence in no crew (R3)', async () => {
    drillApi.describe.mockResolvedValue({
      ...OTHER_ROLE_DRILL,
      seat: 'none',
    })
    renderDot()

    await openPopover()
    await waitFor(() => expect(drillApi.describe).toHaveBeenCalled())

    expect(
      screen.queryByRole('button', { name: 'Run the drill' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(ROLE_SENTENCE)).not.toBeInTheDocument()
  })

  it('re-asks once per opening, and not on a re-render while open (R4)', async () => {
    const onCompact = vi.fn(async () => {})
    const { rerender } = render(
      <ContextWindowDot
        contextWindow={null}
        session={session}
        provider={provider}
        onCompact={onCompact}
      />,
    )
    await waitFor(() => expect(drillApi.describe).toHaveBeenCalledTimes(1))

    await openPopover()
    await waitFor(() => expect(drillApi.describe).toHaveBeenCalledTimes(2))

    // Closed the way a person closes it: Escape, through the popover.
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Compact context' }),
      ).not.toBeInTheDocument(),
    )
    expect(drillApi.describe).toHaveBeenCalledTimes(2)

    await openPopover()
    await waitFor(() => expect(drillApi.describe).toHaveBeenCalledTimes(3))

    rerender(
      <ContextWindowDot
        contextWindow={null}
        session={session}
        provider={provider}
        onCompact={vi.fn(async () => {})}
      />,
    )
    // Give a stray effect every chance to fire before counting.
    await act(async () => {})
    expect(
      screen.getByRole('button', { name: 'Compact context' }),
    ).toBeVisible()
    expect(drillApi.describe).toHaveBeenCalledTimes(3)
  })

  it('shows a role set elsewhere the next time it opens, with no turn (R4)', async () => {
    drillApi.describe
      .mockResolvedValueOnce(OTHER_ROLE_DRILL)
      .mockResolvedValueOnce(READY_DRILL)
    renderDot()
    await waitFor(() => expect(drillApi.describe).toHaveBeenCalledTimes(1))

    await openPopover()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Run the drill' }),
      ).toBeEnabled(),
    )
    expect(screen.queryByText(ROLE_SENTENCE)).not.toBeInTheDocument()
  })
})
