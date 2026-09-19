import { describe, expect, it } from 'vitest'
import {
  loomCrewHasChoice,
  parseLoomCrew,
  resolveLoomCrew,
  serializeLoomCrew,
} from './wave-panel-crew.pure'

describe('MAR-3225 R2: the selection resolves safely', () => {
  it.each([
    ['stored valid', 'crew-2', ['crew-1', 'crew-2'], 'crew-2'],
    // Mutation: return the stored id without checking it is bound -> red.
    // A deleted or unbound crew must never leave Loom showing nothing.
    ['stored stale', 'crew-gone', ['crew-1', 'crew-2'], 'crew-1'],
    ['stored null', null, ['crew-1', 'crew-2'], 'crew-1'],
    ['no crews', 'crew-1', [], null],
    ['no crews, nothing stored', null, [], null],
  ] as const)('%s', (_case, stored, bound, expected) => {
    expect(resolveLoomCrew(stored, bound)).toBe(expected)
  })

  it('the first bound crew is the first in CREW order, not the stored one', () => {
    expect(resolveLoomCrew('crew-9', ['crew-3', 'crew-1'])).toBe('crew-3')
  })
})

describe('MAR-3225 R4: the choice round-trips through storage', () => {
  it('an id round-trips; nothing, or an empty string, is no choice', () => {
    expect(parseLoomCrew(serializeLoomCrew('crew-2'))).toBe('crew-2')
    expect(parseLoomCrew(null)).toBeNull()
    expect(parseLoomCrew('')).toBeNull()
  })
})

describe('MAR-3225 R3: a picker only when there is a choice', () => {
  it('one crew is a name; two are a choice', () => {
    // Mutation: `>= 1` -> one crew gets a control, red.
    expect(loomCrewHasChoice([])).toBe(false)
    expect(loomCrewHasChoice([{ id: 'crew-1', name: 'Loom' }])).toBe(false)
    expect(
      loomCrewHasChoice([
        { id: 'crew-1', name: 'Loom' },
        { id: 'crew-2', name: 'Night shift' },
      ]),
    ).toBe(true)
  })
})
