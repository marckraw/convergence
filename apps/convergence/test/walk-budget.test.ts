import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from './walk-budget'

const WORKSPACE = fileURLToPath(new URL('../', import.meta.url))

/**
 * The tests that answer a question by reading a source tree (MAR-2989).
 *
 * Listed here rather than discovered, for the same reason the real-git budget
 * lists its suites: adding a walk without a budget should be a decision
 * somebody makes on purpose, and a discovery rule would have to guess which
 * `readdirSync` is a tree and which is one folder.
 */
const TREE_WALKING_TESTS = [
  'electron/backend/crew/ajv-import-guard.test.ts',
  'src/features/command-center/command-palette-orphans.test.ts',
  'workspace-import-ownership.test.ts',
  // This file's own sweep below reads every `*.pure.test.ts` in both trees.
  'test/walk-budget.test.ts',
]

/** The configs that run one of the walkers above. */
const CONFIGS_RUNNING_A_WALK = [
  'vitest.pure.config.ts',
  'vitest.unit.config.ts',
]

/** Enumerating a directory — the cost that grows with the repository. */
const DIRECTORY_ENUMERATION =
  /\breaddirSync\b|\breaddir\b|\bglobSync\b|\bopendirSync\b/

function pureModuleTests(directory: string): string[] {
  return readdirSync(directory, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.pure.test.ts'))
    .map((file) => join(directory, file))
}

describe('the tree-walk time budget', () => {
  it('is patient enough to survive a loaded suite', () => {
    // The recorded failures died at vitest's 5s default while the walk was
    // still reading. Anything near that boundary would just move the flake.
    expect(WALK_TEST_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000)
  })

  it('is in force in every test that walks a tree', () => {
    // Guards the actual failure: a budget that exists in a constants file but
    // is not applied is indistinguishable from no budget at all.
    for (const walker of TREE_WALKING_TESTS) {
      const source = readFileSync(join(WORKSPACE, walker), 'utf8')

      expect(
        source.includes('WALK_TEST_TIMEOUT_MS'),
        `${walker} walks a tree but does not spend the named budget`,
      ).toBe(true)
    }
  })

  it('leaves no inline walk timeout behind it', () => {
    // The literals MAR-2989 replaced: 30_000 in the AJV guard, 20_000 in the
    // import-ownership sweep. One name, one place, or the drift comes back.
    for (const walker of TREE_WALKING_TESTS) {
      const source = readFileSync(join(WORKSPACE, walker), 'utf8')

      expect(
        /timeout:\s*[0-9_]+|\}\s*,\s*[0-9_]{4,}\s*\)/.test(source),
        `${walker} still carries an inline timeout literal`,
      ).toBe(false)
    }
  })

  it(
    'keeps directory walks out of the tests named for pure modules',
    { timeout: WALK_TEST_TIMEOUT_MS },
    () => {
      // `*.pure.test.ts` is the test OF a `*.pure.ts` module — all 230 of them
      // sit beside the module they name. A directory walk filed in one buys
      // repository-sized, load-sensitive cost inside a module suite, which is
      // exactly how the AJV guard became the test that lost the race. Walks
      // belong in their own file, where what timed out is never in doubt.
      const walkers = ['src', 'electron']
        .flatMap((tree) => pureModuleTests(join(WORKSPACE, tree)))
        .filter((file) =>
          DIRECTORY_ENUMERATION.test(readFileSync(file, 'utf8')),
        )
        .map((file) => file.slice(WORKSPACE.length))

      expect(walkers).toEqual([])
    },
  )

  it('keeps the budget local rather than raising it for everything', () => {
    // A raised global default would hide a genuine hang anywhere in the suite.
    for (const config of CONFIGS_RUNNING_A_WALK) {
      expect(
        readFileSync(join(WORKSPACE, config), 'utf8'),
        `${config} raises the default for every test instead of the walks`,
      ).not.toMatch(/testTimeout/)
    }
  })
})
