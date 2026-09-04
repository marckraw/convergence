import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RelayHop } from '@/entities/session-relay'
import { RelayHopRow } from './relay-hop-row.presentational'
import { buildRelayHopLine } from './relay-hop.pure'

/**
 * Trail truth, rendered (MAR-2759 piece 6).
 *
 * The trail is the audit organ: "what did the message say, which round was
 * this, and what did my wire do about it" has to be answerable from the row
 * itself. A pure test can prove the line object carries the words; only a
 * rendered one proves they reached the screen.
 */
function hop(overrides: Partial<RelayHop> = {}): RelayHop {
  return {
    id: 'h1',
    relayId: 'r1',
    crewId: 'c1',
    flowRunId: 'run-1',
    firedAt: new Date().toISOString(),
    sourceSessionId: 's1',
    targetSessionId: 's2',
    spawnedSessionId: null,
    triggerStatus: 'completed',
    payloadPreview: null,
    baton: null,
    roundNumber: null,
    outcome: 'delivered',
    error: null,
    ...overrides,
  }
}

const NAMES: Record<string, string> = { s1: 'Fable', s2: 'Horse' }
const resolveName = (id: string): string | null => NAMES[id] ?? null

function renderHop(overrides: Partial<RelayHop> = {}) {
  return render(
    <ul>
      <RelayHopRow
        line={buildRelayHopLine(hop(overrides), resolveName, new Date())}
        expanded={false}
        onToggle={() => {}}
      />
    </ul>,
  )
}

describe('the trail row, rendered', () => {
  it('shows the route the message declared and the round it belonged to', () => {
    renderHop({ baton: 'horse', roundNumber: 3 })

    expect(screen.getByText('⚡ horse')).toBeInTheDocument()
    expect(screen.getByText('round 3')).toBeInTheDocument()
  })

  it('says a wire held for another baton, and names what it waited for', () => {
    renderHop({
      outcome: 'skipped-baton',
      baton: 'codex',
      error:
        'This wire waits for "BATON: horse"; the message\'s last line was "BATON: codex", which handed on "codex", so it held.',
    })

    expect(screen.getByText('held — another baton')).toBeInTheDocument()
    expect(screen.getByText(/waits for "BATON: horse"/)).toBeInTheDocument()
    // The quoted line is the half that made the refusal readable (MAR-2815):
    // it has to reach the screen, not only the row in the database.
    expect(screen.getByText(/last line was "BATON: codex"/)).toBeInTheDocument()
  })

  it('names the round cap when the loop ran out of rounds', () => {
    renderHop({
      outcome: 'skipped-round-budget',
      roundNumber: 13,
      error: 'This loop reached its 12-round cap without reaching a terminal.',
    })

    expect(screen.getByText('stopped — round cap')).toBeInTheDocument()
    expect(screen.getByText('round 13')).toBeInTheDocument()
  })

  it('shows neither on a row written before batons existed', () => {
    // Null is the honest answer for every old row: a zero would claim it knew
    // something it never recorded.
    const { container } = renderHop()

    expect(container.textContent).not.toContain('round')
    expect(container.textContent).not.toContain('⚡')
  })
})
