import { describe, expect, it } from 'vitest'
import { resolveAccountForAutomaticTurn } from './provider-account-automatic-turn.pure'
import type { AutomaticTurnAccount } from './provider-account-automatic-turn.pure'

function account(
  id: string,
  overrides: Partial<AutomaticTurnAccount> = {},
): AutomaticTurnAccount {
  return { id, isDefault: false, status: 'connected', ...overrides }
}

const WORK = account('work')
const PERSONAL = account('personal', { isDefault: true })

describe('resolveAccountForAutomaticTurn', () => {
  it('keeps a session on the account it last rode', () => {
    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'local',
        lastTurnAccountId: 'work',
        accounts: [WORK, PERSONAL],
      }),
    ).toBe('work')
  })

  it('falls back to the enrolled default when the session has no turns', () => {
    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'local',
        lastTurnAccountId: null,
        accounts: [WORK, PERSONAL],
      }),
    ).toBe('personal')
  })

  /** The bug this exists to kill: work quietly billed to whoever is signed in. */
  it('returns ambient only when there is no usable default', () => {
    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'local',
        lastTurnAccountId: null,
        accounts: [WORK],
      }),
    ).toBeNull()

    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'local',
        lastTurnAccountId: null,
        accounts: [],
      }),
    ).toBeNull()
  })

  it('never hands work to an unusable default', () => {
    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'local',
        lastTurnAccountId: null,
        accounts: [
          account('personal', { isDefault: true, status: 'unavailable' }),
        ],
      }),
    ).toBeNull()
  })

  /**
   * A deliberate divergence from the composer, which returns ambient here and
   * shows the user it did. An unattended hop has nobody to show.
   */
  it('prefers the default over ambient when the recorded account is gone', () => {
    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'local',
        lastTurnAccountId: 'deleted-account',
        accounts: [WORK, PERSONAL],
      }),
    ).toBe('personal')
  })

  it('moves off an inherited account that can no longer serve', () => {
    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'local',
        lastTurnAccountId: 'work',
        accounts: [account('work', { status: 'unavailable' }), PERSONAL],
      }),
    ).toBe('personal')
  })

  /**
   * Local account ids are meaningless on a remote host, and sending one trips
   * `assertLocalAccountSelection` -- the wire would break rather than degrade.
   */
  it('resolves a remote session to ambient, whatever it last rode', () => {
    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'remote',
        lastTurnAccountId: 'work',
        accounts: [WORK, PERSONAL],
      }),
    ).toBeNull()
  })

  it('treats any non-remote host as able to carry an account', () => {
    expect(
      resolveAccountForAutomaticTurn({
        executionHost: 'local',
        lastTurnAccountId: null,
        accounts: [PERSONAL],
      }),
    ).toBe('personal')
  })
})
