import { describe, expect, it } from 'vitest'
import type { CodexSpeedSnapshot } from '@/shared/types/codex-speed.types'
import {
  canonicalCodexSpeedId,
  codexSpeedAfterChange,
  codexSpeedChoices,
  isCodexSpeedOffered,
} from './codex-speed.pure'

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

const pro500: CodexSpeedSnapshot = {
  status: 'available',
  checkedAt: '2026-10-01T00:00:00.000Z',
  models: {
    'gpt-6-astra': { tiers: [FAST, ULTRAFAST], defaultTier: null },
    'gpt-6.1-sol': { tiers: [FAST], defaultTier: null },
    'gpt-5.5': { tiers: [], defaultTier: null },
  },
}

describe('the Codex speed choice (MAR-3574)', () => {
  it("R2: lists Standard, then exactly the model's tiers under Codex's names", () => {
    expect(
      codexSpeedChoices({
        snapshot: pro500,
        modelId: 'gpt-6-astra',
        selectedId: 'default',
      }),
    ).toEqual([
      { id: 'default', label: 'Standard', description: null },
      {
        id: 'priority',
        label: 'Fast',
        description: '2x speed, increased usage',
      },
      {
        id: 'ultrafast',
        label: 'Ultrafast',
        description: 'Up to 8x speed, highest usage',
      },
    ])
    expect(
      codexSpeedChoices({
        snapshot: pro500,
        modelId: 'gpt-6.1-sol',
        selectedId: 'default',
      }).map((choice) => choice.id),
    ).toEqual(['default', 'priority'])
    expect(
      codexSpeedChoices({
        snapshot: pro500,
        modelId: 'gpt-5.5',
        selectedId: 'default',
      }).map((choice) => choice.id),
    ).toEqual(['default'])
  })

  it('R2: an unread list offers nothing new, but never hides the tier already chosen', () => {
    for (const snapshot of [
      null,
      { status: 'warming-up', checkedAt: '' } as const,
      { status: 'unavailable', reason: 'x', checkedAt: '' } as const,
    ]) {
      expect(
        codexSpeedChoices({
          snapshot,
          modelId: 'gpt-6-astra',
          selectedId: 'default',
        }),
      ).toEqual([{ id: 'default', label: 'Standard', description: null }])
      expect(
        codexSpeedChoices({
          snapshot,
          modelId: 'gpt-6-astra',
          selectedId: 'fast',
        }),
      ).toEqual([
        { id: 'default', label: 'Standard', description: null },
        { id: 'priority', label: 'Fast', description: null },
      ])
    }
  })

  it('R2: a chosen tier the list does not offer stays visible and says so', () => {
    expect(
      codexSpeedChoices({
        snapshot: pro500,
        modelId: 'gpt-6.1-sol',
        selectedId: 'ultrafast',
      }),
    ).toEqual([
      { id: 'default', label: 'Standard', description: null },
      {
        id: 'priority',
        label: 'Fast',
        description: '2x speed, increased usage',
      },
      { id: 'ultrafast', label: 'Ultrafast (not offered)', description: null },
    ])
  })

  it("R3: the legacy fast is Codex's priority", () => {
    expect(canonicalCodexSpeedId('fast')).toBe('priority')
    expect(canonicalCodexSpeedId(null)).toBe('default')
    expect(canonicalCodexSpeedId('  ')).toBe('default')
    expect(isCodexSpeedOffered(pro500, 'gpt-6.1-sol', 'fast')).toBe(true)
  })

  it('R4: a tier the new model or account does not offer falls back to Standard; an unread list keeps it', () => {
    expect(
      codexSpeedAfterChange({
        snapshot: pro500,
        modelId: 'gpt-6.1-sol',
        currentId: 'ultrafast',
      }),
    ).toBe('default')
    expect(
      codexSpeedAfterChange({
        snapshot: pro500,
        modelId: 'gpt-6-astra',
        currentId: 'ultrafast',
      }),
    ).toBe('ultrafast')
    expect(
      codexSpeedAfterChange({
        snapshot: { status: 'warming-up', checkedAt: '' },
        modelId: 'gpt-6.1-sol',
        currentId: 'ultrafast',
      }),
    ).toBe('ultrafast')
  })
})
