import { describe, expect, it } from 'vitest'
import {
  PI_AGENT_SETTLED_MIN_VERSION,
  piSupportsAgentSettled,
} from './pi-version.pure'

describe('piSupportsAgentSettled', () => {
  it('accepts the floor version itself and anything newer', () => {
    expect(piSupportsAgentSettled(PI_AGENT_SETTLED_MIN_VERSION)).toBe(true)
    expect(piSupportsAgentSettled('0.80.4')).toBe(true)
    expect(piSupportsAgentSettled('0.80.5')).toBe(true)
    expect(piSupportsAgentSettled('0.82.1')).toBe(true)
    expect(piSupportsAgentSettled('1.0.0')).toBe(true)
  })

  it('rejects anything below the floor', () => {
    expect(piSupportsAgentSettled('0.80.3')).toBe(false)
    expect(piSupportsAgentSettled('0.79.10')).toBe(false)
    expect(piSupportsAgentSettled('0.9.0')).toBe(false)
  })

  // A hang is worse than an early settle, so anything we cannot read counts
  // as too old.
  it('treats an unreadable version as too old', () => {
    expect(piSupportsAgentSettled(null)).toBe(false)
    expect(piSupportsAgentSettled(undefined)).toBe(false)
    expect(piSupportsAgentSettled('')).toBe(false)
    expect(piSupportsAgentSettled('   ')).toBe(false)
    expect(piSupportsAgentSettled('not-a-version')).toBe(false)
    expect(piSupportsAgentSettled('0.80')).toBe(false)
  })

  it('reads a version out of a decorated CLI version line', () => {
    expect(piSupportsAgentSettled('pi 0.82.1')).toBe(true)
    expect(piSupportsAgentSettled('pi 0.79.10')).toBe(false)
  })

  it('treats a prerelease of the floor as below it', () => {
    expect(piSupportsAgentSettled('0.80.4-beta.1')).toBe(false)
  })
})
