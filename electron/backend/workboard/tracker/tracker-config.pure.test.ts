import { describe, expect, it } from 'vitest'
import {
  readConfigString,
  readConfigStringArray,
  requireConfigString,
} from './tracker-config.pure'

describe('tracker-config.pure', () => {
  it('reads strings from primary config before secondary config', () => {
    expect(
      readConfigString({ token: 'primary' }, { token: 'secondary' }, 'token'),
    ).toBe('primary')
    expect(readConfigString({}, { token: 'secondary' }, 'token')).toBe(
      'secondary',
    )
    expect(readConfigString({ token: '   ' }, {}, 'token')).toBeNull()
  })

  it('reads string arrays from primary config before secondary config', () => {
    expect(
      readConfigStringArray(
        { labels: ['convergence-loop'] },
        { labels: ['fallback'] },
        'labels',
      ),
    ).toEqual(['convergence-loop'])
    expect(
      readConfigStringArray({}, { labels: ['fallback'] }, 'labels'),
    ).toEqual(['fallback'])
  })

  it('throws a readable error for missing required config', () => {
    expect(() =>
      requireConfigString('Linear personal', {}, {}, 'token'),
    ).toThrow('Linear personal is missing required Workboard config: token')
  })
})
