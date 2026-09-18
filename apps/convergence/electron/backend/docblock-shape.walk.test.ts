import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findAdjacentDocblocks } from './docblock-shape.pure'
import { WALK_TEST_TIMEOUT_MS } from '../../test/walk-budget'

/**
 * Every docblock in both trees documents something (MAR-3151 R2/R4).
 *
 * The tree at run time, never a list of files: the class this guards -- a
 * docblock displaced when a method was inserted above the function it
 * described -- arrives in files nobody has written yet, and a hand-kept list
 * would go stale exactly the way the thirteen flush blocks did.
 *
 * Its own file rather than beside the checker, because `walk-budget.test.ts`
 * keeps directory walks out of `*.pure.test.ts`: a repository-sized, load-
 * sensitive cost inside a module suite is how a walk becomes the test that
 * loses the race (MAR-2989).
 *
 * The expected set is EMPTY, with no exception list (lap 2, A): the two blocks
 * lap 1 would not guess at were ruled on -- each described something that no
 * longer existed, and both were deleted -- so there is nothing left for a list
 * to hold. An exception list that can never be empty is a second place for the
 * truth to live.
 */

const WORKSPACE = join(__dirname, '..', '..')

/**
 * The floor per tree, not across both (lap 2, C).
 *
 * `src` alone clears any union floor, so one number for the pair would let
 * `electron/backend` stop resolving -- a rename, a moved root -- while the
 * canary went on passing over half the repository. At `7e60df84` the scanned
 * counts were 356 and 627; these are floors, not targets.
 */
const TREES = [
  { path: 'electron/backend', floor: 200 },
  { path: 'src', floor: 400 },
] as const

/**
 * Files whose docblocks are not the repository's prose: tests and fixtures
 * (a fixture's header documents a recorded shape rather than a declaration),
 * declaration files and anything generated.
 */
function isScanned(file: string): boolean {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return false
  if (file.includes('node_modules')) return false
  if (/\.test\.|\.fixture\.|\.d\.ts$|\.generated\./.test(file)) return false
  return true
}

function sourcesUnder(tree: string): string[] {
  return readdirSync(join(WORKSPACE, tree), { recursive: true })
    .map(String)
    .filter(isScanned)
    .map((file) => `${tree}/${file}`)
}

/** Every docblock in one tree that documents another docblock. */
function orphansIn(tree: string): string[] {
  return sourcesUnder(tree).flatMap((file) =>
    findAdjacentDocblocks(readFileSync(join(WORKSPACE, file), 'utf8')).map(
      (line) => `${file}:${line}`,
    ),
  )
}

describe('MAR-3151 R4: no docblock in either tree documents another docblock', () => {
  it(
    'walks electron/backend and src',
    { timeout: WALK_TEST_TIMEOUT_MS },
    () => {
      for (const tree of TREES) {
        // The walk is load-bearing per TREE (lap 2, C): a tree that resolved
        // to nothing would pass this suite forever while the canary watched
        // half the repository.
        // Mutation: drop either floor, or match no file -> red here.
        expect(sourcesUnder(tree.path).length, tree.path).toBeGreaterThan(
          tree.floor,
        )
      }

      // Sorted before comparing (lap 2, D): `readdirSync` order is the
      // filesystem's, so an unsorted comparison would one day fail on the
      // order a machine enumerates in rather than on a defect.
      const orphans = TREES.flatMap((tree) => orphansIn(tree.path)).sort()

      // Mutation: move the MAR-2759 block back above
      // `redeliverHopForDispatch`, or restore either block lap 2 deleted ->
      // that line is listed here, red.
      expect(orphans).toEqual([])
    },
  )
})
