import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'

/**
 * MAR-2981 R15. No source file says the app cannot automatically start a
 * ready ticket. The sentence is joined at runtime so this file does not
 * contain it.
 *
 * Its own walk file (MAR-3385): the read is the whole `src/` tree, and
 * inside the rendered suite it was the test that lost the race on a busy
 * machine. It spends the shared walk budget.
 */
it(
  'MAR-2981 R15 no source says the app cannot automatically start a ready ticket',
  { timeout: WALK_TEST_TIMEOUT_MS },
  () => {
    const root = resolve(import.meta.dirname, '../..')
    const old = ['does not automatically', 'start a ready ticket'].join(' ')
    const files = readdirSync(root, {
      recursive: true,
      withFileTypes: true,
    }).filter((f) => f.isFile() && /\.tsx?$/.test(f.name))
    expect(
      files
        .filter((f) =>
          readFileSync(resolve(f.parentPath, f.name), 'utf8').includes(old),
        )
        .map((f) => f.name),
    ).toEqual([])
  },
)
