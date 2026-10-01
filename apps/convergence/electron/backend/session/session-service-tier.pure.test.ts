import { describe, expect, it } from 'vitest'
import {
  CODEX_STANDARD_SERVICE_TIER,
  describeServiceTierRefusal,
  parseServiceTierInput,
  serviceTierForProviderStart,
} from './session-service-tier.pure'

describe('session service tier (MAR-3572)', () => {
  it('accepts Codex tier ids and refuses anything else', () => {
    expect(parseServiceTierInput('fast')).toBe('fast')
    expect(parseServiceTierInput(' default ')).toBe('default')
    // Codex's own ids (MAR-3574): whether the account offers one is asked by
    // the app layer, not by the shape check.
    expect(parseServiceTierInput('priority')).toBe('priority')
    expect(parseServiceTierInput('ultrafast')).toBe('ultrafast')
    for (const bad of [
      '',
      '  ',
      'Fast',
      'fast mode',
      'x'.repeat(40),
      7,
      null,
    ]) {
      expect(() => parseServiceTierInput(bad)).toThrow(/Unknown speed tier/)
    }
  })

  it('refuses a tier change off Codex and off this Mac', () => {
    expect(
      describeServiceTierRefusal({
        providerId: 'codex',
        executionHost: 'local',
      }),
    ).toBeNull()
    expect(
      describeServiceTierRefusal({ providerId: 'codex', executionHost: null }),
    ).toBeNull()
    expect(
      describeServiceTierRefusal({
        providerId: 'codex',
        executionHost: '9281802b-e7d8-43ac-b6a3-f0062a7d809d',
      }),
    ).toBe("A remote conversation's speed can't be changed from this app.")
    expect(
      describeServiceTierRefusal({
        providerId: 'claude-code',
        executionHost: 'local',
      }),
    ).toBe('Only Codex conversations have a speed setting.')
  })

  it('a local Codex start always states a tier: the stored one, else Standard', () => {
    expect(
      serviceTierForProviderStart({
        providerId: 'codex',
        executionHost: 'local',
        serviceTier: null,
      }),
    ).toBe(CODEX_STANDARD_SERVICE_TIER)
    expect(
      serviceTierForProviderStart({
        providerId: 'codex',
        executionHost: 'local',
        serviceTier: 'fast',
      }),
    ).toBe('fast')
  })

  it('a blank stored tier is not a tier: the start states Standard', () => {
    expect(
      serviceTierForProviderStart({
        providerId: 'codex',
        executionHost: 'local',
        serviceTier: '  ',
      }),
    ).toBe(CODEX_STANDARD_SERVICE_TIER)
  })

  it('remote sessions and other providers carry exactly what they stored', () => {
    expect(
      serviceTierForProviderStart({
        providerId: 'codex',
        executionHost: '9281802b-e7d8-43ac-b6a3-f0062a7d809d',
        serviceTier: null,
      }),
    ).toBeNull()
    expect(
      serviceTierForProviderStart({
        providerId: 'claude-code',
        executionHost: 'local',
        serviceTier: null,
      }),
    ).toBeNull()
  })
})
