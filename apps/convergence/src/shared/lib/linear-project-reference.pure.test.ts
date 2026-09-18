import { describe, expect, it } from 'vitest'
import { parseLinearProjectReference } from './linear-project-reference.pure'

const UUID = '4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f'

/**
 * What a person can paste into the Project field (MAR-3156 R1), and what the
 * app makes of it. The three kinds are three different reads, so telling them
 * apart is the whole decision.
 */
describe('MAR-3156 R1: three ways into one project', () => {
  it.each([
    ['a UUID', UUID, { kind: 'id', value: UUID }],
    [
      'a project URL',
      'https://linear.app/marckraw/project/convergence-0a1b2c3d4e5f',
      { kind: 'slugId', value: '0a1b2c3d4e5f' },
    ],
    [
      'a URL with a tab after it',
      'https://linear.app/marckraw/project/convergence-0a1b2c3d4e5f/overview',
      { kind: 'slugId', value: '0a1b2c3d4e5f' },
    ],
    [
      'a URL with a query',
      'https://linear.app/marckraw/project/convergence-0a1b2c3d4e5f?x=1',
      { kind: 'slugId', value: '0a1b2c3d4e5f' },
    ],
    [
      'a URL whose slug has hyphens of its own',
      'https://linear.app/marckraw/project/the-loom-era-9f8e7d6c5b4a',
      { kind: 'slugId', value: '9f8e7d6c5b4a' },
    ],
    ['a name', 'convergence', { kind: 'name', value: 'convergence' }],
    [
      'a padded name',
      '  Convergence  ',
      { kind: 'name', value: 'Convergence' },
    ],
    [
      'a name that looks like a URL but is not a project one',
      'https://linear.app/marckraw/issue/MAR-3156',
      { kind: 'name', value: 'https://linear.app/marckraw/issue/MAR-3156' },
    ],
  ])('%s -> %o', (_case, raw, expected) => {
    // Mutation: take the whole last path segment as the slug id -> the
    // `/overview` case reads `overview` and reaches nothing, red.
    expect(parseLinearProjectReference(raw)).toEqual(expected)
  })

  it.each([
    ['nothing', ''],
    ['whitespace', '   '],
  ])('%s -> no reference to resolve', (_case, raw) => {
    // Refused here rather than sent: an empty lookup would ask Linear about
    // nothing and read its empty answer as "no project answers to that".
    expect(parseLinearProjectReference(raw)).toBeNull()
  })

  it('a URL with no slug id at all is a name, not half a lookup', () => {
    expect(
      parseLinearProjectReference('https://linear.app/marckraw/project/'),
    ).toEqual({
      kind: 'name',
      value: 'https://linear.app/marckraw/project/',
    })
    // A segment with no hyphen carries no id: the slug IS the whole segment.
    expect(
      parseLinearProjectReference('https://linear.app/marckraw/project/loom'),
    ).toEqual({
      kind: 'name',
      value: 'https://linear.app/marckraw/project/loom',
    })
  })
})
