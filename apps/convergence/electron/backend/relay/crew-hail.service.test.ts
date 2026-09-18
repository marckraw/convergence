import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CrewHailService } from './crew-hail.service'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'

/**
 * The hail book's dedupe, by the shape of the question (MAR-3150).
 *
 * The service had no test of its own: its rules were only ever exercised
 * through the IPC door and the relay engine, which is how a dedupe key could
 * swallow a whole class of call without a single assertion noticing.
 */
describe('CrewHailService.raise: one call per question', () => {
  let hails: CrewHailService

  beforeEach(() => {
    hails = new CrewHailService(getDatabase())
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  /** A verdict hail as the engine raises it: no hop, no run, a quoted line. */
  function verdictHail(detail: string, overrides = {}) {
    return hails.raise({
      crewId: 'c1',
      reason: 'unrouted',
      sessionId: 's1',
      detail,
      ...overrides,
    })
  }

  const MALFORMED_A =
    'This station ruled "VERDICT: PASSED lap 2", which is not the verdict grammar, so no lap was recorded.'
  const MALFORMED_B =
    'This station ruled "VERDICT: RETURN lap", which is not the verdict grammar, so no lap was recorded.'

  describe('R1: a run-less, hop-less hail dedupes on what it is about', () => {
    it('two different broken lines in one session are two calls', () => {
      expect(verdictHail(MALFORMED_A)).not.toBeNull()

      // Mutation: drop `detail` from the run-less key -> this returns null
      // and the second problem is never heard, red.
      const second = verdictHail(MALFORMED_B)
      expect(second).not.toBeNull()
      expect(hails.listOpen().map((hail) => hail.detail)).toEqual([
        MALFORMED_B,
        MALFORMED_A,
      ])
    })

    it('the same broken line twice is still one call', () => {
      expect(verdictHail(MALFORMED_A)).not.toBeNull()
      expect(verdictHail(MALFORMED_A)).toBeNull()
      expect(hails.listOpen()).toHaveLength(1)
    })

    it('answering it clears the way for the same line again', () => {
      const first = verdictHail(MALFORMED_A)
      expect(verdictHail(MALFORMED_A)).toBeNull()

      hails.acknowledge(first!.id)

      // Unlike a stall's accused hop, a verdict problem is not a debt that
      // stays answered: the mastermind can write the same broken line again,
      // and that is a new call.
      expect(verdictHail(MALFORMED_A)).not.toBeNull()
      expect(hails.listOpen()).toHaveLength(1)
    })

    it('the crew, the reason and the station still separate calls', () => {
      expect(verdictHail(MALFORMED_A)).not.toBeNull()
      expect(verdictHail(MALFORMED_A, { crewId: 'c2' })).not.toBeNull()
      expect(verdictHail(MALFORMED_A, { sessionId: 's2' })).not.toBeNull()
      expect(verdictHail(MALFORMED_A, { reason: 'terminal' })).not.toBeNull()
      expect(hails.listOpen()).toHaveLength(4)
    })
  })

  describe('R2: a hail inside a flow run keeps the run as its key', () => {
    /** The baton's unrouted hail: no hop, but an episode it belongs to. */
    function runHail(detail: string, overrides = {}) {
      return hails.raise({
        crewId: 'c1',
        flowRunId: 'run-1',
        reason: 'unrouted',
        sessionId: 's1',
        detail,
        ...overrides,
      })
    }

    it('two unrouted batons in one run are one call, whatever they say', () => {
      expect(runHail('handed on "grok", no wire answers')).not.toBeNull()

      // Mutation: apply the detail key to EVERY hop-less hail -> this raises
      // a second call and the run nags once per name, red.
      expect(runHail('handed on "astra", no wire answers')).toBeNull()
      expect(hails.listOpen()).toHaveLength(1)
    })

    it('a different run is a different call, and answering re-arms the run', () => {
      const first = runHail('handed on "grok", no wire answers')
      expect(
        runHail('handed on "grok", no wire answers', {
          flowRunId: 'run-2',
        }),
      ).not.toBeNull()

      hails.acknowledge(first!.id)
      expect(runHail('handed on "grok", no wire answers')).not.toBeNull()
    })

    it('a run-less hail and a run-bound one about the same words are both heard', () => {
      // The two keys do not reach across each other: a verdict problem is not
      // the run's unrouted baton, even when the sentence is identical.
      expect(verdictHail('the same words')).not.toBeNull()
      expect(runHail('the same words')).not.toBeNull()
      expect(hails.listOpen()).toHaveLength(2)
    })
  })

  describe('R3: the stall rule is untouched — the hop is the identity', () => {
    function stallHail(detail: string, overrides = {}) {
      return hails.raise({
        crewId: 'c1',
        flowRunId: 'run-1',
        reason: 'stall',
        sessionId: 's1',
        hopId: 'hop-1',
        detail,
        ...overrides,
      })
    }

    it('one accused hop is one call, even with a different sentence, even answered', () => {
      const first = stallHail('quiet for 30m')
      expect(first).not.toBeNull()
      // MAR-2759's frozen rule: the hop alone, whatever else changed.
      expect(stallHail('quiet for 45m')).toBeNull()

      hails.acknowledge(first!.id)
      expect(stallHail('quiet for 60m')).toBeNull()

      // Only a new hop re-arms the alarm.
      expect(stallHail('quiet for 30m', { hopId: 'hop-2' })).not.toBeNull()
    })
  })
})
