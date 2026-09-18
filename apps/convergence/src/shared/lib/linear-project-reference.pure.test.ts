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
    [
      'a URL the address bar handed over without its scheme',
      'linear.app/marckraw/project/convergence-f66c7ae332ee',
      { kind: 'slugId', value: 'f66c7ae332ee' },
    ],
    [
      'the same with www',
      'www.linear.app/marckraw/project/convergence-f66c7ae332ee',
      { kind: 'slugId', value: 'f66c7ae332ee' },
    ],
    [
      'a project segment that is the slug id alone',
      'https://linear.app/marckraw/project/f66c7ae332ee',
      { kind: 'slugId', value: 'f66c7ae332ee' },
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
    const asName = (raw: string) =>
      expect(parseLinearProjectReference(raw)).toEqual({
        kind: 'name',
        value: raw,
      })

    asName('https://linear.app/marckraw/project/')
    // Half a copied URL: nothing after the last hyphen is not an id, and
    // asking Linear about "" comes back empty and reads as "no such project".
    // Mutation: return the empty tail as a slug id -> a lookup for nothing.
    asName('https://linear.app/marckraw/project/convergence-')
  })

  it('lap 2, B: a slug id only ever comes from Linear’s own host', () => {
    // Mutation: drop the host check -> somebody else's site with Linear's
    // path shape sends a slug-id lookup to Linear, red here.
    expect(
      parseLinearProjectReference('https://example.com/project/foo-deadbeef'),
    ).toEqual({
      kind: 'name',
      value: 'https://example.com/project/foo-deadbeef',
    })
    // A subdomain of Linear's is still Linear's.
    expect(
      parseLinearProjectReference(
        'https://eu.linear.app/marckraw/project/convergence-f66c7ae332ee',
      ),
    ).toEqual({ kind: 'slugId', value: 'f66c7ae332ee' })
  })

  it('lap 2, B: only an http(s) link is a link to a project', () => {
    // The input where the protocol check is the ONLY thing standing: these
    // carry Linear's own host, so the host check waves them through and a
    // `file:` URL (whose host is empty) would not tell the two guards apart.
    // Mutation: drop the protocol check -> both read as a slug id, red.
    for (const raw of [
      'ftp://linear.app/marckraw/project/convergence-f66c7ae332ee',
      'ws://linear.app/marckraw/project/convergence-f66c7ae332ee',
    ]) {
      expect(parseLinearProjectReference(raw)).toEqual({
        kind: 'name',
        value: raw,
      })
    }
    // And one with no host at all: the protocol check meets it first, so it
    // is a witness for neither guard alone.
    expect(
      parseLinearProjectReference(
        'file:///linear.app/marckraw/project/convergence-f66c7ae332ee',
      ),
    ).toMatchObject({ kind: 'name' })
  })
})
