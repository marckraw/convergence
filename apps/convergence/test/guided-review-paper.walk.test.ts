import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from './walk-budget'

/**
 * Code review left Convergence in MAR-2609 and lives in Codewalk. The code went
 * clean; the paper did not — a repo skill kept naming
 * `preferredGuidedReviewModelId()` for months after it stopped existing, and a
 * groomer trusted it (MAR-3317). This walk keeps the agent-facing paper from
 * regrowing: no file under `.codex/skills/` or `docs/specs/` may mention
 * guided review again.
 *
 * The pattern covers `guided-review`, `guidedReview`,
 * `preferredGuidedReviewModelId`, `guided review` and `guided_review`. ADRs and
 * the changelog are dated history and deliberately sit outside the walk.
 */
const GUIDED_REVIEW = /guided[-_ ]?review/i

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..')
const SKILL_FILE = resolve(
  REPO_ROOT,
  '.codex/skills/update-convergence-provider-models/SKILL.md',
)

function walk(directory: string, files: string[]): void {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (entry.isFile()) files.push(path)
  }
}

it(
  'keeps guided review out of the repo skills and specs',
  { timeout: WALK_TEST_TIMEOUT_MS },
  () => {
    const files: string[] = []
    walk(resolve(REPO_ROOT, '.codex/skills'), files)
    // `docs/specs/` may be empty and therefore absent from a checkout.
    walk(resolve(REPO_ROOT, 'docs/specs'), files)

    // A walk rooted at the wrong folder reads nothing and passes; prove it
    // reached the skill that carried the stale names.
    expect(files).toContain(SKILL_FILE)

    const mentions = files
      .filter((file) => GUIDED_REVIEW.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file))

    expect(mentions).toEqual([])
  },
)
