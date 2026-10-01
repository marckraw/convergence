import { describe, expect, it } from 'vitest'
import {
  canonicalCodexTierId,
  isCodexTierOffered,
  mapCodexServiceTiers,
  type CodexServiceTiersSnapshot,
} from './codex-service-tiers.pure'

const FAST = {
  id: 'priority',
  name: 'Fast',
  description: '2x speed, increased usage',
}
const ULTRAFAST = {
  id: 'ultrafast',
  name: 'Ultrafast',
  description: 'Up to 8x speed, highest usage',
}

/** The relevant fields of the real 0.159.2 `model/list` records (MAR-3574). */
function record(model: string, serviceTiers: unknown[], extra = {}) {
  return {
    id: model,
    model,
    displayName: model,
    hidden: false,
    serviceTiers,
    defaultServiceTier: null,
    additionalSpeedTiers: ['fast'],
    isDefault: false,
    ...extra,
  }
}

/** A Pro account today: Fast on every GPT-6 model. */
const PRO = {
  data: [
    record('gpt-6.1-sol', [FAST], { isDefault: true }),
    record('gpt-6-astra', [FAST]),
  ],
}
/** A Pro $500 account: Astra adds Ultrafast. */
const PRO_500 = {
  data: [
    record('gpt-6.1-sol', [FAST]),
    record('gpt-6-astra', [FAST, ULTRAFAST]),
  ],
}

describe('mapCodexServiceTiers (MAR-3574 R1)', () => {
  it("keeps each model's tiers in Codex's order, under Codex's names", () => {
    expect(mapCodexServiceTiers(PRO_500.data)).toEqual({
      'gpt-6.1-sol': { tiers: [FAST], defaultTier: null },
      'gpt-6-astra': { tiers: [FAST, ULTRAFAST], defaultTier: null },
    })
  })

  it("keeps an account's default tier, and an empty list as an answer", () => {
    expect(
      mapCodexServiceTiers([
        record('gpt-6.1-sol', [FAST], { defaultServiceTier: 'priority' }),
        record('gpt-5.5', []),
        record('hidden-model', [FAST], { hidden: true }),
        { serviceTiers: [FAST] },
        record('odd', [{ id: 'default', name: 'Standard' }, { id: '' }]),
      ]),
    ).toEqual({
      'gpt-6.1-sol': { tiers: [FAST], defaultTier: 'priority' },
      'gpt-5.5': { tiers: [], defaultTier: null },
      odd: { tiers: [], defaultTier: null },
    })
  })

  it('reads the legacy fast as priority, and offers nothing from an unread list', () => {
    expect(canonicalCodexTierId('fast')).toBe('priority')
    expect(canonicalCodexTierId('ultrafast')).toBe('ultrafast')
    const available: CodexServiceTiersSnapshot = {
      status: 'available',
      models: mapCodexServiceTiers(PRO.data),
      checkedAt: '2026-10-01T00:00:00.000Z',
    }
    expect(isCodexTierOffered(available, 'gpt-6-astra', 'priority')).toBe(true)
    expect(isCodexTierOffered(available, 'gpt-6-astra', 'fast')).toBe(true)
    expect(isCodexTierOffered(available, 'gpt-6-astra', 'ultrafast')).toBe(
      false,
    )
    expect(isCodexTierOffered(available, 'gpt-6-astra', 'default')).toBe(true)
    expect(
      isCodexTierOffered(
        { status: 'unavailable', reason: 'x', checkedAt: '' },
        'gpt-6-astra',
        'priority',
      ),
    ).toBe(false)
  })
})
