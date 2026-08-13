import { describe, expect, it } from 'vitest'
import { ClaudeRateLimitState } from './claude-rate-limit.state'

const OBSERVATION = {
  status: 'allowed_warning',
  rateLimitType: 'seven_day',
  resetsAt: '2026-08-09T00:00:00.000Z',
}

function stateAt(clock: { value: Date }) {
  return new ClaudeRateLimitState(() => clock.value)
}

describe('ClaudeRateLimitState', () => {
  it('reports nothing before any turn has run', () => {
    const state = new ClaudeRateLimitState()

    expect(
      state.get({ executionHostId: 'local', providerAccountId: 'acct-a' }),
    ).toBeNull()
  })

  it('files a reading against the account that produced it', () => {
    const clock = { value: new Date('2026-08-04T12:00:00.000Z') }
    const state = stateAt(clock)

    state.record(
      { executionHostId: 'local', providerAccountId: 'acct-a' },
      OBSERVATION,
    )

    expect(
      state.get({ executionHostId: 'local', providerAccountId: 'acct-a' }),
    ).toEqual({
      providerAccountId: 'acct-a',
      status: 'allowed_warning',
      rateLimitType: 'seven_day',
      resetsAt: '2026-08-09T00:00:00.000Z',
      observedAt: '2026-08-04T12:00:00.000Z',
    })
  })

  it('never lets one account read another account numbers', () => {
    // The whole point of the key. Reporting acct-a's limit under acct-b would
    // be worse than reporting nothing: it reads as a measurement.
    const state = new ClaudeRateLimitState()
    state.record(
      { executionHostId: 'local', providerAccountId: 'acct-a' },
      OBSERVATION,
    )

    expect(
      state.get({ executionHostId: 'local', providerAccountId: 'acct-b' }),
    ).toBeNull()
    expect(
      state.get({ executionHostId: 'local', providerAccountId: null }),
    ).toBeNull()
  })

  it('keeps hosts apart as well as accounts', () => {
    const state = new ClaudeRateLimitState()
    state.record(
      { executionHostId: 'local', providerAccountId: 'acct-a' },
      OBSERVATION,
    )

    expect(
      state.get({ executionHostId: 'remote', providerAccountId: 'acct-a' }),
    ).toBeNull()
  })

  it('tracks the ambient default separately from every enrolled account', () => {
    // Pinned clock: OBSERVATION's window resets on 2026-08-09, so a real clock
    // makes this assertion evaporate once that date passes.
    const state = stateAt({ value: new Date('2026-08-04T12:00:00.000Z') })
    state.record(
      { executionHostId: 'local', providerAccountId: null },
      OBSERVATION,
    )

    expect(
      state.get({ executionHostId: 'local', providerAccountId: null })
        ?.providerAccountId,
    ).toBeNull()
    expect(
      state.get({ executionHostId: 'local', providerAccountId: 'acct-a' }),
    ).toBeNull()
  })

  it('stops reporting a window that has already reset', () => {
    const clock = { value: new Date('2026-08-04T12:00:00.000Z') }
    const state = stateAt(clock)
    state.record(
      { executionHostId: 'local', providerAccountId: 'acct-a' },
      { ...OBSERVATION, resetsAt: '2026-08-04T13:00:00.000Z' },
    )

    expect(
      state.get({ executionHostId: 'local', providerAccountId: 'acct-a' }),
    ).not.toBeNull()

    clock.value = new Date('2026-08-04T13:00:01.000Z')
    expect(
      state.get({ executionHostId: 'local', providerAccountId: 'acct-a' }),
    ).toBeNull()
  })

  it('replaces a reading rather than accumulating history', () => {
    const state = stateAt({ value: new Date('2026-08-04T12:00:00.000Z') })
    const scope = { executionHostId: 'local', providerAccountId: 'acct-a' }
    state.record(scope, OBSERVATION)
    state.record(scope, { ...OBSERVATION, status: 'rejected' })

    expect(state.get(scope)?.status).toBe('rejected')
  })
})
