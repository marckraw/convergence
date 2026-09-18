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
 * would go stale exactly the way the ten displaced blocks did.
 *
 * Its own file rather than beside the checker, because `walk-budget.test.ts`
 * keeps directory walks out of `*.pure.test.ts`: a repository-sized, load-
 * sensitive cost inside a module suite is how a walk becomes the test that
 * loses the race (MAR-2989).
 */

const WORKSPACE = join(__dirname, '..', '..')
const TREES = ['electron/backend', 'src']

/**
 * The two blocks this lap could not file, kept here rather than fixed by a
 * guess (MAR-3151, lap 1 STOP). Each one is a question for a person, and the
 * list is the place the answer lands:
 *
 * - `claude-code-provider.ts` — "Files Claude's own limit reading against the
 *   account serving this turn (ADR 0007, PA8)". No limit or quota function
 *   remains in that file, so the block describes something that moved or was
 *   removed; filing it above `noteMcpAuthFailure` would make it lie.
 * - `crew-settings-panel.presentational.tsx` — a one-line block above the
 *   MAR-3118 block that documents the SAME prop, `seatProblems`. The owner is
 *   not in doubt; the fix is a DELETION of superseded prose, which is the one
 *   thing this issue put out of scope.
 *
 * Shrinking only: a new entry here needs its own ruling, and the count below
 * is what makes adding one deliberate.
 */
const AWAITING_A_RULING = [
  'electron/backend/provider/claude-code/claude-code-provider.ts:1089',
  'src/features/mission-control/crew-settings-panel.presentational.tsx:72',
]

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

describe('MAR-3151 R4: no docblock in either tree documents another docblock', () => {
  it(
    'walks electron/backend and src',
    { timeout: WALK_TEST_TIMEOUT_MS },
    () => {
      const files = TREES.flatMap(sourcesUnder)
      // The walk itself is load-bearing: a tree that resolved to nothing
      // would pass this suite forever while the canary watched no files.
      expect(files.length).toBeGreaterThan(400)

      const orphans = files.flatMap((file) =>
        findAdjacentDocblocks(readFileSync(join(WORKSPACE, file), 'utf8')).map(
          (line) => `${file}:${line}`,
        ),
      )

      // Mutation: move the MAR-2759 block back above
      // `redeliverHopForDispatch` -> that line is listed here, red.
      expect(orphans).toEqual(AWAITING_A_RULING)
    },
  )

  it('the two blocks awaiting a ruling are still exactly where they were', () => {
    // A stale exception is worse than none: if somebody files one of these,
    // this case fails and the entry has to go. And the list may not quietly
    // grow -- a third orphan fails the walk above instead of joining it.
    expect(AWAITING_A_RULING).toHaveLength(2)
    for (const entry of AWAITING_A_RULING) {
      const [file, line] = entry.split(':')
      const source = readFileSync(join(WORKSPACE, file!), 'utf8')
      expect(findAdjacentDocblocks(source), entry).toContain(Number(line))
    }
  })
})
