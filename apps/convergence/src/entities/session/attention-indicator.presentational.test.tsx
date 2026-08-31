import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttentionIndicator } from './attention-indicator.presentational'

/**
 * The header pill, and the one question it has to answer honestly: is anything
 * happening, and does it need a human?
 *
 * Before MAR-2590 the spinner was whatever a label lookup could not explain,
 * so `attention='none'` — a legitimate `AttentionState`, and what 41 of the
 * 545 sessions in the seeded sandbox sit at — rendered a spinning "Running"
 * over a session that had been idle for days.
 *
 * These drive rendered output rather than a returned view model, because the
 * defect was only ever visible as rendered output (MAR-2280).
 */
describe('AttentionIndicator', () => {
  /**
   * The four labelled states, pinned before the refactor that introduced
   * `status`. They are the behaviour that must not change.
   */
  describe('the labelled attention states', () => {
    it('renders the approval label when the session is blocked on approval', () => {
      render(<AttentionIndicator attention="needs-approval" status="running" />)

      expect(screen.getByText('Needs Approval')).toBeInTheDocument()
    })

    it('renders the input label when the session is blocked on input', () => {
      render(<AttentionIndicator attention="needs-input" status="running" />)

      expect(screen.getByText('Needs Input')).toBeInTheDocument()
    })

    it('renders the finished label when the session finished', () => {
      render(<AttentionIndicator attention="finished" status="completed" />)

      expect(screen.getByText('Finished')).toBeInTheDocument()
    })

    it('renders the failed label when the session failed', () => {
      render(<AttentionIndicator attention="failed" status="failed" />)

      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
  })

  describe('the quiet states', () => {
    it('says nothing about an idle session with nothing to say', () => {
      const { container } = render(
        <AttentionIndicator attention="none" status="idle" />,
      )

      expect(screen.queryByText('Running')).not.toBeInTheDocument()
      expect(container).toBeEmptyDOMElement()
    })

    /**
     * The session record holds whatever the wire sent it, so a value outside
     * `AttentionState` can reach this component at runtime with every type
     * still satisfied. Quiet is the honest rendering: a false "Running" sends
     * a human to look at a session that needs nothing from them.
     */
    it('says nothing about an attention value it has no branch for', () => {
      const { container } = render(
        <AttentionIndicator
          attention={'needs-tea' as never}
          status="completed"
        />,
      )

      expect(screen.queryByText('Running')).not.toBeInTheDocument()
      expect(container).toBeEmptyDOMElement()
    })

    /**
     * The other half of the unreadable-attention matrix, pinned as its own
     * cell: with the session at rest, an attention this build has no branch
     * for renders nothing at all. Its twin — the same value on a *running*
     * session — is in the spinner group below, and the two together are the
     * whole rule: status decides the spinner, attention decides the pill.
     */
    it('says nothing about an attention value it has no branch for on an idle session', () => {
      const { container } = render(
        <AttentionIndicator attention={'needs-tea' as never} status="idle" />,
      )

      expect(screen.queryByText('Running')).not.toBeInTheDocument()
      expect(container).toBeEmptyDOMElement()
    })

    /**
     * The unexplained values that are not merely unknown but inherited.
     * `labelMap['toString']` on a plain object literal resolves
     * `Object.prototype.toString` -- a function, and truthy, so the quiet
     * fallback above never fired and React was handed a function as a child.
     * `'needs-tea'` above cannot catch this: it is the one attention value
     * that misses on both the own keys and the prototype.
     *
     * Red before the `Object.hasOwn` guard, and it throws rather than merely
     * rendering wrong -- which is the point: quiet was already the ruling, and
     * the lookup was not keeping it.
     */
    it.each(['toString', 'constructor', 'valueOf', 'hasOwnProperty'])(
      'says nothing about the inherited property %s',
      (inherited) => {
        const { container } = render(
          <AttentionIndicator
            attention={inherited as never}
            status="completed"
          />,
        )

        expect(screen.queryByText('Running')).not.toBeInTheDocument()
        expect(container).toBeEmptyDOMElement()
      },
    )
  })

  describe('the running spinner', () => {
    it('spins for a running session that has nothing to ask', () => {
      render(<AttentionIndicator attention="none" status="running" />)

      expect(screen.getByText('Running')).toBeInTheDocument()
    })

    /**
     * Live movement outranks a stale outcome flag: an agent streaming again is
     * working, whatever its last run left behind. Same precedence Mission
     * Control ratified in `session-card-state.pure.ts`.
     */
    it("spins for a running session still carrying the last run's finished flag", () => {
      render(<AttentionIndicator attention="finished" status="running" />)

      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.queryByText('Finished')).not.toBeInTheDocument()
    })

    /**
     * An unreadable attention is quiet, not silencing: the session is running
     * and says so. Quiet is what the *pill* falls back to, and the spinner was
     * never the pill's to give — a build that hid the spinner here would go
     * back to inferring "is anything happening?" from attention, which is the
     * whole defect MAR-2590 closed, mirrored.
     */
    it('spins for a running session whose attention it has no branch for', () => {
      render(
        <AttentionIndicator
          attention={'needs-tea' as never}
          status="running"
        />,
      )

      expect(screen.getByText('Running')).toBeInTheDocument()
    })
  })
})
