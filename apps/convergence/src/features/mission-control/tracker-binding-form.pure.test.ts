import { describe, expect, it } from 'vitest'
import {
  probeAsksForKey,
  probeTimeLabel,
  trackerProbeSentence,
} from './tracker-binding-form.pure'

const AT = '2026-09-17T08:04:00.000Z'

describe('MAR-3084 R9: what the last Test found', () => {
  it('counts issues, singular and plural', () => {
    expect(
      trackerProbeSentence({ probe: { ok: true, issues: 12 }, at: AT }),
    ).toBe('12 issues in project')
    expect(
      trackerProbeSentence({ probe: { ok: true, issues: 1 }, at: AT }),
    ).toBe('1 issue in project')
  })

  it('names a refusal, and only a refused key asks for the key again', () => {
    const refused = (kind: 'unauthorized' | 'unreachable') => ({
      probe: {
        ok: false as const,
        refusal: { kind, message: 'detail', retryAt: null },
      },
      at: AT,
    })
    expect(trackerProbeSentence(refused('unreachable'))).toBe(
      'Linear could not be reached — detail',
    )
    expect(probeAsksForKey(refused('unauthorized'))).toBe(true)
    expect(probeAsksForKey(refused('unreachable'))).toBe(false)
    expect(probeAsksForKey(null)).toBe(false)
  })

  it('shows an unreadable time as it came', () => {
    expect(probeTimeLabel('not a time')).toBe('not a time')
    expect(probeTimeLabel(AT)).toMatch(/\d/)
  })
})
