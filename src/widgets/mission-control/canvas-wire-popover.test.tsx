import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  buildRelayHopLine,
  buildRelaySentence,
} from '@/features/mission-control'
import type { RelayHop, SessionRelay } from '@/entities/session-relay'
import { CanvasWirePopover } from './canvas-wire-popover.presentational'

const NAMES: Record<string, string> = {
  a: 'Mastermind',
  b: 'Executor',
}
const resolveName = (id: string): string | null => NAMES[id] ?? null
const NOW = new Date('2026-08-16T12:00:00.000Z')

function relay(overrides: Partial<SessionRelay> = {}): SessionRelay {
  return {
    id: 'r1',
    crewId: 'c1',
    sourceSessionId: 'a',
    trigger: 'settled',
    action: 'hail',
    targetSessionId: 'b',
    spawnSpec: null,
    armed: true,
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:00.000Z',
    ...overrides,
  }
}

function hop(overrides: Partial<RelayHop> & { id: string }): RelayHop {
  return {
    relayId: 'r1',
    crewId: 'c1',
    flowRunId: 'run-1',
    firedAt: '2026-08-16T11:59:30.000Z',
    sourceSessionId: 'a',
    targetSessionId: 'b',
    spawnedSessionId: null,
    triggerStatus: 'completed',
    payloadPreview: 'Done. Ready for review.',
    outcome: 'delivered',
    error: null,
    ...overrides,
  }
}

function renderPopover(
  options: {
    relay?: SessionRelay
    hops?: RelayHop[]
    onClose?: () => void
  } = {},
) {
  const wire = options.relay ?? relay()
  render(
    <CanvasWirePopover
      sentence={buildRelaySentence(wire, resolveName)}
      armed={wire.armed}
      hopLines={(options.hops ?? []).map((entry) =>
        buildRelayHopLine(entry, resolveName, NOW),
      )}
      onClose={options.onClose ?? (() => undefined)}
    />,
  )
}

describe('CanvasWirePopover', () => {
  it('says what the wire is, in the same words the Flow strip uses', () => {
    renderPopover()

    // The sentence builder is shared, so the canvas cannot describe a wire
    // differently from the crew container that lists it.
    expect(
      screen.getByText(/Mastermind/, { selector: 'p' }).textContent,
    ).toContain('Executor')
    expect(screen.getByText('Armed')).toBeInTheDocument()
  })

  it('says a wire is disarmed rather than only looking dimmer', () => {
    renderPopover({ relay: relay({ armed: false }) })

    expect(screen.getByText('Disarmed')).toBeInTheDocument()
  })

  it('admits when a wire has never fired', () => {
    renderPopover()

    expect(screen.getByText('This wire has not fired yet.')).toBeInTheDocument()
  })

  it('lists the recent hops using the trail’s own rows', () => {
    renderPopover({
      hops: [
        hop({ id: 'h1' }),
        hop({ id: 'h2', outcome: 'error', error: 'The target is gone.' }),
      ],
    })

    expect(document.querySelectorAll('[data-relay-hop]')).toHaveLength(2)
    expect(screen.getByText('delivered')).toBeInTheDocument()
    // Errors say what went wrong on the row itself, never behind a click.
    expect(screen.getByText('The target is gone.')).toBeInTheDocument()
  })

  it('describes a spawn wire as the session it will start', () => {
    renderPopover({
      relay: relay({
        action: 'spawn',
        targetSessionId: null,
        spawnSpec: {
          projectId: 'p1',
          providerId: 'codex',
          model: 'gpt-5.6',
          effort: null,
          name: 'Reviewer',
        },
      }),
    })

    expect(screen.getByRole('dialog').textContent).toContain('Reviewer')
  })

  it('closes when asked', () => {
    const onClose = vi.fn()
    renderPopover({ onClose })

    fireEvent.click(screen.getByLabelText('Close wire details'))

    expect(onClose).toHaveBeenCalled()
  })
})
