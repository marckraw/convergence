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
    settleId: null,
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
    lapNumber: null,
    settledAt: null,
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

  it('names the delivery limit when the run spent it all', () => {
    renderHop({
      outcome: 'skipped-round-budget',
      roundNumber: 13,
      error:
        'This run spent its whole delivery limit of 12 without reaching you.',
    })

    expect(screen.getByText('stopped — delivery limit')).toBeInTheDocument()
    expect(screen.getByText('round 13')).toBeInTheDocument()
  })

  it('says a queued hop is waiting on a busy target (R2/R4, MAR-2888)', () => {
    // The reason has to reach the SCREEN, not only the row: `queued` on its
    // own reads as "sent, pending", and the whole point of MAR-2888 is that
    // Marcin could not tell a delivery waiting politely from one that fell on
    // the floor.
    renderHop({
      outcome: 'queued',
      error: 'Waiting behind a running turn at the target.',
    })

    expect(
      screen.getByText('Waiting behind a running turn at the target.'),
    ).toBeInTheDocument()
  })

  it('stops explaining the wait once the hop has settled (MAR-2888 lap 2)', () => {
    // The reason is about a state, not an event: once the turn ran and this
    // hop settled, "waiting behind a running turn" describes something that
    // has ended. A canvas still saying it would be telling Marcin to be
    // patient about work that already landed.
    renderHop({
      outcome: 'queued',
      error: 'Waiting behind a running turn at the target.',
      settledAt: new Date().toISOString(),
    })

    expect(
      screen.queryByText('Waiting behind a running turn at the target.'),
    ).not.toBeInTheDocument()
  })

  it('shows a failed delivery its own error on the canvas (R4, MAR-2888)', () => {
    // The 09-09 rows read `delivery-failed` with the provider's sentence, and
    // that sentence is the only thing on the canvas that said what happened.
    // It stays rendered: this run makes a busy target stop producing these,
    // it does not make a genuinely broken delivery quieter.
    renderHop({
      outcome: 'error',
      error:
        'Wait for the current turn to finish before clearing the conversation.',
    })

    expect(
      screen.getByText(
        'Wait for the current turn to finish before clearing the conversation.',
      ),
    ).toBeInTheDocument()
  })

  it('shows neither on a row written before batons existed', () => {
    // Null is the honest answer for every old row: a zero would claim it knew
    // something it never recorded.
    const { container } = renderHop()

    expect(container.textContent).not.toContain('round')
    expect(container.textContent).not.toContain('⚡')
  })
})
