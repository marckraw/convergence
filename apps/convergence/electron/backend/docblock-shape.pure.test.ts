import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findAdjacentDocblocks } from './docblock-shape.pure'

/**
 * The checker, shape by shape (MAR-3151 R2/R3).
 *
 * A table rather than a walk: this file is the test OF a pure module, and
 * `test/walk-budget.test.ts` keeps directory enumeration out of those. The
 * walk over both trees lives in `docblock-shape.walk.test.ts`.
 */

const WORKSPACE = join(__dirname, '..', '..')

describe('MAR-3151 R2: a docblock flush against a docblock documents nothing', () => {
  it('reports the offending block by its line', () => {
    // Mutation: ignore the following block (report only at EOF) -> [], red.
    expect(
      findAdjacentDocblocks(`const a = 1

/**
 * The first block, which describes nothing under it.
 */
/** The second block, which describes the function. */
export function work(): void {}
`),
    ).toEqual([3])
  })

  it('reports a one-line block above a one-line block', () => {
    expect(
      findAdjacentDocblocks(`const a = 1
/** One. */
/** Two. */
export const b = 2
`),
    ).toEqual([2])
  })

  it('reports every pair, not just the first', () => {
    expect(
      findAdjacentDocblocks(`const a = 1
/** One. */
/** Two. */
export function one(): void {}
/** Three. */
/** Four. */
export function two(): void {}
`),
    ).toEqual([2, 5])
  })

  it('reports the middle of three in a row', () => {
    // The stack `session.service.ts` carried: a note, then two displaced
    // blocks, then one method.
    expect(
      findAdjacentDocblocks(`const a = 1
/** One. */
/** Two. */
/** Three. */
export function one(): void {}
`),
    ).toEqual([2, 3])
  })

  it('says nothing about a block that documents a declaration', () => {
    expect(
      findAdjacentDocblocks(`const a = 1
/** A thing. */
export function thing(): void {}
`),
    ).toEqual([])
  })

  it('says nothing about a lone block at the end of a file', () => {
    // Nothing follows it, so there is nothing it is wrongly about. A block
    // documenting the void is a different, harmless mistake.
    expect(
      findAdjacentDocblocks('const a = 1\n/** Orphaned at EOF. */\n'),
    ).toEqual([])
  })

  it('does not run past an unterminated block', () => {
    expect(findAdjacentDocblocks('/** never closed\n * still going\n')).toEqual(
      [],
    )
  })
})

describe('MAR-3151 R3: the exemption is a blank line, and nothing else', () => {
  it('admits prose the author stood apart from what follows', () => {
    // Mutation: read through blank lines (the next NON-BLANK line) -> every
    // module note in both trees is reported, red here and in the walk.
    expect(
      findAdjacentDocblocks(`import type { A } from './a'

/**
 * What this module is, in one paragraph.
 */

/** The first declaration. */
export type Thing = A
`),
    ).toEqual([])
  })

  it('reports a block displaced to the TOP of a file', () => {
    // Mutation: exempt the first block in a file whatever follows it -> []
    // here, and `crew/crew.types.ts` -- which carried exactly this shape --
    // would have walked straight through the gate.
    expect(
      findAdjacentDocblocks(`import type { A } from './a'

/**
 * One member of a crew, and the short name a baton addresses it by.
 */
/** What a seat is for. */
export type Role = A
`),
    ).toEqual([3])
  })

  it('reports a flush note even above a documented TYPE', () => {
    // Mutation: exempt a first block whose pair documents a type or an
    // interface -> [] here. That rule was measured against the trees and it
    // admitted fourteen notes above documented FUNCTIONS while waving the
    // shape above through; the blank line is what the authors actually used.
    expect(
      findAdjacentDocblocks(`/**
 * What this module is.
 */
/** The first declaration. */
export interface Thing {
  a: number
}
`),
    ).toEqual([1])
  })

  it('the two recorded module notes pass, read from the files themselves', () => {
    // Artifact, not intent: the real heads, not a paraphrase of them.
    for (const file of [
      'electron/backend/relay/relay.engine.test.ts',
      'src/shared/types/tracker.types.ts',
    ]) {
      expect(
        findAdjacentDocblocks(readFileSync(join(WORKSPACE, file), 'utf8')),
        file,
      ).toEqual([])
    }
  })

  it('the MAR-2759 block documents `markDispatchesTerminated` (R1)', () => {
    const source = readFileSync(
      join(WORKSPACE, 'electron/backend/relay/relay.service.ts'),
      'utf8',
    )
    // Mutation: put the block back above `redeliverHopForDispatch`'s own ->
    // this file reports a line, red.
    expect(findAdjacentDocblocks(source)).toEqual([])
    expect(source).toMatch(
      /ended without a settle \(MAR-2759\)[\s\S]*?\*\/\n {2}markDispatchesTerminated\(/,
    )
  })
})
