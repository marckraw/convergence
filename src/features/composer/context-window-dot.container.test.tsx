import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderInfo, SessionSummary } from '@/entities/session'
import { ContextWindowDot } from './context-window-dot.container'

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
})
