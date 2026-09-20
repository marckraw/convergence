import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/entities/app-settings'
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
