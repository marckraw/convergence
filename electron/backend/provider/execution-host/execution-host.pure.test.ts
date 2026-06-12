import { describe, expect, it } from 'vitest'
import { capabilitiesForProvider } from './execution-host.pure'

describe('capabilitiesForProvider', () => {
  it('maps provider fields and detects one-shot support', () => {
    expect(
      capabilitiesForProvider({
        id: 'p1',
        name: 'Provider One',
        supportsContinuation: true,
        oneShot: async () => ({ text: '' }),
      }),
    ).toEqual({
      providerId: 'p1',
      name: 'Provider One',
      supportsContinuation: true,
      supportsOneShot: true,
    })
  })

  it('reports missing one-shot support', () => {
    expect(
      capabilitiesForProvider({
        id: 'p2',
        name: 'Provider Two',
        supportsContinuation: false,
      }),
    ).toEqual({
      providerId: 'p2',
      name: 'Provider Two',
      supportsContinuation: false,
      supportsOneShot: false,
    })
  })
})
