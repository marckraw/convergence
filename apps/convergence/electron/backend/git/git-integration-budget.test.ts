import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { GIT_INTEGRATION_TEST_TIMEOUT_MS } from './git-integration-budget'

/**
 * The suites that drive a real `git` (MAR-2130, MAR-2248).
 *
 * Listed here rather than discovered, so adding a real-git suite without a
 * budget is a decision somebody makes on purpose. A new one that spawns git
 * and rides the 5s default is precisely the flake this pair of tickets was
 * filed for.
 */
const GIT_INTEGRATION_SUITES = [
  'git/git.service.test.ts',
  'workspace/workspace.service.test.ts',
]

const BACKEND_ROOT = join(__dirname, '..')

describe('the real-git time budget', () => {
  it('is patient enough to survive a loaded suite', () => {
    // The failing runs died at vitest's 5s default while the subprocess was
    // still working. Anything near that boundary would just move the flake.
    expect(GIT_INTEGRATION_TEST_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000)
  })

  it('is in force in every suite that spawns git', () => {
    // Guards the actual failure: a budget that exists in a constants file but
    // is not applied is indistinguishable from no budget at all.
    for (const suite of GIT_INTEGRATION_SUITES) {
      const source = readFileSync(join(BACKEND_ROOT, suite), 'utf8')

      expect(
        source.includes('GIT_INTEGRATION_TEST_TIMEOUT_MS'),
        `${suite} spawns git but does not spend the named budget`,
      ).toBe(true)
      expect(
        /describe\(\s*[\s\S]{0,80}?timeout:\s*GIT_INTEGRATION_TEST_TIMEOUT_MS/.test(
          source,
        ),
        `${suite} imports the budget but does not apply it to its suite`,
      ).toBe(true)
    }
  })

  it('keeps the budget local rather than raising it for everything', () => {
    // A global testTimeout would hide a genuine hang anywhere in ~290 files.
    const config = readFileSync(
      join(BACKEND_ROOT, '..', '..', 'vitest.pure.config.ts'),
      'utf8',
    )

    expect(config).not.toMatch(/testTimeout/)
  })
})
