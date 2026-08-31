import { describe, expect, it } from 'vitest'
import { resolveUserDataPath } from './user-data-path.pure'

describe('resolveUserDataPath', () => {
  it('keeps the default app userData path when no override is set', () => {
    expect(
      resolveUserDataPath({
        defaultPath: '/Users/example/Library/Application Support/Convergence',
      }),
    ).toBe('/Users/example/Library/Application Support/Convergence')
  })

  it('uses an explicit override when provided', () => {
    expect(
      resolveUserDataPath({
        defaultPath: '/Users/example/Library/Application Support/Convergence',
        override: '/tmp/convergence-alt',
      }),
    ).toBe('/tmp/convergence-alt')
  })

  it('ignores a blank override', () => {
    expect(
      resolveUserDataPath({
        defaultPath: '/Users/example/Library/Application Support/Convergence',
        override: '   ',
      }),
    ).toBe('/Users/example/Library/Application Support/Convergence')
  })
})
