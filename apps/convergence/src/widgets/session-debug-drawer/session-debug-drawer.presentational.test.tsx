import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ProviderDebugEntry } from '@/entities/provider-debug'
import { SessionDebugDrawer } from './session-debug-drawer.presentational'

function entry(
  seq: number,
  overrides: Partial<ProviderDebugEntry> = {},
): ProviderDebugEntry {
  return {
    sessionId: 's1',
    providerId: 'codex',
    at: 1_700_000_000_000 + seq * 1000,
    direction: 'in',
    channel: 'notification',
    method: `m-${seq}`,
    ...overrides,
  }
}

describe('SessionDebugDrawer', () => {
  it('shows a placeholder when there are no entries', () => {
    render(
      <SessionDebugDrawer
        open
        onOpenChange={vi.fn()}
        sessionId="abcd1234efgh"
        entries={[]}
        onCopyAll={vi.fn()}
        onOpenLogFolder={vi.fn()}
      />,
    )
    expect(screen.getByText('No events captured yet.')).toBeInTheDocument()
  })

  it('renders one row per entry with channel and method', () => {
    render(
      <SessionDebugDrawer
        open
        onOpenChange={vi.fn()}
        sessionId="abcd1234efgh"
        entries={[
          entry(1, { method: 'item/started' }),
          entry(2, { method: 'turn/completed' }),
        ]}
        onCopyAll={vi.fn()}
        onOpenLogFolder={vi.fn()}
      />,
    )
    expect(screen.getByText('item/started')).toBeInTheDocument()
    expect(screen.getByText('turn/completed')).toBeInTheDocument()
    const channelLabels = screen.getAllByText('notification')
    expect(channelLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('disables Copy all when no entries are present', () => {
    render(
      <SessionDebugDrawer
        open
        onOpenChange={vi.fn()}
        sessionId="abcd1234efgh"
        entries={[]}
        onCopyAll={vi.fn()}
        onOpenLogFolder={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeDisabled()
  })
})
